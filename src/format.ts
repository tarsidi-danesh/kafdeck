export function prettyJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

export function isJson(value: string) {
  if (!value) return false
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

export function highlightJson(value: string) {
  const pretty = prettyJson(value)
  return pretty.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number'
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'json-key' : 'json-string'
      else if (/true|false/.test(match)) cls = 'json-bool'
      else if (/null/.test(match)) cls = 'json-null'
      return `<span class="${cls}">${escapeHtml(match)}</span>`
    },
  )
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

export function formatTime(timestamp: string) {
  const ms = Number(timestamp)
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  return new Date(ms).toLocaleString()
}

export function preview(value: string, length = 80) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= length) return compact || '∅'
  return `${compact.slice(0, length)}…`
}

export function newId() {
  return crypto.randomUUID()
}
