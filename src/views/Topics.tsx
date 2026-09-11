import { useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { TopicInfo } from '../../shared/types'
import { Modal } from '../components/Modal'
import { formatNumber } from '../format'

export function Topics({
  topics,
  loading,
  onRefresh,
  onOpen,
  onCreate,
  onDelete,
}: {
  topics: TopicInfo[]
  loading: boolean
  onRefresh: () => void
  onOpen: (name: string) => void
  onCreate: (name: string, partitions: number, replicationFactor: number) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const filtered = useMemo(
    () => topics.filter((topic) => topic.name.toLowerCase().includes(query.toLowerCase())),
    [topics, query],
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Topics</h2>
          <p>{topics.length} topic{topics.length === 1 ? '' : 's'} in this cluster</p>
        </div>
        <div className="row">
          <label className="search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter topics" />
          </label>
          <button className="btn" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} />
            Refresh
          </button>
          <button className="btn btn-accent" onClick={() => setCreating(true)}>
            <Plus size={15} />
            Create topic
          </button>
        </div>
      </div>

      <section className="panel">
        <table className="clickable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Partitions</th>
              <th>RF</th>
              <th>Records</th>
              <th>Health</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((topic) => (
              <tr key={topic.name} onClick={() => onOpen(topic.name)}>
                <td className="mono">{topic.name}</td>
                <td>{topic.partitions}</td>
                <td>{topic.replicationFactor}</td>
                <td>{formatNumber(topic.messageCount)}</td>
                <td>
                  {topic.underReplicated ? (
                    <span className="pill pill-warn">{topic.underReplicated} UR</span>
                  ) : (
                    <span className="pill pill-ok">OK</span>
                  )}
                </td>
                <td>
                  <button
                    className="icon-btn danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      if (confirm(`Delete topic ${topic.name}? This cannot be undone.`)) {
                        void onDelete(topic.name)
                      }
                    }}
                    aria-label={`Delete ${topic.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {loading ? 'Loading topics…' : 'No topics match.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {creating && (
        <CreateTopicModal
          onClose={() => setCreating(false)}
          onCreate={async (name, partitions, replicationFactor) => {
            await onCreate(name, partitions, replicationFactor)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

function CreateTopicModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, partitions: number, replicationFactor: number) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [partitions, setPartitions] = useState(1)
  const [replicationFactor, setReplicationFactor] = useState(1)
  const [busy, setBusy] = useState(false)

  return (
    <Modal title="Create topic" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          try {
            await onCreate(name.trim(), partitions, replicationFactor)
          } finally {
            setBusy(false)
          }
        }}
      >
        <label>
          Name
          <input className="mono" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <div className="form-grid">
          <label>
            Partitions
            <input
              type="number"
              min={1}
              value={partitions}
              onChange={(event) => setPartitions(Number(event.target.value))}
            />
          </label>
          <label>
            Replication factor
            <input
              type="number"
              min={1}
              value={replicationFactor}
              onChange={(event) => setReplicationFactor(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent" disabled={busy || !name.trim()}>
            Create
          </button>
        </div>
      </form>
    </Modal>
  )
}
