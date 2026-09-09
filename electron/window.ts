import { app, BrowserWindow, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { isDev, getCurrentDir } from './config'
import { logger } from './logger'
import { emitToRenderer } from './ipc/event-emitter'

let mainWindow: BrowserWindow | null = null

export function createWindow(): BrowserWindow {
  // No native menu bar: every command already lives in the in-app "Menu"
  // dropdown, and the window is frameless so there is nothing to attach to.
  Menu.setApplicationMenu(null)

  // Get the path to preload script
  const preloadPath = isDev
    ? path.join(getCurrentDir(), 'dist-electron', 'preload.js')
    : path.join(app.getAppPath(), 'dist-electron', 'preload.js')

  // App icon — .ico on Windows, .png elsewhere. getCurrentDir() is the cwd in
  // dev, so also look next to the app path in case Electron was started from
  // somewhere else, and fall back to the .png when the .ico fails to decode.
  const iconNames = process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png']
  const iconRoots = [getCurrentDir(), app.getAppPath()]
  let appIcon: Electron.NativeImage | undefined
  for (const root of iconRoots) {
    for (const name of iconNames) {
      const iconPath = path.join(root, 'resources', name)
      if (!fs.existsSync(iconPath)) continue
      const candidate = nativeImage.createFromPath(iconPath)
      if (candidate.isEmpty()) {
        logger.warn(`[icon] Failed to decode app icon: ${iconPath}`)
        continue
      }
      logger.info(`[icon] Loaded app icon from: ${iconPath}`)
      appIcon = candidate
      break
    }
    if (appIcon) break
  }
  if (!appIcon) logger.warn('[icon] No app icon found; using the Electron default')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: appIcon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: isDev ? false : true,
    },
    backgroundColor: '#1a1a1a',
    // Frameless: the renderer draws its own title bar with the window
    // controls docked next to Export.
    frame: false,
    show: false,
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // DevTools can be opened manually with Ctrl+Shift+I or F12
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  // Windows sometimes keeps the launching exe's icon on the taskbar button
  // unless the icon is set on the live window as well as in the constructor.
  if (appIcon) mainWindow.setIcon(appIcon)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  // The renderer's maximise button needs to track state changes that come
  // from elsewhere too — double-click on the drag strip, Win+Up, snapping.
  const sendMaximizeState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    emitToRenderer('window:maximize-changed', { isMaximized: mainWindow.isMaximized() }, mainWindow)
  }
  mainWindow.on('maximize', sendMaximizeState)
  mainWindow.on('unmaximize', sendMaximizeState)

  // DevTools and reload used to ride on the default menu's accelerators.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return
    const key = input.key.toLowerCase()
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      mainWindow?.webContents.toggleDevTools()
    } else if (isDev && input.control && key === 'r') {
      mainWindow?.webContents.reload()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
