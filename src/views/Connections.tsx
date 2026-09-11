import { useMemo, useState } from 'react'
import type { ConnectionConfig, SaslMechanism } from '../../shared/types'
import { Modal } from '../components/Modal'
import { newId } from '../format'
import { Cable, Plus, PlugZap, Shield, Trash2 } from 'lucide-react'

const emptyForm = (): Omit<ConnectionConfig, 'id'> => ({
  name: '',
  brokers: ['localhost:9092'],
  clientId: 'kafdeck',
  ssl: false,
  rejectUnauthorized: true,
})

export function Connections({
  connections,
  activeId,
  connecting,
  onSave,
  onConnect,
  onDelete,
}: {
  connections: ConnectionConfig[]
  activeId: string | null
  connecting: boolean
  onSave: (connection: ConnectionConfig) => void
  onConnect: (connection: ConnectionConfig) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testNote, setTestNote] = useState<string | null>(null)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Connections</h2>
          <p>Saved clusters live on this machine. Passwords stay in your local user data folder.</p>
        </div>
        <button className="btn btn-accent" onClick={() => setEditing({ id: newId(), ...emptyForm() })}>
          <Plus size={16} />
          New connection
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="empty-card">
          <Cable size={28} />
          <h3>No clusters yet</h3>
          <p>Add a bootstrap server to start browsing topics, records, and consumer groups.</p>
          <div className="row">
            <button
              className="btn btn-accent"
              onClick={() =>
                setEditing({
                  id: newId(),
                  name: 'Local Kafka',
                  brokers: ['localhost:9092'],
                  clientId: 'kafdeck',
                  ssl: false,
                  rejectUnauthorized: true,
                })
              }
            >
              Add localhost:9092
            </button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {connections.map((connection) => {
            const active = connection.id === activeId
            return (
              <article key={connection.id} className={`conn-card ${active ? 'active' : ''}`}>
                <div className="conn-card-top">
                  <div>
                    <h3>{connection.name}</h3>
                    <p className="mono muted">{connection.brokers.join(', ')}</p>
                  </div>
                  {active && <span className="pill pill-ok">Connected</span>}
                </div>
                <div className="meta-row">
                  <span>{connection.ssl ? 'SSL' : 'PLAINTEXT'}</span>
                  <span>{connection.sasl ? connection.sasl.mechanism.toUpperCase() : 'No SASL'}</span>
                  <span>{connection.clientId}</span>
                </div>
                <div className="row">
                  <button className="btn btn-accent" disabled={connecting} onClick={() => onConnect(connection)}>
                    <PlugZap size={15} />
                    {connecting && active ? 'Connecting…' : 'Connect'}
                  </button>
                  <button className="btn" onClick={() => setEditing(connection)}>
                    Edit
                  </button>
                  <button
                    className="btn"
                    disabled={testing === connection.id}
                    onClick={async () => {
                      setTesting(connection.id)
                      const result = await window.kafdeck.kafka.test(connection)
                      setTesting(null)
                      setTestNote(
                        result.ok
                          ? `${connection.name}: ${result.data.brokers} broker(s), ${result.data.clusterId}`
                          : result.error,
                      )
                    }}
                  >
                    Test
                  </button>
                  <button className="icon-btn danger" onClick={() => onDelete(connection.id)} aria-label="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {testNote && <p className="status-note">{testNote}</p>}

      {editing && (
        <ConnectionEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(connection) => {
            onSave(connection)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ConnectionEditor({
  value,
  onSave,
  onClose,
}: {
  value: ConnectionConfig
  onSave: (connection: ConnectionConfig) => void
  onClose: () => void
}) {
  const [form, setForm] = useState(value)
  const [brokers, setBrokers] = useState(value.brokers.join(', '))
  const [saslOn, setSaslOn] = useState(Boolean(value.sasl))
  const mechanism: SaslMechanism = form.sasl?.mechanism ?? 'plain'

  const canSave = useMemo(() => form.name.trim() && brokers.trim(), [form.name, brokers])

  return (
    <Modal title={value.name ? `Edit ${value.name}` : 'New connection'} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault()
          onSave({
            ...form,
            brokers: brokers
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
            sasl: saslOn
              ? {
                  mechanism,
                  username: form.sasl?.username ?? '',
                  password: form.sasl?.password ?? '',
                }
              : undefined,
          })
        }}
      >
        <label>
          Name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          Bootstrap servers
          <input
            className="mono"
            value={brokers}
            onChange={(event) => setBrokers(event.target.value)}
            placeholder="localhost:9092"
          />
        </label>
        <label>
          Client ID
          <input value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} />
        </label>
        <div className="check-row">
          <label className="check">
            <input
              type="checkbox"
              checked={form.ssl}
              onChange={(event) => setForm({ ...form, ssl: event.target.checked })}
            />
            SSL
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.rejectUnauthorized}
              onChange={(event) => setForm({ ...form, rejectUnauthorized: event.target.checked })}
            />
            Verify certificate
          </label>
          <label className="check">
            <input type="checkbox" checked={saslOn} onChange={(event) => setSaslOn(event.target.checked)} />
            SASL
          </label>
        </div>
        {saslOn && (
          <div className="form-grid">
            <label>
              Mechanism
              <select
                value={mechanism}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sasl: {
                      mechanism: event.target.value as SaslMechanism,
                      username: form.sasl?.username ?? '',
                      password: form.sasl?.password ?? '',
                    },
                  })
                }
              >
                <option value="plain">PLAIN</option>
                <option value="scram-sha-256">SCRAM-SHA-256</option>
                <option value="scram-sha-512">SCRAM-SHA-512</option>
              </select>
            </label>
            <label>
              Username
              <input
                value={form.sasl?.username ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sasl: { mechanism, username: event.target.value, password: form.sasl?.password ?? '' },
                  })
                }
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.sasl?.password ?? ''}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sasl: { mechanism, username: form.sasl?.username ?? '', password: event.target.value },
                  })
                }
              />
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent" disabled={!canSave}>
            <Shield size={15} />
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
