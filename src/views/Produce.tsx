import { useState } from 'react'
import { Send } from 'lucide-react'
import type { TopicInfo } from '../../shared/types'
import { Modal } from '../components/Modal'

export function ProduceModal({
  topics,
  initialTopic,
  onClose,
  onSent,
}: {
  topics: TopicInfo[]
  initialTopic?: string
  onClose: () => void
  onSent: (summary: string) => void
}) {
  const [topic, setTopic] = useState(initialTopic || topics[0]?.name || '')
  const [key, setKey] = useState('')
  const [value, setValue] = useState('{\n  "hello": "kafdeck"\n}')
  const [headers, setHeaders] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal title="Produce message" onClose={onClose} wide>
      <form
        className="form"
        onSubmit={async (event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          const parsedHeaders = headers
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const [headerKey, ...rest] = line.split('=')
              return { key: headerKey.trim(), value: rest.join('=').trim() }
            })
          const result = await window.kafdeck.kafka.produce({
            topic,
            key: key || undefined,
            value,
            headers: parsedHeaders,
          })
          setBusy(false)
          if (!result.ok) {
            setError(result.error)
            return
          }
          onSent(`Produced to ${result.data.topic} p${result.data.partition} @ ${result.data.offset}`)
          onClose()
        }}
      >
        <label>
          Topic
          <select value={topic} onChange={(event) => setTopic(event.target.value)} required>
            {topics.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Key
          <input className="mono" value={key} onChange={(event) => setKey(event.target.value)} placeholder="optional" />
        </label>
        <label>
          Value
          <textarea className="mono" rows={10} value={value} onChange={(event) => setValue(event.target.value)} />
        </label>
        <label>
          Headers
          <textarea
            className="mono"
            rows={3}
            value={headers}
            onChange={(event) => setHeaders(event.target.value)}
            placeholder="one per line: correlationId=abc"
          />
        </label>
        {error && <div className="banner bad">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-accent" disabled={busy || !topic}>
            <Send size={15} />
            Send
          </button>
        </div>
      </form>
    </Modal>
  )
}
