import './app-paths'
import { app } from 'electron'
import { resolveAppUserModelId } from './app-identity'
import { setupCSP } from './csp'
import { registerExportHandlers } from './export/export-handler'
import { findFfmpegPath, stopExportProcess } from './export/ffmpeg-utils'
import { detectHardwareEncoders } from './export/hardware-encoder'
import { registerAppHandlers } from './ipc/app-handlers'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerLogHandlers } from './ipc/log-handlers'
import { registerProjectHandlers } from './ipc/project-handlers'
import { registerVideoProcessingHandlers } from './ipc/video-processing-handlers'
import { registerEventTestHandlers } from './ipc/event-emitter'
import { registerEditPilotHandlers } from './ipc/editpilot-handlers'
import { registerWhisperHandlers } from './ipc/whisper-handlers'
import { logger } from './logger'
import { initSessionLog } from './logging-management'
import { checkForUpdatesOnStartup } from './updater'
import { createWindow, getMainWindow } from './window'

function logAppVersion(): void {
  if (!app.isPackaged) {
    logger.info('[KomfyEdit] Running in development mode')
  } else {
    logger.info(`[KomfyEdit] Version ${app.getVersion()}`)
  }
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  // See app-identity.ts: the id decides which icon the taskbar button draws.
  if (process.platform === 'win32') {
    app.setAppUserModelId(resolveAppUserModelId(app.isPackaged))
  }

  initSessionLog()
  logAppVersion()

  registerAppHandlers()
  registerFileHandlers()
  registerProjectHandlers()
  registerLogHandlers()
  registerExportHandlers()
  registerVideoProcessingHandlers()
  registerEventTestHandlers()
  registerEditPilotHandlers()
  registerWhisperHandlers()

  app.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      if (!mainWindow.isVisible()) {
        mainWindow.show()
      }
      mainWindow.focus()
      return
    }
    if (app.isReady()) {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    setupCSP()
    createWindow()

    checkForUpdatesOnStartup()

    // Probe hardware encoder capabilities on startup
    setTimeout(() => {
      try {
        const p = findFfmpegPath()
        if (p) detectHardwareEncoders(p)
      } catch (err) {
        logger.warn(`[main] Failed to probe hardware encoders on startup: ${String(err)}`)
      }
    }, 100)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (getMainWindow() === null) {
      createWindow()
    }
  })

  app.on('before-quit', () => {
    stopExportProcess()
  })
}
