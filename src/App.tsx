import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  Cable,
  Database,
  LayoutDashboard,
  Send,
  Users,
} from 'lucide-react'
import type { ClusterInfo, ConnectionConfig, ConsumerGroupInfo, TopicInfo } from '../shared/types'
import { ToastStack, usePlatform, useToasts } from './components/Toasts'
import { Connections } from './views/Connections'
import { Groups } from './views/Groups'
import { Overview } from './views/Overview'
import { ProduceModal } from './views/Produce'
import { TopicBrowser } from './views/TopicBrowser'
import { Topics } from './views/Topics'

type View = 'overview' | 'topics' | 'browser' | 'groups' | 'connections'

export default function App() {
  const platform = usePlatform()
  const toasts = useToasts()
  const [connections, setConnections] = useState<ConnectionConfig[]>([])
  const [active, setActive] = useState<ConnectionConfig | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [view, setView] = useState<View>('connections')
  const [cluster, setCluster] = useState<ClusterInfo | null>(null)
  const [topics, setTopics] = useState<TopicInfo[]>([])
  const [groups, setGroups] = useState<ConsumerGroupInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [topic, setTopic] = useState<string | null>(null)
  const [produceTopic, setProduceTopic] = useState<string | null | false>(false)

  useEffect(() => {
    if (!window.kafdeck) return
    void window.kafdeck.connections.list().then((list) => {
      setConnections(list)
      if (list.length === 0) setView('connections')
    })
  }, [])

  const persist = (next: ConnectionConfig[]) => {
    setConnections(next)
    void window.kafdeck.connections.save(next)
  }

  const refresh = async () => {
    setLoading(true)
    const [clusterResult, topicsResult, groupsResult] = await Promise.all([
      window.kafdeck.kafka.cluster(),
      window.kafdeck.kafka.topics(),
      window.kafdeck.kafka.groups(),
    ])
    setLoading(false)
    if (clusterResult.ok) setCluster(clusterResult.data)
    else toasts.error(clusterResult.error)
    if (topicsResult.ok) setTopics(topicsResult.data)
    else toasts.error(topicsResult.error)
    if (groupsResult.ok) setGroups(groupsResult.data)
    else toasts.error(groupsResult.error)
  }

  const connect = async (connection: ConnectionConfig) => {
    setConnecting(true)
    setActive(connection)
    const result = await window.kafdeck.kafka.connect(connection)
    setConnecting(false)
    if (!result.ok) {
      setConnected(false)
      toasts.error(result.error)
      return
    }
    setConnected(true)
    setView('overview')
    toasts.ok(`Connected to ${connection.name}`)
    await refresh()
  }

  const openTopic = (name: string) => {
    setTopic(name)
    setView('browser')
  }

  if (typeof window.kafdeck === 'undefined') {
    return (
      <div className="empty-card page">
        <h3>Kafdeck needs the Electron shell</h3>
        <p>Run npm run dev to open the desktop app with Kafka APIs.</p>
      </div>
    )
  }

  return (
    <div className={`app ${platform}`}>
      <header className="titlebar">
        <div className="brand">
          <span className="logo">K</span>
          <strong>Kafdeck</strong>
        </div>
        <div className="titlebar-center">
          {connected && active ? (
            <span className="conn-chip">
              <span className="dot" />
              {active.name}
              <span className="muted"> · {active.brokers[0]}</span>
            </span>
          ) : (
            <span className="muted">Not connected</span>
          )}
        </div>
        <button className="btn btn-small" onClick={() => void refresh()} disabled={!connected || loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="shell">
        <nav className="sidebar">
          <NavButton
            icon={<LayoutDashboard size={16} />}
            label="Overview"
            active={view === 'overview'}
            disabled={!connected}
            onClick={() => setView('overview')}
          />
          <NavButton
            icon={<Database size={16} />}
            label="Topics"
            active={view === 'topics' || view === 'browser'}
            disabled={!connected}
            onClick={() => setView('topics')}
          />
          <NavButton
            icon={<Users size={16} />}
            label="Groups"
            active={view === 'groups'}
            disabled={!connected}
            onClick={() => setView('groups')}
          />
          <NavButton
            icon={<Send size={16} />}
            label="Produce"
            active={false}
            disabled={!connected || topics.length === 0}
            onClick={() => setProduceTopic(topic)}
          />
          <div className="nav-spacer" />
          <NavButton
            icon={<Cable size={16} />}
            label="Connections"
            active={view === 'connections'}
            onClick={() => setView('connections')}
          />
        </nav>

        <main>
          {!connected && view !== 'connections' ? (
            <div className="empty-card page">
              <Activity size={28} />
              <h3>Connect a cluster</h3>
              <p>Pick a saved connection to browse topics and records.</p>
              <button className="btn btn-accent" onClick={() => setView('connections')}>
                Open connections
              </button>
            </div>
          ) : (
            <>
              {view === 'overview' && (
                <Overview
                  cluster={cluster}
                  topics={topics}
                  groups={groups}
                  connectionName={active?.name ?? ''}
                />
              )}
              {view === 'topics' && (
                <Topics
                  topics={topics}
                  loading={loading}
                  onRefresh={() => void refresh()}
                  onOpen={openTopic}
                  onCreate={async (name, partitions, replicationFactor) => {
                    const result = await window.kafdeck.kafka.createTopic({ name, partitions, replicationFactor })
                    if (!result.ok) {
                      toasts.error(result.error)
                      throw new Error(result.error)
                    }
                    toasts.ok(`Created ${name}`)
                    await refresh()
                  }}
                  onDelete={async (name) => {
                    const result = await window.kafdeck.kafka.deleteTopic(name)
                    if (!result.ok) return toasts.error(result.error)
                    toasts.ok(`Deleted ${name}`)
                    await refresh()
                  }}
                />
              )}
              {view === 'browser' && topic && (
                <TopicBrowser
                  topic={topic}
                  info={topics.find((item) => item.name === topic)}
                  onBack={() => setView('topics')}
                  onProduce={(name) => setProduceTopic(name)}
                />
              )}
              {view === 'groups' && (
                <Groups groups={groups} loading={loading} onRefresh={() => void refresh()} />
              )}
              {view === 'connections' && (
                <Connections
                  connections={connections}
                  activeId={active?.id ?? null}
                  connecting={connecting}
                  onSave={(connection) => {
                    const exists = connections.some((item) => item.id === connection.id)
                    persist(
                      exists
                        ? connections.map((item) => (item.id === connection.id ? connection : item))
                        : [...connections, connection],
                    )
                    toasts.ok('Connection saved')
                  }}
                  onConnect={(connection) => void connect(connection)}
                  onDelete={(id) => persist(connections.filter((item) => item.id !== id))}
                />
              )}
            </>
          )}
        </main>
      </div>

      {produceTopic !== false && (
        <ProduceModal
          topics={topics}
          initialTopic={produceTopic || undefined}
          onClose={() => setProduceTopic(false)}
          onSent={(summary) => toasts.ok(summary)}
        />
      )}

      <ToastStack toasts={toasts.toasts} />
    </div>
  )
}

function NavButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button className={`nav-btn ${active ? 'active' : ''}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
