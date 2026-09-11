import { useMemo, useState } from 'react'
import { RefreshCw, Search, Users } from 'lucide-react'
import type { ConsumerGroupInfo } from '../../shared/types'
import { formatNumber } from '../format'

export function Groups({
  groups,
  loading,
  onRefresh,
}: {
  groups: ConsumerGroupInfo[]
  loading: boolean
  onRefresh: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const filtered = useMemo(
    () => groups.filter((group) => group.groupId.toLowerCase().includes(query.toLowerCase())),
    [groups, query],
  )
  const current = groups.find((group) => group.groupId === selected) ?? filtered[0]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Consumer groups</h2>
          <p>{groups.length} group{groups.length === 1 ? '' : 's'}</p>
        </div>
        <div className="row">
          <label className="search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter groups" />
          </label>
          <button className="btn" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      <div className="browser-split">
        <section className="panel grow">
          <table className="clickable">
            <thead>
              <tr>
                <th>Group</th>
                <th>State</th>
                <th>Members</th>
                <th>Lag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((group) => (
                <tr
                  key={group.groupId}
                  className={current?.groupId === group.groupId ? 'selected' : ''}
                  onClick={() => setSelected(group.groupId)}
                >
                  <td className="mono">{group.groupId}</td>
                  <td>
                    <span className={`pill ${group.state === 'Stable' ? 'pill-ok' : ''}`}>{group.state}</span>
                  </td>
                  <td>{group.members.length}</td>
                  <td>{formatNumber(group.lag)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    {loading ? 'Loading groups…' : 'No consumer groups.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <aside className="inspector">
          {current ? (
            <>
              <header>
                <h3 className="mono">{current.groupId}</h3>
              </header>
              <p className="muted">
                {current.protocolType || 'consumer'} · {current.protocol || '—'}
              </p>
              <h4>Members</h4>
              {current.members.length === 0 && <p className="muted">No active members.</p>}
              {current.members.map((member) => (
                <div key={member.memberId} className="member">
                  <div className="row">
                    <Users size={14} />
                    <strong className="mono">{member.clientId}</strong>
                  </div>
                  <p className="muted">{member.clientHost}</p>
                  {member.assignments.map((assignment) => (
                    <p key={assignment.topic} className="mono small">
                      {assignment.topic} [{assignment.partitions.join(', ')}]
                    </p>
                  ))}
                </div>
              ))}
              <h4>Offsets</h4>
              <table className="dense">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>P</th>
                    <th>Offset</th>
                    <th>Lag</th>
                  </tr>
                </thead>
                <tbody>
                  {current.offsets.map((offset) => (
                    <tr key={`${offset.topic}-${offset.partition}`}>
                      <td className="mono">{offset.topic}</td>
                      <td>{offset.partition}</td>
                      <td className="mono">{offset.offset}</td>
                      <td>{offset.lag}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty-inline">
              <p>Select a group</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
