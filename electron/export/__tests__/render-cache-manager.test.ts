import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { RenderCacheManager } from '../render-cache-manager'
import * as eventEmitter from '../../ipc/event-emitter'

describe('RenderCacheManager', () => {
  let tempDir: string
  let manager: RenderCacheManager
  const emittedEvents: Array<{ channel: string; payload: any }> = []

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `komfy-test-rcache-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    fs.mkdirSync(tempDir, { recursive: true })
    manager = new RenderCacheManager(tempDir)
    emittedEvents.length = 0

    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    } catch {}
    vi.restoreAllMocks()
  })

  it('cleans up interrupted .part files and 0-byte files on startup', () => {
    const partFile = path.join(tempDir, 'segment_abc.mp4.part')
    const corruptFile = path.join(tempDir, 'segment_empty.mp4')
    const validFile = path.join(tempDir, 'segment_valid.mp4')

    fs.writeFileSync(partFile, 'incomplete partial render')
    fs.writeFileSync(corruptFile, '') // 0 bytes
    fs.writeFileSync(validFile, 'valid rendered video bytes')

    expect(fs.existsSync(partFile)).toBe(true)
    expect(fs.existsSync(corruptFile)).toBe(true)
    expect(fs.existsSync(validFile)).toBe(true)

    manager.cleanupInterruptedFiles()

    expect(fs.existsSync(partFile)).toBe(false)
    expect(fs.existsSync(corruptFile)).toBe(false)
    expect(fs.existsSync(validFile)).toBe(true)
  })

  it('reports hasCache and getCachePath accurately', () => {
    const hash = 'f00ba41234567890'
    expect(manager.hasCache(hash)).toBe(false)
    expect(manager.getCachePath(hash)).toBeNull()

    const targetFile = manager.getSegmentPath(hash)
    fs.writeFileSync(targetFile, 'pre-rendered video data')

    expect(manager.hasCache(hash)).toBe(true)
    expect(manager.getCachePath(hash)).toBe(targetFile)
  })

  it('checks multiple hashes at once with checkHashes', () => {
    const hash1 = '1111222233334444'
    const hash2 = '5555666677778888'

    fs.writeFileSync(manager.getSegmentPath(hash1), 'rendered clip')

    const statusMap = manager.checkHashes([hash1, hash2])
    expect(statusMap[hash1]).toEqual({
      ready: true,
      path: manager.getSegmentPath(hash1),
    })
    expect(statusMap[hash2]).toEqual({
      ready: false,
    })
  })

  it('returns existing cache without spawning job if segment already cached', async () => {
    const hash = 'cached123'
    fs.writeFileSync(manager.getSegmentPath(hash), 'already done')

    const result = await manager.renderSegment({
      hash,
      startTime: 0,
      duration: 5,
      clips: [],
    })

    expect(result.success).toBe(true)
    expect(result.cachePath).toBe(manager.getSegmentPath(hash))
  })

  it('clears all cache files and returns freed bytes', () => {
    const file1 = path.join(tempDir, 'segment_1.mp4')
    const file2 = path.join(tempDir, 'segment_2.mp4')
    fs.writeFileSync(file1, '12345')
    fs.writeFileSync(file2, '67890')

    const freed = manager.clearCache()
    expect(freed).toBe(10)
    expect(fs.existsSync(file1)).toBe(false)
    expect(fs.existsSync(file2)).toBe(false)
  })
})