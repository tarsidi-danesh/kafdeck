import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KafkaManager } from './kafka'
import { describeFile, inspectCsv } from './csv'
import { loadConnections, saveConnections } from './store'
import type {
  ConnectionConfig,
  ConsumeRequest,
  CreateTopicRequest,
  CsvProduceRequest,
  ProduceRequest,
  Result,
} from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const kafka = new KafkaManager()
let win: BrowserWindow | null = null

function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  return fn()
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    }))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: 'Kafdeck',
    backgroundColor: '#0c0d12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => win?.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function setupMenu() {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      { role: 'fileMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  )
}

app.whenReady().then(() => {
  setupMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void kafka.disconnect()
})

ipcMain.handle('platform', () => process.platform)

ipcMain.handle('connections:list', () => loadConnections())
ipcMain.handle('connections:save', (_event, connections: ConnectionConfig[]) => {
  saveConnections(connections)
})

ipcMain.handle('kafka:connect', (_event, config: ConnectionConfig) => wrap(() => kafka.connect(config)))
ipcMain.handle('kafka:disconnect', () => wrap(async () => kafka.disconnect()))
ipcMain.handle('kafka:test', (_event, config: ConnectionConfig) => wrap(() => kafka.test(config)))
ipcMain.handle('kafka:cluster', () => wrap(() => kafka.cluster()))
ipcMain.handle('kafka:topics', () => wrap(() => kafka.topics()))
ipcMain.handle('kafka:createTopic', (_event, request: CreateTopicRequest) => wrap(() => kafka.createTopic(request)))
ipcMain.handle('kafka:deleteTopic', (_event, name: string) => wrap(() => kafka.deleteTopic(name)))
ipcMain.handle('kafka:consume', (_event, request: ConsumeRequest) => wrap(() => kafka.consume(request)))
ipcMain.handle('kafka:produce', (_event, request: ProduceRequest) => wrap(() => kafka.produce(request)))
ipcMain.handle('kafka:groups', () => wrap(() => kafka.groups()))

ipcMain.handle('csv:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose a CSV file',
    properties: ['openFile'],
    filters: [
      { name: 'CSV', extensions: ['csv', 'tsv', 'txt'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return describeFile(result.filePaths[0])
})
ipcMain.handle('csv:inspect', (_event, filePath: string, delimiter?: string) =>
  wrap(async () => inspectCsv(filePath, delimiter)),
)
ipcMain.handle('kafka:produceCsv', (_event, request: CsvProduceRequest) =>
  wrap(() =>
    kafka.produceCsv(request, (progress) => {
      win?.webContents.send('kafka:csvProgress', progress)
    }),
  ),
)
ipcMain.handle('kafka:cancelCsv', () => kafka.cancelCsv())
ipcMain.handle('kafka:startLive', async (_event, topic: string) =>
  wrap(() =>
    kafka.startLive(topic, (record) => {
      win?.webContents.send('kafka:liveMessage', record)
    }),
  ),
)
ipcMain.handle('kafka:stopLive', () => wrap(() => kafka.stopLive()))
