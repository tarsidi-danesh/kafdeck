import type {
  ClusterInfo,
  ConnectionConfig,
  ConsumeRequest,
  ConsumerGroupInfo,
  CreateTopicRequest,
  KafkaRecord,
  ProduceRequest,
  ProduceResult,
  Result,
  TopicInfo,
} from '../shared/types'

type KafdeckApi = {
  platform: () => Promise<NodeJS.Platform>
  connections: {
    list: () => Promise<ConnectionConfig[]>
    save: (connections: ConnectionConfig[]) => Promise<void>
  }
  kafka: {
    connect: (config: ConnectionConfig) => Promise<Result<void>>
    disconnect: () => Promise<Result<void>>
    test: (config: ConnectionConfig) => Promise<Result<{ clusterId: string; brokers: number }>>
    cluster: () => Promise<Result<ClusterInfo>>
    topics: () => Promise<Result<TopicInfo[]>>
    createTopic: (request: CreateTopicRequest) => Promise<Result<void>>
    deleteTopic: (name: string) => Promise<Result<void>>
    consume: (request: ConsumeRequest) => Promise<Result<KafkaRecord[]>>
    produce: (request: ProduceRequest) => Promise<Result<ProduceResult>>
    groups: () => Promise<Result<ConsumerGroupInfo[]>>
    startLive: (topic: string) => Promise<Result<void>>
    stopLive: () => Promise<Result<void>>
    onLiveMessage: (handler: (record: KafkaRecord) => void) => () => void
  }
}

declare global {
  interface Window {
    kafdeck: KafdeckApi
  }
}

export {}
