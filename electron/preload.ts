import { electronAPISchemas, electronEventSchemas } from '../shared/electron-api-schema'

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const api: Record<string, unknown> = {}

for (const key of Object.keys(electronAPISchemas)) {
  api[key] = (input?: unknown) => ipcRenderer.invoke(key, input)
}

api.on = (channel: string, listener: (payload: unknown) => void) => {
  if (!(channel in electronEventSchemas)) {
    throw new Error(`Unknown IPC event channel: ${channel}`)
  }

  const wrappedListener = (_event: unknown, rawPayload: unknown) => {
    const schema = (electronEventSchemas as Record<string, any>)[channel]
    const parsed = schema ? schema.safeParse(rawPayload) : { success: true, data: rawPayload }
    if (parsed.success) {
      listener(parsed.data)
    } else {
      console.error(`[IPC] Invalid event payload received on channel "${channel}":`, parsed.error)
    }
  }

  ipcRenderer.on(channel, wrappedListener)

  return () => {
    ipcRenderer.removeListener(channel, wrappedListener)
  }
}

api.getPathForFile = (file: File) => webUtils.getPathForFile(file)

api.platform = process.platform

contextBridge.exposeInMainWorld('electronAPI', api)

export {}

