export type SaslMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512'

export type ConnectionConfig = {
  id: string
  name: string
  brokers: string[]
  clientId: string
  ssl: boolean
  rejectUnauthorized: boolean
  sasl?: {
    mechanism: SaslMechanism
    username: string
    password: string
  }
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export type BrokerInfo = {
  nodeId: number
  host: string
  port: number
}

export type ClusterInfo = {
  clusterId: string
  controllerId: number | null
  brokers: BrokerInfo[]
}

export type TopicInfo = {
  name: string
  partitions: number
  replicationFactor: number
  underReplicated: number
  messageCount: number
  partitionDetails: Array<{
    partition: number
    leader: number
    replicas: number[]
    isr: number[]
    low: string
    high: string
  }>
}

export type KafkaRecord = {
  topic: string
  partition: number
  offset: string
  timestamp: string
  key: string
  keyEncoding: 'utf8' | 'hex' | 'empty'
  value: string
  valueEncoding: 'utf8' | 'hex' | 'empty'
  headers: Array<{ key: string; value: string }>
  size: number
}

export type ConsumeRequest = {
  topic: string
  limit?: number
  from?: 'latest' | 'beginning' | 'offset'
  offset?: string
  partition?: number
  timeoutMs?: number
}

export type ProduceRequest = {
  topic: string
  key?: string
  value: string
  partition?: number
  headers?: Array<{ key: string; value: string }>
}

export type ProduceResult = {
  topic: string
  partition: number
  offset: string
  timestamp: string
}

export type CsvFile = {
  path: string
  name: string
  size: number
}

export type CsvPreview = {
  delimiter: string
  rows: string[][]
  columnCount: number
  totalRows: number
  truncated: boolean
}

/** Columns are referenced by index so duplicate or blank header names stay unambiguous. */
export type CsvProduceRequest = {
  path: string
  delimiter: string
  topic: string
  hasHeader: boolean
  /** 'row-json' builds an object from every column; 'column' sends one column verbatim. */
  valueMode: 'row-json' | 'column'
  valueColumn?: number
  keyColumn?: number
  partitionColumn?: number
  headerColumns?: number[]
  skipEmptyRows: boolean
}

export type CsvProduceProgress = {
  sent: number
  failed: number
  total: number
}

export type CsvRowError = {
  row: number
  message: string
}

export type CsvProduceSummary = {
  total: number
  sent: number
  failed: number
  cancelled: boolean
  errors: CsvRowError[]
  truncatedErrors: boolean
  durationMs: number
}

export type GroupMember = {
  memberId: string
  clientId: string
  clientHost: string
  assignments: Array<{ topic: string; partitions: number[] }>
}

export type GroupOffset = {
  topic: string
  partition: number
  offset: string
  high: string
  lag: number
}

export type ConsumerGroupInfo = {
  groupId: string
  state: string
  protocol: string
  protocolType: string
  members: GroupMember[]
  offsets: GroupOffset[]
  lag: number
}

export type CreateTopicRequest = {
  name: string
  partitions: number
  replicationFactor: number
}
