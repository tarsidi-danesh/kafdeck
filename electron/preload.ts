import { contextBridge, ipcRenderer } from 'electron'
import type {
  ConnectionConfig,
  ConsumeProgress,
  ConsumeRequest,
  CreateTopicRequest,
  CsvFile,
  CsvPreview,
  CsvProduceProgress,
  CsvProduceRequest,
  CsvProduceSummary,
  KafkaRecord,
  ProduceRequest,
  Result,
  ClusterInfo,
  TopicInfo,
  ConsumerGroupInfo,
  ProduceResult,
} from '../shared/types'

const api = {
  platform: () => ipcRenderer.invoke('platform') as Promise<NodeJS.Platform>,
  connections: {
    list: () => ipcRenderer.invoke('connections:list') as Promise<ConnectionConfig[]>,
    save: (connections: ConnectionConfig[]) =>
      ipcRenderer.invoke('connections:save', connections) as Promise<void>,
  },
  csv: {
    pick: () => ipcRenderer.invoke('csv:pick') as Promise<CsvFile | null>,
    inspect: (filePath: string, delimiter?: string) =>
      ipcRenderer.invoke('csv:inspect', filePath, delimiter) as Promise<Result<CsvPreview>>,
  },
  kafka: {
    connect: (config: ConnectionConfig) =>
      ipcRenderer.invoke('kafka:connect', config) as Promise<Result<void>>,
    disconnect: () => ipcRenderer.invoke('kafka:disconnect') as Promise<Result<void>>,
    test: (config: ConnectionConfig) =>
      ipcRenderer.invoke('kafka:test', config) as Promise<Result<{ clusterId: string; brokers: number }>>,
    cluster: () => ipcRenderer.invoke('kafka:cluster') as Promise<Result<ClusterInfo>>,
    topics: () => ipcRenderer.invoke('kafka:topics') as Promise<Result<TopicInfo[]>>,
    createTopic: (request: CreateTopicRequest) =>
      ipcRenderer.invoke('kafka:createTopic', request) as Promise<Result<void>>,
    deleteTopic: (name: string) => ipcRenderer.invoke('kafka:deleteTopic', name) as Promise<Result<void>>,
    consume: (request: ConsumeRequest) =>
      ipcRenderer.invoke('kafka:consume', request) as Promise<Result<KafkaRecord[]>>,
    onConsumeProgress: (handler: (progress: ConsumeProgress) => void) => {
      const listener = (_event: unknown, progress: ConsumeProgress) => handler(progress)
      ipcRenderer.on('kafka:consumeProgress', listener)
      return () => {
        ipcRenderer.removeListener('kafka:consumeProgress', listener)
      }
    },
    produce: (request: ProduceRequest) =>
      ipcRenderer.invoke('kafka:produce', request) as Promise<Result<ProduceResult>>,
    produceCsv: (request: CsvProduceRequest) =>
      ipcRenderer.invoke('kafka:produceCsv', request) as Promise<Result<CsvProduceSummary>>,
    cancelCsv: () => ipcRenderer.invoke('kafka:cancelCsv') as Promise<void>,
    onCsvProgress: (handler: (progress: CsvProduceProgress) => void) => {
      const listener = (_event: unknown, progress: CsvProduceProgress) => handler(progress)
      ipcRenderer.on('kafka:csvProgress', listener)
      return () => {
        ipcRenderer.removeListener('kafka:csvProgress', listener)
      }
    },
    groups: () => ipcRenderer.invoke('kafka:groups') as Promise<Result<ConsumerGroupInfo[]>>,
    startLive: (topic: string) => ipcRenderer.invoke('kafka:startLive', topic) as Promise<Result<void>>,
    stopLive: () => ipcRenderer.invoke('kafka:stopLive') as Promise<Result<void>>,
    onLiveMessage: (handler: (record: KafkaRecord) => void) => {
      const listener = (_event: unknown, record: KafkaRecord) => handler(record)
      ipcRenderer.on('kafka:liveMessage', listener)
      return () => {
        ipcRenderer.removeListener('kafka:liveMessage', listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('kafdeck', api)

export type KafdeckApi = typeof api
