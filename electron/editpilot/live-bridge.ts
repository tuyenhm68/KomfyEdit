import net from 'net'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { CONFIRM_TIMEOUT_MS, normalizeConfirmRequest } from '../../core/src/editpilot-confirm'
import { emitToRenderer } from '../ipc/event-emitter'

export interface LivePatchResponse {
  requestId: string
  success: boolean
  error?: string
  description?: string
  appliedCount?: number
}

export interface LiveUndoResponse {
  requestId: string
  success: boolean
  error?: string
  description?: string
}

export interface LiveConfirmResponse {
  requestId: string
  /** The button the user pressed, absent when the card was dismissed. */
  actionId?: string
  dismissed?: boolean
}

interface PendingRequest {
  resolve: (res: any) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

export class LiveBridgeServer {
  public port: number = 0
  private server: net.Server | null = null
  private projectId: string
  private lockFilePath: string
  private pendingRequests = new Map<string, PendingRequest>()

  constructor(projectId: string) {
    this.projectId = projectId
    this.lockFilePath = path.join(os.tmpdir(), `komfyedit-live-${projectId}.json`)
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer(socket => {
        let buffer = ''

        socket.on('data', async data => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const msg = JSON.parse(trimmed)
              await this.handleMessage(socket, msg)
            } catch (err: any) {
              socket.write(JSON.stringify({ success: false, error: err.message }) + '\n')
            }
          }
        })

        socket.on('error', () => {
          // Socket error handled
        })
      })

      this.server.on('error', err => {
        reject(err)
      })

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address()
        if (addr && typeof addr === 'object') {
          this.port = addr.port
          try {
            fs.writeFileSync(
              this.lockFilePath,
              JSON.stringify({ port: this.port, projectId: this.projectId, pid: process.pid }),
              'utf8',
            )
          } catch {
            // best effort
          }
          resolve(this.port)
        } else {
          reject(new Error('Failed to obtain server address'))
        }
      })
    })
  }

  private async handleMessage(socket: net.Socket, msg: any): Promise<void> {
    const requestId = msg.requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    if (msg.action === 'ping') {
      socket.write(JSON.stringify({ success: true, open: true, projectId: this.projectId }) + '\n')
      return
    }

    if (msg.action === 'apply_patch') {
      try {
        const responsePromise = new Promise<LivePatchResponse>((res, rej) => {
          const timer = setTimeout(() => {
            this.pendingRequests.delete(requestId)
            rej(new Error('Timed out waiting for renderer to apply patch'))
          }, 15000)

          this.pendingRequests.set(requestId, { resolve: res, reject: rej, timer })
        })

        emitToRenderer('editpilot:live-apply-patch', {
          requestId,
          projectId: this.projectId,
          patch: msg.patch,
        })

        const result = await responsePromise
        socket.write(JSON.stringify(result) + '\n')
      } catch (err: any) {
        socket.write(JSON.stringify({ success: false, error: err.message }) + '\n')
      }
      return
    }

    if (msg.action === 'confirm') {
      // Parked, not polled: the agent's tool call stays open until the user
      // presses a button, so nothing is edited while the card is on screen.
      try {
        const request = normalizeConfirmRequest({ ...(msg.request ?? {}), requestId })
        const responsePromise = new Promise<LiveConfirmResponse>((res, rej) => {
          const timer = setTimeout(() => {
            this.pendingRequests.delete(requestId)
            rej(new Error('Timed out waiting for the user to answer'))
          }, CONFIRM_TIMEOUT_MS)

          this.pendingRequests.set(requestId, { resolve: res, reject: rej, timer })
        })

        emitToRenderer('editpilot:live-confirm', {
          projectId: this.projectId,
          request,
        })

        const result = await responsePromise
        socket.write(JSON.stringify({ success: true, ...result }) + '\n')
      } catch (err: any) {
        socket.write(JSON.stringify({ success: false, error: err.message, timedOut: true }) + '\n')
      }
      return
    }

    if (msg.action === 'undo') {
      try {
        const responsePromise = new Promise<LiveUndoResponse>((res, rej) => {
          const timer = setTimeout(() => {
            this.pendingRequests.delete(requestId)
            rej(new Error('Timed out waiting for renderer to undo'))
          }, 15000)

          this.pendingRequests.set(requestId, { resolve: res, reject: rej, timer })
        })

        emitToRenderer('editpilot:live-undo', {
          requestId,
          projectId: this.projectId,
        })

        const result = await responsePromise
        socket.write(JSON.stringify(result) + '\n')
      } catch (err: any) {
        socket.write(JSON.stringify({ success: false, error: err.message }) + '\n')
      }
      return
    }

    socket.write(JSON.stringify({ success: false, error: `Unknown action: ${msg.action}` }) + '\n')
  }

  public resolvePatchResponse(response: LivePatchResponse): boolean {
    const pending = this.pendingRequests.get(response.requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    this.pendingRequests.delete(response.requestId)
    pending.resolve(response)
    return true
  }

  public resolveConfirmResponse(response: LiveConfirmResponse): boolean {
    const pending = this.pendingRequests.get(response.requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    this.pendingRequests.delete(response.requestId)
    pending.resolve(response)
    return true
  }

  public resolveUndoResponse(response: LiveUndoResponse): boolean {
    const pending = this.pendingRequests.get(response.requestId)
    if (!pending) return false
    clearTimeout(pending.timer)
    this.pendingRequests.delete(response.requestId)
    pending.resolve(response)
    return true
  }

  public close(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Live bridge closed'))
    }
    this.pendingRequests.clear()
    if (fs.existsSync(this.lockFilePath)) {
      try {
        fs.unlinkSync(this.lockFilePath)
      } catch {
        // best effort
      }
    }
  }
}

// ── Global Live Bridge Registry ─────────────────────────────────────────────

const activeBridges = new Map<string, LiveBridgeServer>()

export async function getOrCreateLiveBridge(projectId: string): Promise<LiveBridgeServer> {
  const existing = activeBridges.get(projectId)
  if (existing && existing.port > 0) return existing

  const server = new LiveBridgeServer(projectId)
  await server.start()
  activeBridges.set(projectId, server)
  return server
}

export function getLiveBridge(projectId: string): LiveBridgeServer | undefined {
  return activeBridges.get(projectId)
}

export function closeLiveBridge(projectId: string): void {
  const bridge = activeBridges.get(projectId)
  if (bridge) {
    bridge.close()
    activeBridges.delete(projectId)
  }
}

export function closeAllLiveBridges(): void {
  for (const [, bridge] of activeBridges) {
    bridge.close()
  }
  activeBridges.clear()
}

export function handleLivePatchResponse(response: LivePatchResponse): boolean {
  for (const [, bridge] of activeBridges) {
    if (bridge.resolvePatchResponse(response)) return true
  }
  return false
}

export function handleLiveConfirmResponse(response: LiveConfirmResponse): boolean {
  for (const [, bridge] of activeBridges) {
    if (bridge.resolveConfirmResponse(response)) return true
  }
  return false
}

export function handleLiveUndoResponse(response: LiveUndoResponse): boolean {
  for (const [, bridge] of activeBridges) {
    if (bridge.resolveUndoResponse(response)) return true
  }
  return false
}
