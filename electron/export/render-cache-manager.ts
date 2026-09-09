import path from 'path'
import fs from 'fs'
import os from 'os'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
import { renderQueue } from './render-queue'
import { emitToRenderer } from '../ipc/event-emitter'
import { logger } from '../logger'

export interface RenderCacheRequestParams {
  hash: string
  startTime: number
  duration: number
  clips: any[]
  transitions?: any[]
  background?: any
  letterbox?: any
  resolution?: '360p' | '480p' | '720p'
  fps?: number
}

export class RenderCacheManager {
  private customDir?: string
  private inFlight = new Map<string, Promise<{ success: boolean; cachePath?: string; error?: string }>>()
  private initialized = false

  constructor(customDir?: string) {
    this.customDir = customDir
  }

  getCacheDir(): string {
    if (this.customDir) {
      if (!fs.existsSync(this.customDir)) {
        fs.mkdirSync(this.customDir, { recursive: true })
      }
      return this.customDir
    }

    let baseDir: string
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      if (app && typeof app.getPath === 'function') {
        baseDir = path.join(app.getPath('userData'), 'render-cache')
      } else {
        baseDir = path.join(os.tmpdir(), 'komfyedit-render-cache')
      }
    } catch {
      baseDir = path.join(os.tmpdir(), 'komfyedit-render-cache')
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true })
    }
    return baseDir
  }

  init(): void {
    if (this.initialized) return
    this.initialized = true
    this.cleanupInterruptedFiles()
  }

  cleanupInterruptedFiles(): void {
    const dir = this.getCacheDir()
    try {
      if (!fs.existsSync(dir)) return
      const files = fs.readdirSync(dir)
      for (const file of files) {
        const fullPath = path.join(dir, file)
        if (file.endsWith('.part')) {
          try {
            fs.unlinkSync(fullPath)
            logger.info(`[render-cache] cleaned up incomplete file: ${file}`)
          } catch (err) {
            logger.warn(`[render-cache] failed to remove partial file ${file}: ${String(err)}`)
          }
        } else if (file.endsWith('.mp4')) {
          try {
            const stat = fs.statSync(fullPath)
            if (stat.size === 0) {
              fs.unlinkSync(fullPath)
              logger.info(`[render-cache] cleaned up 0-byte file: ${file}`)
            }
          } catch {}
        }
      }
    } catch (err) {
      logger.error(`[render-cache] error scanning cache dir for cleanup: ${String(err)}`)
    }
  }

  getSegmentPath(hash: string): string {
    return path.join(this.getCacheDir(), `segment_${hash}.mp4`)
  }

  getPartPath(hash: string): string {
    return path.join(this.getCacheDir(), `segment_${hash}.mp4.part`)
  }

  hasCache(hash: string): boolean {
    this.init()
    const p = this.getSegmentPath(hash)
    if (!fs.existsSync(p)) return false
    try {
      return fs.statSync(p).size > 0
    } catch {
      return false
    }
  }

  getCachePath(hash: string): string | null {
    if (this.hasCache(hash)) {
      return this.getSegmentPath(hash)
    }
    return null
  }

  checkHashes(hashes: string[]): Record<string, { ready: boolean; path?: string }> {
    this.init()
    const result: Record<string, { ready: boolean; path?: string }> = {}
    for (const h of hashes) {
      const cached = this.getCachePath(h)
      if (cached) {
        result[h] = { ready: true, path: cached }
      } else {
        result[h] = { ready: false }
      }
    }
    return result
  }

  renderSegment(params: RenderCacheRequestParams): Promise<{ success: boolean; cachePath?: string; error?: string }> {
    this.init()
    const { hash, startTime, duration, clips, transitions, background, letterbox, resolution, fps } = params

    // If cache already exists, return immediately
    const existing = this.getCachePath(hash)
    if (existing) {
      return Promise.resolve({ success: true, cachePath: existing })
    }

    // If already in flight, reuse existing promise
    const inFlightPromise = this.inFlight.get(hash)
    if (inFlightPromise) {
      return inFlightPromise
    }

    const partPath = this.getPartPath(hash)
    const finalPath = this.getSegmentPath(hash)

    // Remove any stale .part file before starting
    try {
      if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
    } catch {}

    const promise = (async () => {
      try {
        const previewJob = renderQueue.startPreviewJob({
          clips,
          startTime,
          duration,
          resolution: resolution || '480p',
          outputPath: partPath,
          fps: fps || 30,
          background,
          letterbox,
          transitions,
        })

        if (!previewJob.success) {
          const err = previewJob.error || 'Failed to start segment preview render'
          emitToRenderer('render-cache:status', { hash, ready: false, error: err })
          return { success: false, error: err }
        }

        const finished = await renderQueue.waitForJob(previewJob.jobId)
        if (finished.status === 'completed' && fs.existsSync(partPath)) {
          if (fs.existsSync(finalPath)) {
            try { fs.unlinkSync(finalPath) } catch {}
          }
          fs.renameSync(partPath, finalPath)

          logger.info(`[render-cache] Segment cached successfully: ${finalPath}`)
          emitToRenderer('render-cache:status', { hash, ready: true, cachePath: finalPath })
          return { success: true, cachePath: finalPath }
        } else {
          try {
            if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
          } catch {}

          const err = finished.error || 'Render job failed'
          emitToRenderer('render-cache:status', { hash, ready: false, error: err })
          return { success: false, error: err }
        }
      } catch (err: any) {
        try {
          if (fs.existsSync(partPath)) fs.unlinkSync(partPath)
        } catch {}

        const errMsg = String(err?.message || err)
        emitToRenderer('render-cache:status', { hash, ready: false, error: errMsg })
        return { success: false, error: errMsg }
      } finally {
        this.inFlight.delete(hash)
      }
    })()

    this.inFlight.set(hash, promise)
    return promise
  }

  clearCache(): number {
    const dir = this.getCacheDir()
    let freedBytes = 0

    if (fs.existsSync(dir)) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          try {
            if (entry.isFile()) {
              freedBytes += fs.statSync(fullPath).size
              fs.unlinkSync(fullPath)
            } else if (entry.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true })
            }
          } catch {}
        }
      } catch (err) {
        logger.error(`[render-cache] error clearing render cache: ${String(err)}`)
      }
    }

    this.inFlight.clear()
    return freedBytes
  }
}

export const renderCacheManager = new RenderCacheManager()
