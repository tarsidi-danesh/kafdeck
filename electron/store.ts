import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ConnectionConfig } from '../shared/types'

function storePath() {
  return path.join(app.getPath('userData'), 'connections.json')
}

export function loadConnections(): ConnectionConfig[] {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as ConnectionConfig[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveConnections(connections: ConnectionConfig[]) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(connections, null, 2), 'utf8')
}
