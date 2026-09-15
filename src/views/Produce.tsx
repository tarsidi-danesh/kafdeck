import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Send, Upload } from 'lucide-react'
import type {
  CsvFile,
  CsvPreview,
  CsvProduceRequest,
  CsvProduceSummary,
  TopicInfo,
} from '../../shared/types'
import { Modal } from '../components/Modal'

type Mode = 'single' | 'csv'

const DELIMITERS = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe' },
]

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
  const [mode, setMode] = useState<Mode>('single')
  const [topic, setTopic] = useState(initialTopic || topics[0]?.name || '')

  return (
    <Modal title="Produce" onClose={onClose} wide={mode === 'single'} xl={mode === 'csv'}>
      <div className="tabs">
        <button className={`tab ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
          <Send size={14} />
          Single message
        </button>
        <button className={`tab ${mode === 'csv' ? 'active' : ''}`} onClick={() => setMode('csv')}>
          <FileSpreadsheet size={14} />
          From CSV file
        </button>
      </div>

      <label className="topic-select">
        Topic
        <select value={topic} onChange={(event) => setTopic(event.target.value)} required>
          {topics.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {mode === 'single' ? (
        <SingleMessageForm topic={topic} onClose={onClose} onSent={onSent} />
      ) : (
        <CsvForm topic={topic} onClose={onClose} onSent={onSent} />
      )}
    </Modal>
  )
}

function SingleMessageForm({
  topic,
  onClose,
  onSent,
}: {
  topic: string
  onClose: () => void
  onSent: (summary: string) => void
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('{\n  "hello": "kafdeck"\n}')
  const [headers, setHeaders] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
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
  )
}

function CsvForm({
  topic,
  onClose,
  onSent,
}: {
  topic: string
  onClose: () => void
  onSent: (summary: string) => void
}) {
  const [file, setFile] = useState<CsvFile | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [delimiter, setDelimiter] = useState(',')
  const [hasHeader, setHasHeader] = useState(true)
  const [skipEmptyRows, setSkipEmptyRows] = useState(true)
  const [valueMode, setValueMode] = useState<CsvProduceRequest['valueMode']>('row-json')
  const [valueColumn, setValueColumn] = useState(0)
  const [keyColumn, setKeyColumn] = useState<number | null>(null)
  const [partitionColumn, setPartitionColumn] = useState<number | null>(null)
  const [headerColumns, setHeaderColumns] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; failed: number; total: number } | null>(null)
  const [summary, setSummary] = useState<CsvProduceSummary | null>(null)
  const cancelled = useRef(false)

  useEffect(() => window.kafdeck.kafka.onCsvProgress(setProgress), [])

  const columns = useMemo(() => {
    if (!preview) return []
    const width = preview.columnCount
    const header = hasHeader ? preview.rows[0] : undefined
    return Array.from(
      { length: width },
      (_unused, index) => header?.[index]?.trim() || `column_${index + 1}`,
    )
  }, [preview, hasHeader])

  const dataRows = useMemo(
    () => (preview ? (hasHeader ? preview.rows.slice(1) : preview.rows) : []),
    [preview, hasHeader],
  )
  const totalRows = preview ? Math.max(0, preview.totalRows - (hasHeader ? 1 : 0)) : 0

  const load = async (target: CsvFile, nextDelimiter?: string) => {
    setError(null)
    setSummary(null)
    const result = await window.kafdeck.csv.inspect(target.path, nextDelimiter)
    if (!result.ok) {
      setError(result.error)
      setPreview(null)
      return
    }
    setPreview(result.data)
    setDelimiter(result.data.delimiter)
    setValueColumn(0)
    setKeyColumn(null)
    setPartitionColumn(null)
    setHeaderColumns([])
  }

  const pick = async () => {
    const picked = await window.kafdeck.csv.pick()
    if (!picked) return
    setFile(picked)
    await load(picked)
  }

  const send = async () => {
    setSending(true)
    setError(null)
    setSummary(null)
    setProgress({ sent: 0, failed: 0, total: totalRows })
    cancelled.current = false
    const result = await window.kafdeck.kafka.produceCsv({
      path: file!.path,
      delimiter,
      topic,
      hasHeader,
      valueMode,
      valueColumn: valueMode === 'column' ? valueColumn : undefined,
      keyColumn: keyColumn ?? undefined,
      partitionColumn: partitionColumn ?? undefined,
      headerColumns,
      skipEmptyRows,
    })
    setSending(false)
    setProgress(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSummary(result.data)
    if (result.data.failed === 0 && !result.data.cancelled) {
      onSent(`Produced ${result.data.sent} row(s) from ${file!.name} to ${topic}`)
    }
  }

  const toggleHeaderColumn = (index: number) => {
    setHeaderColumns((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    )
  }

  if (!file || !preview) {
    return (
      <>
        <div className="csv-drop">
          <FileSpreadsheet size={26} />
          <h4>Produce one message per CSV row</h4>
          <p className="muted small">
            Map columns to the record key, value, partition and headers. The first row can be used as
            the column names.
          </p>
          <button type="button" className="btn btn-accent" onClick={() => void pick()}>
            <Upload size={15} />
            Choose CSV file…
          </button>
        </div>
        {error && <div className="banner bad">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="csv-file-row">
        <div className="grow">
          <strong className="mono">{file.name}</strong>
          <div className="muted small">
            {totalRows.toLocaleString()} data row(s) · {columns.length} column(s) ·{' '}
            {(file.size / 1024).toFixed(1)} KB
          </div>
        </div>
        <button type="button" className="btn btn-small" onClick={() => void pick()} disabled={sending}>
          Change…
        </button>
      </div>

      <div className="form-grid">
        <label>
          Delimiter
          <select
            value={delimiter}
            onChange={(event) => {
              setDelimiter(event.target.value)
              void load(file, event.target.value)
            }}
            disabled={sending}
          >
            {DELIMITERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Value
          <select
            value={valueMode}
            onChange={(event) => setValueMode(event.target.value as CsvProduceRequest['valueMode'])}
            disabled={sending}
          >
            <option value="row-json">Whole row as JSON</option>
            <option value="column">Single column</option>
          </select>
        </label>
      </div>

      <div className="check-row">
        <label className="check">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(event) => setHasHeader(event.target.checked)}
            disabled={sending}
          />
          First row is the header
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={skipEmptyRows}
            onChange={(event) => setSkipEmptyRows(event.target.checked)}
            disabled={sending}
          />
          Skip empty rows
        </label>
      </div>

      <div className="form-grid">
        {valueMode === 'column' && (
          <label>
            Value column
            <ColumnSelect
              columns={columns}
              value={valueColumn}
              onChange={(next) => setValueColumn(next ?? 0)}
              disabled={sending}
            />
          </label>
        )}
        <label>
          Key column
          <ColumnSelect
            columns={columns}
            value={keyColumn}
            onChange={setKeyColumn}
            optional
            disabled={sending}
          />
        </label>
        <label>
          Partition column
          <ColumnSelect
            columns={columns}
            value={partitionColumn}
            onChange={setPartitionColumn}
            optional
            disabled={sending}
          />
        </label>
      </div>

      <label className="csv-headers">
        Send as headers
        <div className="chip-row">
          {columns.map((name, index) => (
            <button
              key={`${name}-${index}`}
              type="button"
              className={`chip ${headerColumns.includes(index) ? 'active' : ''}`}
              onClick={() => toggleHeaderColumn(index)}
              disabled={sending}
            >
              {name}
            </button>
          ))}
        </div>
      </label>

      <div className="csv-preview panel">
        <table className="dense">
          <thead>
            <tr>
              <th className="row-num">#</th>
              {columns.map((name, index) => (
                <th key={`${name}-${index}`}>
                  {name}
                  {index === keyColumn && <span className="pill">key</span>}
                  {index === partitionColumn && <span className="pill">partition</span>}
                  {valueMode === 'column' && index === valueColumn && <span className="pill">value</span>}
                  {headerColumns.includes(index) && <span className="pill">header</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="row-num muted">{rowIndex + 1}</td>
                {columns.map((_unused, index) => (
                  <td key={index} className="mono">
                    {row[index] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.truncated && (
        <p className="muted small">
          Showing the first {dataRows.length} of {totalRows.toLocaleString()} rows.
        </p>
      )}

      {progress && (
        <div className="csv-progress">
          <div className="bar">
            <span
              style={{
                width: `${progress.total ? ((progress.sent + progress.failed) / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <span className="muted small">
            {(progress.sent + progress.failed).toLocaleString()} / {progress.total.toLocaleString()}
            {progress.failed > 0 && ` · ${progress.failed} failed`}
          </span>
        </div>
      )}

      {error && <div className="banner bad">{error}</div>}

      {summary && (
        <div className={`banner ${summary.failed > 0 ? 'bad' : ''}`}>
          <strong>
            {summary.cancelled ? 'Cancelled — ' : ''}
            {summary.sent.toLocaleString()} of {summary.total.toLocaleString()} row(s) produced to {topic}
            {summary.failed > 0 && `, ${summary.failed.toLocaleString()} failed`} in{' '}
            {(summary.durationMs / 1000).toFixed(1)}s
          </strong>
          {summary.errors.length > 0 && (
            <ul className="csv-errors">
              {summary.errors.slice(0, 8).map((item) => (
                <li key={item.row}>
                  Row {item.row}: {item.message}
                </li>
              ))}
              {summary.truncatedErrors && <li className="muted">…more failures not listed</li>}
            </ul>
          )}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={sending}>
          Close
        </button>
        {sending ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              cancelled.current = true
              void window.kafdeck.kafka.cancelCsv()
            }}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void send()}
            disabled={!topic || totalRows === 0}
          >
            <Send size={15} />
            Produce {totalRows.toLocaleString()} row(s)
          </button>
        )}
      </div>
    </>
  )
}

function ColumnSelect({
  columns,
  value,
  onChange,
  optional,
  disabled,
}: {
  columns: string[]
  value: number | null
  onChange: (value: number | null) => void
  optional?: boolean
  disabled?: boolean
}) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      {optional && <option value="">None</option>}
      {columns.map((name, index) => (
        <option key={`${name}-${index}`} value={index}>
          {name}
        </option>
      ))}
    </select>
  )
}
