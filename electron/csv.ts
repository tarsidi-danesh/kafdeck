import fs from 'node:fs'
import path from 'node:path'
import type { CsvFile, CsvPreview, CsvProduceRequest } from '../shared/types'

const PREVIEW_ROWS = 12
const MAX_BYTES = 256 * 1024 * 1024
const CANDIDATE_DELIMITERS = [',', ';', '\t', '|']

/**
 * RFC 4180 parser: quoted fields may contain the delimiter, newlines, and "" escapes.
 * Splitting on the delimiter would corrupt any export with quoted text in it.
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let started = false

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i]
    started = true

    if (quoted) {
      if (char !== '"') {
        // Normalise CRLF inside a quoted field so values do not keep a stray \r.
        if (char === '\r' && text[i + 1] === '\n') continue
        field += char
      } else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && field === '') quoted = true
    else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }

  if (field !== '' || row.length > 0 || (started && rows.length === 0)) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function isEmptyRow(row: string[]) {
  return row.every((cell) => cell.trim() === '')
}

/** Picks whichever candidate yields the most columns on the first non-empty line. */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024)
  const line = sample.split('\n').find((candidate) => candidate.trim() !== '') ?? ''
  let best = ','
  let bestCount = 0
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const count = parseCsv(line, delimiter)[0]?.length ?? 0
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

function readFile(target: string): string {
  const stats = fs.statSync(target)
  if (!stats.isFile()) throw new Error(`${path.basename(target)} is not a file`)
  if (stats.size > MAX_BYTES) {
    throw new Error(
      `${path.basename(target)} is ${(stats.size / 1024 / 1024).toFixed(0)} MB, over the ${MAX_BYTES / 1024 / 1024} MB limit.`,
    )
  }
  return fs.readFileSync(target, 'utf8')
}

export function describeFile(target: string): CsvFile {
  return { path: target, name: path.basename(target), size: fs.statSync(target).size }
}

export function inspectCsv(target: string, delimiter?: string): CsvPreview {
  const text = readFile(target)
  const resolved = delimiter || detectDelimiter(text)
  const rows = parseCsv(text, resolved).filter((row) => !isEmptyRow(row))
  return {
    delimiter: resolved,
    rows: rows.slice(0, PREVIEW_ROWS),
    columnCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
    totalRows: rows.length,
    truncated: rows.length > PREVIEW_ROWS,
  }
}

/** Header names double as JSON keys in 'row-json' mode, so blanks need a stable fallback. */
export function readCsvForProduce(request: CsvProduceRequest) {
  const rows = parseCsv(readFile(request.path), request.delimiter).filter(
    (row) => !(request.skipEmptyRows && isEmptyRow(row)),
  )
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const header = request.hasHeader ? rows[0] : undefined
  const columns = Array.from(
    { length: width },
    (_unused, index) => header?.[index]?.trim() || `column_${index + 1}`,
  )
  return { columns, dataRows: request.hasHeader ? rows.slice(1) : rows }
}
