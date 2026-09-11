import type { ReactNode } from 'react'
import { Activity, Database, Server, Users } from 'lucide-react'
import type { ClusterInfo, ConsumerGroupInfo, TopicInfo } from '../../shared/types'
import { formatNumber } from '../format'

export function Overview({
  cluster,
  topics,
  groups,
  connectionName,
}: {
  cluster: ClusterInfo | null
  topics: TopicInfo[]
  groups: ConsumerGroupInfo[]
  connectionName: string
}) {
  const messages = topics.reduce((sum, topic) => sum + topic.messageCount, 0)
  const underReplicated = topics.reduce((sum, topic) => sum + topic.underReplicated, 0)
  const lag = groups.reduce((sum, group) => sum + group.lag, 0)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Overview</h2>
          <p>
            {connectionName}
            {cluster ? ` · cluster ${cluster.clusterId}` : ''}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <Stat icon={<Server size={18} />} label="Brokers" value={cluster?.brokers.length ?? 0} />
        <Stat icon={<Database size={18} />} label="Topics" value={topics.length} />
        <Stat icon={<Activity size={18} />} label="Records" value={formatNumber(messages)} />
        <Stat icon={<Users size={18} />} label="Groups" value={groups.length} hint={lag ? `${formatNumber(lag)} lag` : 'No lag'} />
      </div>

      {underReplicated > 0 && (
        <div className="banner warn">
          {underReplicated} partition{underReplicated === 1 ? '' : 's'} are under-replicated.
        </div>
      )}

      <div className="split-cards">
        <section className="panel">
          <header>
            <h3>Brokers</h3>
          </header>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Host</th>
                <th>Port</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(cluster?.brokers ?? []).map((broker) => (
                <tr key={broker.nodeId}>
                  <td className="mono">{broker.nodeId}</td>
                  <td>{broker.host}</td>
                  <td className="mono">{broker.port}</td>
                  <td>
                    {cluster?.controllerId === broker.nodeId ? <span className="pill">Controller</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <header>
            <h3>Busiest topics</h3>
          </header>
          <table>
            <thead>
              <tr>
                <th>Topic</th>
                <th>Partitions</th>
                <th>Records</th>
              </tr>
            </thead>
            <tbody>
              {[...topics]
                .sort((a, b) => b.messageCount - a.messageCount)
                .slice(0, 8)
                .map((topic) => (
                  <tr key={topic.name}>
                    <td className="mono">{topic.name}</td>
                    <td>{topic.partitions}</td>
                    <td>{formatNumber(topic.messageCount)}</td>
                  </tr>
                ))}
              {topics.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No user topics yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  )
}
