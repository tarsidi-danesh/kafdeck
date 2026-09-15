import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Loader2, Pause, Play, Radio, RefreshCw, Send } from 'lucide-react'
import type { ConsumeProgress, KafkaRecord, TopicInfo } from '../../shared/types'
import { formatTime, highlightJson, isJson, preview } from '../format'

export function TopicBrowser({
  topic,
  info,
  onBack,
  onProduce,
  onError,
}: {
  topic: string
  info?: TopicInfo
  onBack: () => void
  onProduce: (topic: string) => void
  onError: (message: string) => void
}) {
  const [records, setRecords] = useState<KafkaRecord[]>([])
  const [selected, setSelected] = useState<KafkaRecord | null>(null)
  const [from, setFrom] = useState<'latest' | 'beginning'>('latest')
  const [limit, setLimit] = useState(50)
  const [partition, setPartition] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [progress, setProgress] = useState<ConsumeProgress | null>(null)

  useEffect(() => window.kafdeck.kafka.onConsumeProgress(setProgress), [])

  const load = async () => {
    setLoading(true)
    setProgress(null)
    const result = await window.kafdeck.kafka.consume({
      topic,
      from,
      limit,
      partition: partition === 'all' ? undefined : Number(partition),
    })
    setLoading(false)
    setProgress(null)
    if (!result.ok) {
      onError(result.error)
      return
    }
    setRecords(result.data)
    setSelected(result.data[0] ?? null)
  }

  useEffect(() => {
    void load()
    return () => {
      void window.kafdeck.kafka.stopLive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic])

  useEffect(() => {
    if (!live) {
      void window.kafdeck.kafka.stopLive()
      return
    }
    void window.kafdeck.kafka.startLive(topic)
    const stop = window.kafdeck.kafka.onLiveMessage((record) => {
      setRecords((current) => [record, ...current].slice(0, 500))
      setSelected((current) => current ?? record)
    })
    return stop
  }, [live, topic])

  const filtered = useMemo(() => {
    const needle = query.toLowerCase()
    if (!needle) return records
    return records.filter(
      (record) =>
        record.key.toLowerCase().includes(needle) ||
        record.value.toLowerCase().includes(needle) ||
        record.offset.includes(needle),
    )
  }, [records, query])

  return (
    <div className="page browser">
      <div className="page-head">
        <div className="row">
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="mono">{topic}</h2>
            <p>
              {info ? `${info.partitions} partitions · ${info.replicationFactor} RF · ${info.messageCount} records` : 'Topic browser'}
            </p>
          </div>
        </div>
        <div className="row wrap">
          <select value={from} onChange={(event) => setFrom(event.target.value as 'latest' | 'beginning')}>
            <option value="latest">Latest</option>
            <option value="beginning">Beginning</option>
          </select>
          <select value={partition} onChange={(event) => setPartition(event.target.value)}>
            <option value="all">All partitions</option>
            {(info?.partitionDetails ?? []).map((item) => (
              <option key={item.partition} value={item.partition}>
                Partition {item.partition}
              </option>
            ))}
          </select>
          <input
            className="narrow"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter key / value" />
          <button className="btn" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            {loading ? 'Loading…' : 'Load'}
          </button>
          <button className={`btn ${live ? 'btn-live' : ''}`} onClick={() => setLive((value) => !value)}>
            {live ? <Pause size={15} /> : <Play size={15} />}
            {live ? 'Live' : 'Tail'}
          </button>
          <button className="btn btn-accent" onClick={() => onProduce(topic)}>
            <Send size={15} />
            Produce
          </button>
        </div>
      </div>

      {loading && (
        <div className="progress" role="status" aria-live="polite">
          <Loader2 size={14} className="spin" />
          <span className="muted small nowrap">
            {progress
              ? `Read ${progress.received.toLocaleString()} of ${progress.target.toLocaleString()} records…`
              : 'Opening a consumer…'}
          </span>
          <div className="bar">
            <span
              style={{
                width: progress?.target ? `${(progress.received / progress.target) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
      )}

      <div className="browser-split">
        <section className="panel grow">
          <table className="clickable dense">
            <thead>
              <tr>
                <th>Time</th>
                <th>P</th>
                <th>Offset</th>
                <th>Key</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => {
                const active =
                  selected?.offset === record.offset && selected.partition === record.partition
                return (
                  <tr
                    key={`${record.partition}-${record.offset}-${record.timestamp}`}
                    className={active ? 'selected' : ''}
                    onClick={() => setSelected(record)}
                  >
                    <td className="nowrap">{formatTime(record.timestamp)}</td>
                    <td className="mono">{record.partition}</td>
                    <td className="mono">{record.offset}</td>
                    <td className="mono">{preview(record.key, 36)}</td>
                    <td>{preview(record.value, 72)}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    {loading ? 'Consuming…' : query ? 'No records match the filter.' : 'No records in this window.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <Inspector record={selected} />
      </div>
    </div>
  )
}

function Inspector({ record }: { record: KafkaRecord | null }) {
  if (!record) {
    return (
      <aside className="inspector">
        <div className="empty-inline">
          <Radio size={20} />
          <p>Select a record</p>
        </div>
      </aside>
    )
  }

  const json = isJson(record.value)

  return (
    <aside className="inspector">
      <header>
        <h3>Record</h3>
        <button
          className="icon-btn"
          onClick={() => void navigator.clipboard.writeText(record.value)}
          aria-label="Copy value"
        >
          <Copy size={15} />
        </button>
      </header>
      <dl className="meta-list">
        <div>
          <dt>Partition</dt>
          <dd className="mono">{record.partition}</dd>
        </div>
        <div>
          <dt>Offset</dt>
          <dd className="mono">{record.offset}</dd>
        </div>
        <div>
          <dt>Timestamp</dt>
          <dd>{formatTime(record.timestamp)}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{record.size} B</dd>
        </div>
      </dl>
      <h4>Key</h4>
      <pre className="code-block">{record.key || '∅'}</pre>
      {record.headers.length > 0 && (
        <>
          <h4>Headers</h4>
          <ul className="header-list">
            {record.headers.map((header) => (
              <li key={header.key}>
                <span className="mono">{header.key}</span>
                <span>{header.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h4>Value {json && <span className="pill">JSON</span>}</h4>
      {json ? (
        <pre className="code-block" dangerouslySetInnerHTML={{ __html: highlightJson(record.value) }} />
      ) : (
        <pre className="code-block">{record.value || '∅'}</pre>
      )}
    </aside>
  )
}
