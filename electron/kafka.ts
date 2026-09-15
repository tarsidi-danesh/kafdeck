import { AssignerProtocol, Kafka, logLevel, type Admin, type Consumer, type Producer, type SASLOptions } from 'kafkajs'
import { randomUUID } from 'node:crypto'
import { createSocketFactory } from './net'
import type {
  ClusterInfo,
  ConnectionConfig,
  ConsumeRequest,
  ConsumerGroupInfo,
  CreateTopicRequest,
  KafkaRecord,
  ProduceRequest,
  ProduceResult,
  TopicInfo,
} from '../shared/types'

function decodeBuffer(buf?: Buffer | null): { text: string; encoding: 'utf8' | 'hex' | 'empty' } {
  if (!buf || buf.length === 0) return { text: '', encoding: 'empty' }
  const text = buf.toString('utf8')
  if (text.includes('\uFFFD')) return { text: buf.toString('hex'), encoding: 'hex' }
  return { text, encoding: 'utf8' }
}

function saslFrom(config: ConnectionConfig): SASLOptions | undefined {
  if (!config.sasl?.username) return undefined
  return {
    mechanism: config.sasl.mechanism,
    username: config.sasl.username,
    password: config.sasl.password,
  }
}

// kafkajs reports the underlying failure as "Connection error: <cause>" nested in a
// retry wrapper, which reads as though the app is at fault. Name what to fix instead.
function connectionError(error: unknown, config: ConnectionConfig): Error {
  const seen = new Set<unknown>()
  let raw = String(error)
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const candidate = current as { message?: string; cause?: unknown; originalError?: unknown }
    if (candidate.message) raw = candidate.message
    current = candidate.cause ?? candidate.originalError
  }

  const servers = config.brokers.join(', ')
  const unresolved = /(?:ENOTFOUND|EAI_AGAIN)\s+(\S+)/.exec(raw)?.[1]
  const explain = (detail: string) => {
    const wrapped = new Error(detail)
    wrapped.cause = error
    return wrapped
  }

  if (unresolved) {
    return explain(
      `Could not resolve "${unresolved}". The name did not resolve on this machine, so no broker was reachable. ` +
        `Check that the VPN is connected and that DNS can resolve the host.`,
    )
  }
  if (/ECONNREFUSED/.test(raw)) {
    return explain(`Connection refused by ${servers}. The host is reachable but nothing is listening on that port.`)
  }
  if (/ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|timeout/i.test(raw)) {
    return explain(`Timed out reaching ${servers}. A firewall or a missing VPN route is likely blocking the port.`)
  }
  if (/SASL|authenticat/i.test(raw)) {
    return explain(`Authentication failed on ${servers}. Check the SASL mechanism, username and password. (${raw})`)
  }
  if (/self.signed|unable to verify|CERT_|DEPTH_ZERO/i.test(raw)) {
    return explain(`The broker's TLS certificate was rejected. Turn off "Verify certificate" or trust the cluster CA.`)
  }
  if (!config.ssl && /ECONNRESET|EPROTO|wrong version number|packet length/i.test(raw)) {
    return explain(`Connection reset by ${servers}. The broker probably requires TLS — enable SSL for this connection.`)
  }
  if (config.ssl && /ECONNRESET|EPROTO|before secure TLS connection/i.test(raw)) {
    return explain(`TLS handshake failed with ${servers}. The listener is probably PLAINTEXT — try turning SSL off.`)
  }
  return explain(raw)
}

export class KafkaManager {
  private kafka: Kafka | null = null
  private admin: Admin | null = null
  private producer: Producer | null = null
  private liveConsumer: Consumer | null = null
  current: ConnectionConfig | null = null

  async connect(config: ConnectionConfig) {
    await this.disconnect()
    const kafka = new Kafka({
      clientId: config.clientId || 'kafdeck',
      brokers: config.brokers,
      ssl: config.ssl ? { rejectUnauthorized: config.rejectUnauthorized } : false,
      sasl: saslFrom(config),
      socketFactory: createSocketFactory(),
      connectionTimeout: 8000,
      requestTimeout: 15000,
      retry: { retries: 3, initialRetryTime: 300 },
      logLevel: logLevel.ERROR,
    })
    const admin = kafka.admin()
    const producer = kafka.producer()
    try {
      await admin.connect()
      await producer.connect()
    } catch (error) {
      await admin.disconnect().catch(() => undefined)
      await producer.disconnect().catch(() => undefined)
      throw connectionError(error, config)
    }
    this.kafka = kafka
    this.admin = admin
    this.producer = producer
    this.current = config
  }

  async test(config: ConnectionConfig) {
    const kafka = new Kafka({
      clientId: config.clientId || 'kafdeck-test',
      brokers: config.brokers,
      ssl: config.ssl ? { rejectUnauthorized: config.rejectUnauthorized } : false,
      sasl: saslFrom(config),
      socketFactory: createSocketFactory(),
      connectionTimeout: 8000,
      requestTimeout: 10000,
      // A person is waiting on this one, so surface the reason instead of retrying.
      retry: { retries: 1, initialRetryTime: 300 },
      logLevel: logLevel.NOTHING,
    })
    const admin = kafka.admin()
    try {
      await admin.connect()
      const cluster = await admin.describeCluster()
      return {
        clusterId: cluster.clusterId,
        brokers: cluster.brokers.length,
      }
    } catch (error) {
      throw connectionError(error, config)
    } finally {
      await admin.disconnect().catch(() => undefined)
    }
  }

  async disconnect() {
    await this.stopLive()
    const tasks: Promise<unknown>[] = []
    if (this.producer) tasks.push(this.producer.disconnect().catch(() => undefined))
    if (this.admin) tasks.push(this.admin.disconnect().catch(() => undefined))
    await Promise.all(tasks)
    this.producer = null
    this.admin = null
    this.kafka = null
    this.current = null
  }

  private requireAdmin() {
    if (!this.admin) throw new Error('Not connected to a cluster')
    return this.admin
  }

  private requireKafka() {
    if (!this.kafka) throw new Error('Not connected to a cluster')
    return this.kafka
  }

  private requireProducer() {
    if (!this.producer) throw new Error('Not connected to a cluster')
    return this.producer
  }

  async cluster(): Promise<ClusterInfo> {
    const described = await this.requireAdmin().describeCluster()
    return {
      clusterId: described.clusterId,
      controllerId: described.controller ?? null,
      brokers: described.brokers.map((broker) => ({
        nodeId: broker.nodeId,
        host: broker.host,
        port: broker.port,
      })),
    }
  }

  async topics(): Promise<TopicInfo[]> {
    const admin = this.requireAdmin()
    const names = (await admin.listTopics()).filter((name) => !name.startsWith('__'))
    if (names.length === 0) return []
    const metadata = await admin.fetchTopicMetadata({ topics: names })
    const infos: TopicInfo[] = await Promise.all(
      metadata.topics.map(async (topic) => {
      const offsets = await admin.fetchTopicOffsets(topic.name).catch(() => [])
      const offsetMap = new Map(offsets.map((item) => [item.partition, item]))
      const partitionDetails = topic.partitions.map((partition) => {
        const offset = offsetMap.get(partition.partitionId)
        return {
          partition: partition.partitionId,
          leader: partition.leader,
          replicas: partition.replicas,
          isr: partition.isr,
          low: offset?.low ?? '0',
          high: offset?.high ?? '0',
        }
      })
      const replicationFactor = topic.partitions[0]?.replicas.length ?? 0
      const underReplicated = partitionDetails.filter((item) => item.isr.length < item.replicas.length).length
      const messageCount = partitionDetails.reduce((sum, item) => {
        const high = Number(item.high)
        const low = Number(item.low)
        return sum + Math.max(0, high - low)
      }, 0)
      return {
        name: topic.name,
        partitions: topic.partitions.length,
        replicationFactor,
        underReplicated,
        messageCount,
        partitionDetails,
      }
      }),
    )
    return infos.sort((a, b) => a.name.localeCompare(b.name))
  }

  async createTopic(request: CreateTopicRequest) {
    const created = await this.requireAdmin().createTopics({
      topics: [
        {
          topic: request.name,
          numPartitions: request.partitions,
          replicationFactor: request.replicationFactor,
        },
      ],
      waitForLeaders: true,
    })
    if (!created) throw new Error(`Topic "${request.name}" already exists`)
  }

  async deleteTopic(name: string) {
    await this.requireAdmin().deleteTopics({ topics: [name], timeout: 10000 })
  }

  async produce(request: ProduceRequest): Promise<ProduceResult> {
    const headers: Record<string, string> = {}
    for (const header of request.headers ?? []) {
      if (header.key) headers[header.key] = header.value
    }
    const result = await this.requireProducer().send({
      topic: request.topic,
      messages: [
        {
          key: request.key || null,
          value: request.value ?? '',
          partition: request.partition,
          headers,
        },
      ],
    })
    const first = result[0]
    return {
      topic: first.topicName,
      partition: first.partition,
      offset: first.baseOffset ?? '0',
      timestamp: first.logAppendTime ?? String(Date.now()),
    }
  }

  async consume(request: ConsumeRequest): Promise<KafkaRecord[]> {
    const admin = this.requireAdmin()
    const kafka = this.requireKafka()
    const limit = request.limit ?? 50
    const timeoutMs = request.timeoutMs ?? 8000
    const offsets = await admin.fetchTopicOffsets(request.topic)
    const partitions = offsets.filter(
      (item) => request.partition == null || item.partition === request.partition,
    )
    if (partitions.length === 0) return []

    const consumer = kafka.consumer({
      groupId: `kafdeck-browse-${randomUUID()}`,
      maxWaitTimeInMs: 500,
    })
    await consumer.connect()
    await consumer.subscribe({
      topic: request.topic,
      fromBeginning: request.from === 'beginning',
    })

    const records: KafkaRecord[] = []
    let resolveDone: () => void = () => undefined
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve
    })
    const timer = setTimeout(() => resolveDone(), timeoutMs)

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        if (request.partition != null && partition !== request.partition) return
        records.push(toRecord(topic, partition, message))
        if (records.length >= limit) {
          clearTimeout(timer)
          resolveDone()
        }
      },
    })

    for (const item of partitions) {
      const high = Number(item.high)
      const low = Number(item.low)
      let start = low
      if (request.from === 'beginning') {
        start = low
      } else if (request.from === 'offset' && request.offset != null) {
        start = Number(request.offset)
      } else {
        const perPartition = Math.max(1, Math.ceil(limit / partitions.length))
        start = Math.max(low, high - perPartition)
      }
      if (start >= high) continue
      consumer.seek({ topic: request.topic, partition: item.partition, offset: String(start) })
    }

    await done
    clearTimeout(timer)
    await consumer.stop().catch(() => undefined)
    await consumer.disconnect().catch(() => undefined)
    return records
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp) || Number(b.offset) - Number(a.offset))
      .slice(0, limit)
  }

  async groups(): Promise<ConsumerGroupInfo[]> {
    const admin = this.requireAdmin()
    const listed = await admin.listGroups()
    const ids = listed.groups
      .map((group) => group.groupId)
      .filter((id) => !id.startsWith('kafdeck-browse-') && !id.startsWith('kafdeck-live-'))
    if (ids.length === 0) return []
    const described = await admin.describeGroups(ids)
    const infos: ConsumerGroupInfo[] = []
    for (const group of described.groups) {
      const offsets = await admin
        .fetchOffsets({ groupId: group.groupId, resolveOffsets: true })
        .catch(() => [])
      const mapped = await this.withLag(offsets)
      infos.push({
        groupId: group.groupId,
        state: group.state,
        protocol: group.protocol,
        protocolType: group.protocolType,
        members: group.members.map((member) => ({
          memberId: member.memberId,
          clientId: member.clientId,
          clientHost: member.clientHost,
          assignments: parseAssignment(member.memberAssignment),
        })),
        offsets: mapped,
        lag: mapped.reduce((sum, item) => sum + item.lag, 0),
      })
    }
    return infos.sort((a, b) => a.groupId.localeCompare(b.groupId))
  }

  private async withLag(
    offsets: Array<{ topic: string; partitions: Array<{ partition: number; offset: string }> }>,
  ) {
    const admin = this.requireAdmin()
    const result: ConsumerGroupInfo['offsets'] = []
    for (const topic of offsets) {
      const highs = await admin.fetchTopicOffsets(topic.topic).catch(() => [])
      const highMap = new Map(highs.map((item) => [item.partition, item.high]))
      for (const partition of topic.partitions) {
        const high = highMap.get(partition.partition) ?? partition.offset
        const committed = Number(partition.offset)
        const highNum = Number(high)
        result.push({
          topic: topic.topic,
          partition: partition.partition,
          offset: partition.offset,
          high,
          lag: Number.isFinite(committed) && Number.isFinite(highNum) ? Math.max(0, highNum - committed) : 0,
        })
      }
    }
    return result
  }

  async startLive(topic: string, onMessage: (record: KafkaRecord) => void) {
    await this.stopLive()
    const consumer = this.requireKafka().consumer({
      groupId: `kafdeck-live-${randomUUID()}`,
    })
    await consumer.connect()
    await consumer.subscribe({ topic, fromBeginning: false })
    this.liveConsumer = consumer
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic: name, partition, message }) => {
        onMessage(toRecord(name, partition, message))
      },
    })
  }

  async stopLive() {
    if (!this.liveConsumer) return
    const consumer = this.liveConsumer
    this.liveConsumer = null
    await consumer.stop().catch(() => undefined)
    await consumer.disconnect().catch(() => undefined)
  }
}

function toRecord(
  topic: string,
  partition: number,
  message: {
    offset: string
    timestamp: string
    key: Buffer | null
    value: Buffer | null
    headers?: Record<string, Buffer | string | (Buffer | string)[] | undefined>
    size?: number
  },
): KafkaRecord {
  const key = decodeBuffer(message.key)
  const value = decodeBuffer(message.value)
  const headers: KafkaRecord['headers'] = []
  for (const [headerKey, headerValue] of Object.entries(message.headers ?? {})) {
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue
    headers.push({
      key: headerKey,
      value: Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? ''),
    })
  }
  return {
    topic,
    partition,
    offset: message.offset,
    timestamp: message.timestamp,
    key: key.text,
    keyEncoding: key.encoding,
    value: value.text,
    valueEncoding: value.encoding,
    headers,
    size: message.value?.length ?? 0,
  }
}

function parseAssignment(assignment: Buffer | string | undefined): Array<{ topic: string; partitions: number[] }> {
  if (!assignment || typeof assignment === 'string') return []
  try {
    const decoded = AssignerProtocol.MemberAssignment.decode(assignment)
    if (!decoded?.assignment) return []
    return Object.entries(decoded.assignment).map(([topic, partitions]) => ({ topic, partitions }))
  } catch {
    return []
  }
}
