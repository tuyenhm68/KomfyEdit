import { describe, expect, it, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { renderQueue } from '../render-queue'
import * as eventEmitter from '../../ipc/event-emitter'

const createMockExportClip = (overrides: any = {}) => ({
  id: 'clip-test',
  type: 'video',
  path: '/mock/video.mp4',
  startTime: 0,
  duration: 20,
  trimStart: 0,
  speed: 1,
  reversed: false,
  flipH: false,
  flipV: false,
  opacity: 1,
  trackIndex: 0,
  muted: false,
  volume: 1,
  ...overrides,
})

vi.mock('../ffmpeg-utils', () => {
  return {
    findFfmpegPath: () => '/mock/bin/ffmpeg',
    runFfmpegWithProgress: vi.fn((_path, _args, onProgress) => {
      let isKilled = false
      return {
        process: {
          kill: () => {
            isKilled = true
          },
        },
        promise: new Promise(resolve => {
          setTimeout(() => {
            if (onProgress && !isKilled) {
              onProgress({ outTimeUs: 5_000_000, fps: 30, speed: 1.2 })
              onProgress({ outTimeUs: 10_000_000, fps: 30, speed: 1.5 })
            }
          }, 5)
          setTimeout(() => {
            if (isKilled) {
              resolve({ success: false, error: 'Process cancelled', stderr: 'SIGTERM' })
            } else {
              resolve({ success: true, stderr: '' })
            }
          }, 25)
        }),
        kill: () => {
          isKilled = true
        },
      }
    }),
  }
})

vi.mock('../audio-mix', () => ({
  mixAudioToPcm: vi.fn(async () => ({
    pcmBuffer: Buffer.alloc(100),
    sampleRate: 48000,
    channels: 2,
  })),
}))

vi.mock('../../path-validation', () => ({
  validatePath: vi.fn(),
}))

vi.mock('../../config', () => ({
  getAllowedRoots: vi.fn(() => ['/']),
}))

describe('S2-4: Asynchronous Render Queue & Real FFmpeg Progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
  })

  it('render.start trả jobId ngay lập tức và phát sự kiện tiến độ thật', async () => {
    const emittedEvents: Array<{ channel: string; payload: any }> = []
    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })

    const result = renderQueue.startJob({
      clips: [createMockExportClip({ duration: 20 })],
      outputPath: '/mock/output.mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      quality: 18,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Failed to start')
    expect(result.jobId).toMatch(/^render-/)

    // Wait for the async job to progress and complete
    await new Promise(resolve => setTimeout(resolve, 120))

    const progressEvents = emittedEvents.filter(e => e.channel === 'render:progress')
    expect(progressEvents.length).toBeGreaterThan(0)

    // Verify progress values are parsed from ffmpeg out_time_us
    for (const evt of progressEvents) {
      expect(evt.payload.jobId).toBe(result.jobId)
      expect(evt.payload.percent).toBeGreaterThanOrEqual(0)
      expect(evt.payload.percent).toBeLessThanOrEqual(100)
    }

    // Verify render:complete event was emitted
    const completeEvents = emittedEvents.filter(e => e.channel === 'render:complete')
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0].payload.jobId).toBe(result.jobId)
  })

  it('render.cancel(jobId) chỉ giết đúng job đó; job khác chạy tiếp (test với 2 job)', async () => {
    const emittedEvents: Array<{ channel: string; payload: any }> = []
    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })

    // Start Job 1
    const job1 = renderQueue.startJob({
      clips: [createMockExportClip({ id: 'c1', path: '/mock/v1.mp4', duration: 30 })],
      outputPath: '/mock/output1.mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      quality: 18,
    })
    expect(job1.success).toBe(true)
    if (!job1.success) throw new Error('Job 1 failed')

    // Start Job 2
    const job2 = renderQueue.startJob({
      clips: [createMockExportClip({ id: 'c2', path: '/mock/v2.mp4', duration: 30 })],
      outputPath: '/mock/output2.mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      quality: 18,
    })
    expect(job2.success).toBe(true)
    if (!job2.success) throw new Error('Job 2 failed')

    // Cancel ONLY Job 1 immediately
    const cancelled = renderQueue.cancelJob(job1.jobId)
    expect(cancelled).toBe(true)

    // Job 1 status must be cancelled
    const job1Status = renderQueue.getJob(job1.jobId)
    expect(job1Status?.status).toBe('cancelled')

    // Job 2 must STILL be running
    const job2Status = renderQueue.getJob(job2.jobId)
    expect(job2Status?.status).toBe('running')

    // Wait for Job 2 to finish
    await new Promise(resolve => setTimeout(resolve, 150))

    // Job 2 completed successfully!
    expect(job2Status?.status).toBe('completed')
    const job2Complete = emittedEvents.find(
      e => e.channel === 'render:complete' && e.payload.jobId === job2.jobId,
    )
    expect(job2Complete).toBeDefined()
  })

  it('Job lỗi phát sự kiện lỗi kèm stderr ffmpeg, không treo', async () => {
    const { runFfmpegWithProgress } = await import('../ffmpeg-utils')
    vi.mocked(runFfmpegWithProgress).mockImplementationOnce(() => ({
      process: { kill: vi.fn() } as any,
      promise: Promise.resolve({
        success: false,
        error: 'FFmpeg failed (code 1)',
        stderr: 'Error initializing filtergraph: Invalid dimensions',
      }),
      kill: vi.fn(),
    }))

    const emittedEvents: Array<{ channel: string; payload: any }> = []
    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })

    const result = renderQueue.startJob({
      clips: [createMockExportClip({ id: 'c1', path: '/mock/v1.mp4', duration: 10 })],
      outputPath: '/mock/err.mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
      quality: 18,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Start failed')

    await new Promise(resolve => setTimeout(resolve, 50))

    const errorEvent = emittedEvents.find(e => e.channel === 'render:error' && e.payload.jobId === result.jobId)
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.payload.error).toContain('FFmpeg')
    expect(errorEvent?.payload.stderr).toContain('Invalid dimensions')

    const job = renderQueue.getJob(result.jobId)
    expect(job?.status).toBe('failed')
  })

  it('Không còn số 50 đặt cứng trong ExportModal.tsx (grep)', () => {
    const exportModalPath = path.resolve(__dirname, '../../../frontend/components/ExportModal.tsx')
    const content = fs.readFileSync(exportModalPath, 'utf8')
    expect(content).not.toContain('setExportProgress(50)')
  })

  it('Hỗ trợ render GIF với 2-pass palettegen/paletteuse và bỏ qua audio mix', async () => {
    const emittedEvents: Array<{ channel: string; payload: any }> = []
    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })

    const result = renderQueue.startJob({
      clips: [createMockExportClip({ duration: 5 })],
      outputPath: '/mock/animated.gif',
      codec: 'gif',
      width: 480,
      height: 480,
      fps: 15,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Failed to start GIF export')

    await new Promise(resolve => setTimeout(resolve, 120))

    const completeEvents = emittedEvents.filter(e => e.channel === 'render:complete')
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0].payload.jobId).toBe(result.jobId)
  })

  it('Hỗ trợ xuất riêng Audio (WAV / MP3 / AAC) chỉ với audio clips', async () => {
    const emittedEvents: Array<{ channel: string; payload: any }> = []
    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })

    const result = renderQueue.startJob({
      clips: [
        createMockExportClip({
          type: 'audio',
          path: '/mock/audio.mp3',
          duration: 15,
        }),
      ],
      outputPath: '/mock/output.wav',
      codec: 'wav',
      width: 1920,
      height: 1080,
      fps: 30,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Failed to start Audio export')

    await new Promise(resolve => setTimeout(resolve, 120))

    const completeEvents = emittedEvents.filter(e => e.channel === 'render:complete')
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0].payload.jobId).toBe(result.jobId)
  })

  it('Hỗ trợ xuất video với clip có Speed Ramp keyframes', async () => {
    const emittedEvents: Array<{ channel: string; payload: any }> = []
    vi.spyOn(eventEmitter, 'emitToRenderer').mockImplementation((channel, payload) => {
      emittedEvents.push({ channel, payload })
    })

    const rampClip = createMockExportClip({
      id: 'ramp-clip-1',
      duration: 10,
      keyframes: [
        {
          property: 'speed',
          points: [
            { t: 0, value: 1, easing: 'linear' },
            { t: 3, value: 0.25, easing: 'ease-in-out' },
            { t: 7, value: 0.25, easing: 'ease-in-out' },
            { t: 10, value: 1, easing: 'linear' },
          ],
        },
      ],
    })

    const result = renderQueue.startJob({
      clips: [rampClip],
      outputPath: '/mock/output_ramp.mp4',
      codec: 'h264',
      width: 1920,
      height: 1080,
      fps: 30,
    })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Failed to start Speed Ramp export')

    await new Promise(resolve => setTimeout(resolve, 120))

    const completeEvents = emittedEvents.filter(e => e.channel === 'render:complete')
    expect(completeEvents).toHaveLength(1)
    expect(completeEvents[0].payload.jobId).toBe(result.jobId)
  })
})

