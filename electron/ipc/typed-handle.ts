import type { IpcMain } from 'electron'
import { createRequire } from 'module'
import { z } from 'zod'
import { electronAPISchemas } from '../../shared/electron-api-schema'

const require = createRequire(import.meta.url)
let ipcMainInstance: IpcMain | null = null
try {
  const electron = require('electron')
  if (typeof electron !== 'string' && electron) {
    ipcMainInstance = (electron.ipcMain || electron.default?.ipcMain) as IpcMain
  }
} catch {
  // Outside electron runtime
}

type Schemas = typeof electronAPISchemas

export function handle<K extends keyof Schemas>(
  key: K & string,
  handler: (
    input: z.infer<Schemas[K]['input']>,
  ) => Promise<z.infer<Schemas[K]['output']>> | z.infer<Schemas[K]['output']>,
): void {
  if (ipcMainInstance) {
    ipcMainInstance.handle(key, (_event, input) => handler(input ?? {}))
  }
}
