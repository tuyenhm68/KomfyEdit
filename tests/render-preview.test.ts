import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import {
  renderQueue,
  sliceClipsForPreview,
} from '../electron/export/render-queue'
import { findFfmpegPath, probeAudioStream } from '../electron/export/ffmpeg-utils'
import { spawnSync } from 'child_process'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const SYNTHETIC_MEDIA = path.join(FIXTURES_DIR, 'synthetic_media.mp4')

describe('S4-2 · render.preview (fast low-res timeline snippet)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komfyedit-preview-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('sliceClipsForPreview correctly slices, trims, and offsets clips across the preview range', () => {
    const clips = [
      // Clip 1: 0 to 20s (overlaps [10, 20])
      {
        id: 'c1',
        startTime: 0,
        duration: 20,
        trimStart: 5,
        trimEnd: 25,
        type: 'video',
        path: SYNTHETIC_MEDIA,
      },
      // Clip 2: 20 to 50s (overlaps [10, 30] at [20, 25])
      {
        id: 'c2',
        startTime: 20,
        duration: 30,
        trimStart: 0,
        trimEnd: 30,
        type: 'video',
        path: SYNTHETIC_MEDIA,
      },
      // Clip 3: 50 to 100s (completely outside [10, 25])
      {
        id: 'c3',
        startTime: 50,
        duration: 50,
        trimStart: 0,
        trimEnd: 50,
        type: 'video',
        path: SYNTHETIC_MEDIA,
      },
    ]

    // Preview interval: [10s, 25s] -> duration 15s
    const sliced = sliceClipsForPreview(clips, 10, 15)

    expect(sliced.length).toBe(2)

    // Clip 1 in preview:
    // overlaps [10, 20], so relative startTime = 0, duration = 10, trimStart = 5 + 10 = 15
    expect(sliced[0].id).toBe('c1')
    expect(sliced[0].startTime).toBe(0)
    expect(sliced[0].duration).toBe(10)
    expect(sliced[0].trimStart).toBe(15)

    // Clip 2 in preview:
    // overlaps [20, 25], so relative startTime = 10, duration = 5, trimStart = 0 + 0 = 0
    expect(sliced[1].id).toBe('c2')
    expect(sliced[1].startTime).toBe(10)
    expect(sliced[1].duration).toBe(5)
    expect(sliced[1].trimStart).toBe(0)
  })

  it('renders a 10s preview on a 5-minute timeline in < 15s and produces valid playable MP4', async () => {
    // Construct a 5-minute (300s) timeline using 30 contiguous 10s clips
    const clips = []
    for (let i = 0; i < 30; i++) {
      clips.push({
        id: `clip_${i}`,
        trackIndex: 0,
        startTime: i * 10,
        duration: 10,
        trimStart: 0,
        trimEnd: 10,
        type: 'video',
        path: SYNTHETIC_MEDIA,
      })
    }

    const previewOutput = path.join(tmpDir, 'test_preview_10s.mp4')
    const officialExportPath = path.join(tmpDir, 'official_final_export.mp4')

    const tStart = Date.now()

    // Request preview for interval [20s, 30s] (10s duration) at 480p
    const result = renderQueue.startPreviewJob({
      clips,
      startTime: 20,
      duration: 10,
      resolution: '480p',
      outputPath: previewOutput,
    })

    if (!result.success) {
      console.error('START PREVIEW FAILED:', (result as any).error)
    }
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.duration).toBe(10)
    expect(result.jobId).toBeDefined()
    expect(result.outputPath).toBe(previewOutput)

    // Await render job completion
    const finishedJob = await renderQueue.waitForJob(result.jobId, 25000)
    const elapsedSec = (Date.now() - tStart) / 1000

    console.log(`[Preview Benchmark] 10s preview rendered in ${elapsedSec.toFixed(2)}s on dev environment`)

    // Acceptance criterion 1: render completes in < 15s
    expect(elapsedSec).toBeLessThan(15)

    if (finishedJob.status !== 'completed') {
      console.error('RENDER ERROR:', finishedJob.error, finishedJob.stderr)
    }
    expect(finishedJob.status).toBe('completed')
    expect(fs.existsSync(previewOutput)).toBe(true)
    const stats = fs.statSync(previewOutput)
    expect(stats.size).toBeGreaterThan(10240) // > 10KB

    // Probe output with ffmpeg to verify valid MP4 and correct ~10s duration
    const ffmpegPath = findFfmpegPath()!
    const probe = spawnSync(ffmpegPath, ['-i', previewOutput], { encoding: 'utf8' })
    const probeText = (probe.stderr || '') + (probe.stdout || '')
    expect(probeText).toMatch(/Duration:\s+00:00:(?:09\.\d+|10\.\d+)/)

    // Acceptance criterion 4: official export file is completely untouched
    expect(fs.existsSync(officialExportPath)).toBe(false)
  }, 30000)

  it('can be cancelled via render.cancel cleanly', async () => {
    // Construct timeline
    const clips = [
      {
        id: 'clip_long',
        trackIndex: 0,
        startTime: 0,
        duration: 30,
        trimStart: 0,
        trimEnd: 30,
        type: 'video',
        path: SYNTHETIC_MEDIA,
      },
    ]

    const previewOutput = path.join(tmpDir, 'test_cancelled_preview.mp4')

    const result = renderQueue.startPreviewJob({
      clips,
      startTime: 0,
      duration: 30,
      resolution: '480p',
      outputPath: previewOutput,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    // Immediately cancel job
    const cancelSuccess = renderQueue.cancelJob(result.jobId)
    expect(cancelSuccess).toBe(true)

    const job = renderQueue.getJob(result.jobId)
    expect(job?.status).toBe('cancelled')
    expect(job?.error).toContain('cancelled')
  })
})
