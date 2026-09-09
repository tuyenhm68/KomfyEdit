import type { BrowserWindow as BrowserWindowType } from 'electron'
import { createRequire } from 'module'
import {
  electronEventSchemas,
  type ElectronEventChannel,
  type ElectronEventPayload,
} from '../../shared/electron-api-schema'

const require = createRequire(import.meta.url)
let BrowserWindowClass: typeof BrowserWindowType | null = null
try {
  const electron = require('electron')
  if (typeof electron !== 'string' && electron) {
    BrowserWindowClass = electron.BrowserWindow || electron.default?.BrowserWindow
  }
} catch {
  // Outside electron runtime
}

/**
 * Emits a strongly-typed IPC event from the Electron main process to renderer windows.
 * Validates payload with the registered Zod event schema before sending.
 */
export function emitToRenderer<K extends ElectronEventChannel>(
  channel: K,
  payload: ElectronEventPayload<K>,
  targetWindow?: BrowserWindowType | null,
): void {
  const schema = electronEventSchemas[channel]
  const validated = schema.parse(payload)

  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send(channel, validated)
    return
  }

  if (!BrowserWindowClass || !BrowserWindowClass.getAllWindows) {
    return
  }

  const windows = BrowserWindowClass.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, validated)
    }
  }
}

/**
 * Registers the test IPC handler that allows triggering test events to verify the pipeline.
 */
export async function registerEventTestHandlers(): Promise<void> {
  const { handle } = await import('./typed-handle')
  handle('triggerTestEvent', async input => {
    emitToRenderer('test:ping', {
      message: input.message,
      timestamp: Date.now(),
    })
    return { success: true }
  })
}
