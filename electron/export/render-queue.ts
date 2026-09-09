import path from 'path'
import fs from 'fs'
import os from 'os'
import type { ChildProcess } from 'child_process'
import { getAllowedRoots } from '../config'
import { validatePath } from '../path-validation'
import { emitToRenderer } from '../ipc/event-emitter'
import { logger } from '../logger'
import {
  findFfmpegPath,
  runFfmpegWithProgress,
  type FfmpegProcessHandle,
} from './ffmpeg-utils'
import { getTimelineDuration } from './timeline'
import { buildVideoFilterGraph } from './video-filter'
import { mixAudioToPcm } from './audio-mix'
import {
  estimateExportIntermediateSize,
  checkDiskSpaceForExport,
  formatBytes,
} from './export-handler'
import {
  detectHardwareEncoders,
  getEncoderArgs,
  getEncoderDisplayName,
} from './hardware-encoder'
import {
  formatSupportsChapters,
  generateFfmetadataChapters,
  type ExportMarkerParam,
} from './chapter-utils'

export type RenderJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Read the job's status without TypeScript's stale narrowing.
 *
 * `runJob` assigns `status = 'running'`, after which control-flow analysis
 * treats the property as that literal for the rest of the function — even
 * across `await`. But `cancelJob` mutates the same object from outside, so the
 * cancel checks really are reachable. Reading through a function parameter
 * gives the comparison the full union again.
 */
function isCancelled(job: { status: RenderJobStatus }): boolean {
  const status: RenderJobStatus = job.status
  return status === 'cancelled'
}

export interface RenderJob {
  id: string
  status: RenderJobStatus
  percent: number
  outputPath?: string
  duration?: number
  error?: string
  stderr?: string
  activeHandle?: FfmpegProcessHandle | null
  cleanup?: () => void
  createdAt: number
  onFinishListeners?: Array<(job: RenderJob) => void>
}

export interface RenderStartParams {
  clips: any[]
  outputPath: string
  codec: string
  width: number
  height: number
  fps: number
  quality?: number
  background?: any
  letterbox?: { ratio: number; color: string; opacity: number }
  subtitles?: any[]
  transitions?: any[]
  hardwareAcceleration?: boolean
  markers?: ExportMarkerParam[]
  videoBitrate?: number
  audioBitrate?: number
}

export interface RenderPreviewParams {
  clips: any[]
  startTime?: number
  endTime?: number
  duration?: number
  resolution?: '480p' | '360p' | '720p'
  outputPath?: string
  fps?: number
  background?: any
  letterbox?: { ratio: number; color: string; opacity: number }
  subtitles?: any[]
  transitions?: any[]
}

export function sliceClipsForPreview(
  clips: any[],
  startTime: number,
  duration: number,
): any[] {
  const endTime = startTime + duration
  const sliced: any[] = []

  for (const clip of clips) {
    const clipStart = typeof clip.startTime === 'number' ? clip.startTime : (clip.timelineStart ?? 0)
    const clipDuration = typeof clip.duration === 'number' ? clip.duration : (clip.timelineEnd ? clip.timelineEnd - clipStart : 0)
    const clipEnd = clipStart + clipDuration

    if (clipEnd <= startTime || clipStart >= endTime) {
      continue
    }

    const overlapStart = Math.max(clipStart, startTime)
    const overlapEnd = Math.min(clipEnd, endTime)
    const trimmedDuration = overlapEnd - overlapStart

    if (trimmedDuration <= 0) continue

    const newStartTime = Math.max(0, overlapStart - startTime)
    const trimDelta = overlapStart - clipStart
    const originalTrimStart = typeof clip.trimStart === 'number' ? clip.trimStart : 0
    const newTrimStart = originalTrimStart + trimDelta

    const clipPath = clip.path || clip.asset?.path || ''

    sliced.push({
      ...clip,
      path: clipPath,
      startTime: newStartTime,
      duration: trimmedDuration,
      trimStart: newTrimStart,
      trimEnd: newTrimStart + trimmedDuration,
    })
  }

  return sliced
}

class RenderQueueManager {
  private jobs = new Map<string, RenderJob>()

  public getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId)
  }

  public getActiveJobCount(): number {
    let count = 0
    for (const job of this.jobs.values()) {
      if (job.status === 'running' || job.status === 'queued') count++
    }
    return count
  }

  private notifyFinish(job: RenderJob): void {
    if (job.onFinishListeners) {
      const listeners = [...job.onFinishListeners]
      job.onFinishListeners = []
      for (const listener of listeners) {
        try {
          listener(job)
        } catch {}
      }
    }
  }

  public async waitForJob(jobId: string, timeoutMs = 60000): Promise<RenderJob> {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Job "${jobId}" not found`)
    if (job.status === 'completed' || job.status === 'failed' || isCancelled(job)) {
      return job
    }

    return new Promise<RenderJob>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for render job "${jobId}" after ${timeoutMs}ms`))
      }, timeoutMs)

      if (!job.onFinishListeners) job.onFinishListeners = []
      job.onFinishListeners.push(finishedJob => {
        clearTimeout(timer)
        resolve(finishedJob)
      })
    })
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId)
    if (!job) return false

    if (job.status === 'running' || job.status === 'queued') {
      logger.info(`[RenderQueue] Cancelling job ${jobId}`)
      job.status = 'cancelled'
      job.error = 'Export cancelled'
      if (job.activeHandle) {
        job.activeHandle.kill()
      }
      if (job.cleanup) {
        job.cleanup()
      }
      this.notifyFinish(job)
      emitToRenderer('render:error', {
        jobId,
        error: 'Export cancelled',
      })
      return true
    }

    return false
  }

  public startPreviewJob(params: RenderPreviewParams): {
    success: true
    jobId: string
    outputPath: string
    duration: number
  } | {
    success: false
    error: string
  } {
    const startTime = Math.max(0, params.startTime ?? 0)
    const duration = params.duration ?? (params.endTime !== undefined ? Math.max(0.1, params.endTime - startTime) : 10)
    const previewDuration = Math.min(60, Math.max(0.1, duration))

    const slicedClips = sliceClipsForPreview(params.clips || [], startTime, previewDuration)
    if (slicedClips.length === 0) {
      return {
        success: false,
        error: `No clips found in preview range [${startTime}s, ${(startTime + previewDuration).toFixed(2)}s]`,
      }
    }

    const resMap: Record<string, { width: number; height: number }> = {
      '360p': { width: 640, height: 360 },
      '480p': { width: 854, height: 480 },
      '720p': { width: 1280, height: 720 },
    }
    const res = resMap[params.resolution || '480p'] || resMap['480p']

    const previewDir = path.join(os.tmpdir(), 'komfyedit-previews')
    try {
      fs.mkdirSync(previewDir, { recursive: true })
    } catch {}

    const finalOutputPath = params.outputPath || path.join(
      previewDir,
      `preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`,
    )

    const jobResult = this.startJob({
      clips: slicedClips,
      outputPath: finalOutputPath,
      codec: 'libx264',
      width: res.width,
      height: res.height,
      fps: params.fps || 30,
      quality: 24,
      background: params.background,
      letterbox: params.letterbox,
      subtitles: params.subtitles,
      transitions: params.transitions,
    })

    if (!jobResult.success) {
      return jobResult
    }

    return {
      success: true,
      jobId: jobResult.jobId,
      outputPath: finalOutputPath,
      duration: previewDuration,
    }
  }

  public startJob(params: RenderStartParams): { success: true; jobId: string } | { success: false; error: string } {
    const ffmpegPath = findFfmpegPath()
    if (!ffmpegPath) return { success: false, error: 'FFmpeg not found' }

    const { clips, outputPath, codec, width, height, fps, quality, letterbox, subtitles, transitions } = params

    try {
      validatePath(outputPath, getAllowedRoots())
      for (const clip of clips) {
        const fp = clip.path
        if (fp) validatePath(fp, getAllowedRoots())
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }

    const isAudioOnly = codec === 'wav' || codec === 'mp3' || codec === 'aac'
    const visualClips = clips.filter(clip => clip.type === 'video' || clip.type === 'image')
    const textClips = clips.filter(clip => clip.type === 'text')
    const audioClips = clips.filter(clip => clip.type === 'audio' || (clip.type === 'video' && !clip.muted))

    if (!isAudioOnly && visualClips.length === 0 && textClips.length === 0) {
      return { success: false, error: 'No clips to export' }
    }
    if (isAudioOnly && audioClips.length === 0) {
      return { success: false, error: 'No audio clips to export' }
    }

    for (const clip of clips) {
      if (clip.path && clip.type !== 'text' && !fs.existsSync(clip.path)) {
        return { success: false, error: `Source file not found: ${path.basename(clip.path)}` }
      }
    }

    const timelineDuration = getTimelineDuration(clips)
    if (timelineDuration <= 0) return { success: false, error: 'Timeline is empty' }

    const tmpDir = os.tmpdir()
    const requiredBytes = estimateExportIntermediateSize({
      width,
      height,
      fps,
      durationSec: timelineDuration,
    })

    const diskCheck = checkDiskSpaceForExport(tmpDir, requiredBytes)
    if (!diskCheck.sufficient) {
      return {
        success: false,
        error: `Insufficient disk space in temp directory. Required: ${formatBytes(diskCheck.requiredBytes)} (~${Math.ceil(diskCheck.requiredBytes / (1024 * 1024))} MB), Available: ${formatBytes(diskCheck.availableBytes)} (~${Math.floor(diskCheck.availableBytes / (1024 * 1024))} MB)`,
      }
    }

    const jobId = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const job: RenderJob = {
      id: jobId,
      status: 'queued',
      percent: 0,
      createdAt: Date.now(),
    }
    this.jobs.set(jobId, job)

    // Execute job asynchronously without blocking return
    this.executeJob(job, params, ffmpegPath, timelineDuration, tmpDir)

    return { success: true, jobId }
  }

  private async executeJob(
    job: RenderJob,
    params: RenderStartParams,
    ffmpegPath: string,
    timelineDuration: number,
    tmpDir: string,
  ): Promise<void> {
    const {
      clips,
      outputPath,
      codec,
      width,
      height,
      fps,
      quality,
      background,
      letterbox,
      subtitles,
      transitions,
      markers,
      videoBitrate,
      audioBitrate,
    } = params

    const ts = Date.now()
    const tmpVideo = path.join(tmpDir, `komfy-export-video-${ts}.mkv`)
    const tmpAudio = path.join(tmpDir, `komfy-export-audio-${ts}.wav`)
    const tmpChapters = path.join(tmpDir, `komfy-chapters-${ts}.txt`)
    let filterFile: string | null = null
    let tmpRawPcm: string | null = null
    let hasChapters = false

    const cleanup = () => {
      try { if (fs.existsSync(tmpVideo)) fs.unlinkSync(tmpVideo) } catch {}
      try { if (fs.existsSync(tmpAudio)) fs.unlinkSync(tmpAudio) } catch {}
      try { if (filterFile && fs.existsSync(filterFile)) fs.unlinkSync(filterFile) } catch {}
      try { if (tmpRawPcm && fs.existsSync(tmpRawPcm)) fs.unlinkSync(tmpRawPcm) } catch {}
      if (hasChapters) {
        try { if (fs.existsSync(tmpChapters)) fs.unlinkSync(tmpChapters) } catch {}
      }
    }
    job.cleanup = cleanup
    job.status = 'running'

    try {
      const isAudioOnly = codec === 'wav' || codec === 'mp3' || codec === 'aac'
      const isGif = codec === 'gif'

      // ── Step 1: Video filter graph (0% -> 85%, or 0% -> 70% for GIF) ───
      if (!isAudioOnly) {
        const videoEndPercent = isGif ? 70 : 85
        logger.info(`[RenderQueue:${job.id}] Step 1: Video filter graph (${timelineDuration.toFixed(2)}s)`)
        const { inputs, filterScript } = buildVideoFilterGraph(clips, {
          width, height, fps, totalDuration: timelineDuration, background, letterbox, subtitles,
          transitions,
        })

        filterFile = path.join(tmpDir, `komfy-filter-v-${ts}.txt`)
        fs.writeFileSync(filterFile, filterScript, 'utf8')

        // Determine encoder for Step 1
        const hwCaps = detectHardwareEncoders(ffmpegPath)
        const useHw = params.hardwareAcceleration !== false && hwCaps.hardwareAccelerationSupported && hwCaps.preferredEncoder !== null
        let activeEncoder = useHw ? hwCaps.preferredEncoder! : 'libx264'
        let activeEncoderArgs = getEncoderArgs(activeEncoder, 16, 'fast')

        logger.info(
          `[RenderQueue:${job.id}] Step 1: Encoding with ${activeEncoder} (${getEncoderDisplayName(activeEncoder)})${useHw ? ' [Hardware Accelerated]' : ' [Software/CPU]'}`
        )

        const runStep1Ffmpeg = (encoderArgs: string[]) => {
          const handle = runFfmpegWithProgress(
            ffmpegPath,
            [
              '-y', ...inputs, '-filter_complex_script', filterFile!,
              '-map', '[outv]', '-an', ...encoderArgs, tmpVideo,
            ],
            progress => {
              if (job.status !== 'running') return
              const outTimeSec = progress.outTimeUs && Number.isFinite(progress.outTimeUs)
                ? progress.outTimeUs / 1_000_000
                : 0
              const rawPercent = (outTimeSec / (timelineDuration || 1)) * videoEndPercent
              const stepPercent = Number.isFinite(rawPercent) ? Math.min(videoEndPercent, Math.max(0, rawPercent)) : 0
              job.percent = Number(stepPercent.toFixed(1))
              emitToRenderer('render:progress', {
                jobId: job.id,
                percent: job.percent,
                fps: Number.isFinite(progress.fps) ? progress.fps : undefined,
                timeSeconds: outTimeSec,
                speed: Number.isFinite(progress.speed) ? progress.speed : undefined,
              })
            },
          )
          job.activeHandle = handle
          return handle
        }

        let step1Handle = runStep1Ffmpeg(activeEncoderArgs)
        let step1Result = await step1Handle.promise

        // Graceful fallback: if hardware encoder failed, retry with CPU libx264
        if (!step1Result.success && useHw && !isCancelled(job)) {
          logger.warn(
            `[RenderQueue:${job.id}] Hardware encoder ${activeEncoder} failed: ${step1Result.error ?? 'unknown error'}. Falling back to CPU libx264.`
          )
          try { if (fs.existsSync(tmpVideo)) fs.unlinkSync(tmpVideo) } catch {}
          activeEncoder = 'libx264'
          activeEncoderArgs = getEncoderArgs('libx264', 16, 'fast')
          step1Handle = runStep1Ffmpeg(activeEncoderArgs)
          step1Result = await step1Handle.promise
        }

        if (isCancelled(job)) {
          cleanup()
          return
        }

        if (!step1Result.success) {
          job.status = 'failed'
          job.error = step1Result.error ?? 'FFmpeg video filter step failed'
          job.stderr = step1Result.stderr
          cleanup()
          this.notifyFinish(job)
          emitToRenderer('render:error', {
            jobId: job.id,
            error: job.error,
            stderr: job.stderr,
          })
          return
        }
      }

      // ── Step 2: Audio mixdown (85% -> 92%, or 0% -> 80% for audio-only) ─
      if (!isGif) {
        const audioStartPercent = isAudioOnly ? 0 : 86
        const audioEndPercent = isAudioOnly ? 80 : 92
        logger.info(`[RenderQueue:${job.id}] Step 2: Audio mixdown`)
        job.percent = audioStartPercent
        emitToRenderer('render:progress', {
          jobId: job.id,
          percent: audioStartPercent,
          timeSeconds: timelineDuration * (audioStartPercent / 100),
        })

        const { pcmBuffer, sampleRate, channels: audioChannels } = await mixAudioToPcm(clips, timelineDuration, ffmpegPath)

        if (isCancelled(job)) {
          cleanup()
          return
        }

        tmpRawPcm = path.join(tmpDir, `komfy-pcm-${ts}.raw`)
        fs.writeFileSync(tmpRawPcm, pcmBuffer)

        const step2Handle = runFfmpegWithProgress(
          ffmpegPath,
          [
            '-y', '-f', 's16le', '-ar', String(sampleRate), '-ac', String(audioChannels),
            '-i', tmpRawPcm, '-c:a', 'pcm_s16le', tmpAudio,
          ],
          progress => {
            if (job.status !== 'running') return
            const outTimeSec = progress.outTimeUs && Number.isFinite(progress.outTimeUs)
              ? progress.outTimeUs / 1_000_000
              : 0
            const raw = audioStartPercent + (outTimeSec / (timelineDuration || 1)) * (audioEndPercent - audioStartPercent)
            const stepPercent = Number.isFinite(raw) ? Math.min(audioEndPercent, Math.max(audioStartPercent, raw)) : audioStartPercent
            job.percent = Number(stepPercent.toFixed(1))
            emitToRenderer('render:progress', {
              jobId: job.id,
              percent: job.percent,
              fps: Number.isFinite(progress.fps) ? progress.fps : undefined,
              timeSeconds: outTimeSec,
            })
          },
        )

        job.activeHandle = step2Handle
        const step2Result = await step2Handle.promise

        if (isCancelled(job)) {
          cleanup()
          return
        }

        if (!step2Result.success) {
          job.status = 'failed'
          job.error = step2Result.error ?? 'FFmpeg audio mix step failed'
          job.stderr = step2Result.stderr
          cleanup()
          this.notifyFinish(job)
          emitToRenderer('render:error', {
            jobId: job.id,
            error: job.error,
            stderr: job.stderr,
          })
          return
        }
      }

      // ── Step 3: Final output encoding & muxing ──────────────────────────
      const muxStartPercent = isAudioOnly ? 80 : isGif ? 70 : 93
      logger.info(`[RenderQueue:${job.id}] Step 3: Generating final output for codec: ${codec}`)
      job.percent = muxStartPercent
      emitToRenderer('render:progress', {
        jobId: job.id,
        percent: muxStartPercent,
        timeSeconds: timelineDuration * (muxStartPercent / 100),
      })

      // 3A: GIF generation with high-quality palettegen/paletteuse
      if (isGif) {
        const gifFps = Math.min(30, Math.max(5, fps || 15))
        const paletteFilter = `fps=${gifFps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`

        const gifHandle = runFfmpegWithProgress(
          ffmpegPath,
          [
            '-y', '-i', tmpVideo,
            '-vf', paletteFilter,
            outputPath,
          ],
          progress => {
            if (job.status !== 'running') return
            const outTimeSec = progress.outTimeUs && Number.isFinite(progress.outTimeUs)
              ? progress.outTimeUs / 1_000_000
              : 0
            const raw = 70 + (outTimeSec / (timelineDuration || 1)) * 29
            const stepPercent = Number.isFinite(raw) ? Math.min(99, Math.max(70, raw)) : 70
            job.percent = Number(stepPercent.toFixed(1))
            emitToRenderer('render:progress', {
              jobId: job.id,
              percent: job.percent,
              fps: Number.isFinite(progress.fps) ? progress.fps : undefined,
              timeSeconds: outTimeSec,
            })
          },
        )

        job.activeHandle = gifHandle
        const gifResult = await gifHandle.promise

        cleanup()
        if (isCancelled(job)) return

        if (!gifResult.success) {
          job.status = 'failed'
          job.error = gifResult.error ?? 'FFmpeg GIF palette generation failed'
          job.stderr = gifResult.stderr
          this.notifyFinish(job)
          emitToRenderer('render:error', { jobId: job.id, error: job.error, stderr: job.stderr })
          return
        }

        job.status = 'completed'
        job.percent = 100
        logger.info(`[RenderQueue:${job.id}] Export GIF complete: ${outputPath}`)
        this.notifyFinish(job)
        emitToRenderer('render:progress', { jobId: job.id, percent: 100, timeSeconds: timelineDuration })
        emitToRenderer('render:complete', { jobId: job.id, outputPath })
        return
      }

      // 3B: Audio-only export (WAV / MP3 / AAC)
      if (isAudioOnly) {
        let audioArgs: string[]
        if (codec === 'wav') {
          audioArgs = ['-c:a', 'pcm_s16le']
        } else if (codec === 'mp3') {
          const aBitrate = audioBitrate ? `${Math.round(audioBitrate)}k` : '320k'
          audioArgs = ['-c:a', 'libmp3lame', '-b:a', aBitrate]
        } else {
          // aac
          const aBitrate = audioBitrate ? `${Math.round(audioBitrate)}k` : '256k'
          audioArgs = ['-c:a', 'aac', '-b:a', aBitrate]
        }

        const audioHandle = runFfmpegWithProgress(
          ffmpegPath,
          [
            '-y', '-i', tmpAudio,
            ...audioArgs,
            outputPath,
          ],
          progress => {
            if (job.status !== 'running') return
            const outTimeSec = progress.outTimeUs && Number.isFinite(progress.outTimeUs)
              ? progress.outTimeUs / 1_000_000
              : 0
            const raw = 80 + (outTimeSec / (timelineDuration || 1)) * 19
            const stepPercent = Number.isFinite(raw) ? Math.min(99, Math.max(80, raw)) : 80
            job.percent = Number(stepPercent.toFixed(1))
            emitToRenderer('render:progress', {
              jobId: job.id,
              percent: job.percent,
              fps: Number.isFinite(progress.fps) ? progress.fps : undefined,
              timeSeconds: outTimeSec,
            })
          },
        )

        job.activeHandle = audioHandle
        const audioResult = await audioHandle.promise

        cleanup()
        if (isCancelled(job)) return

        if (!audioResult.success) {
          job.status = 'failed'
          job.error = audioResult.error ?? 'FFmpeg audio export failed'
          job.stderr = audioResult.stderr
          this.notifyFinish(job)
          emitToRenderer('render:error', { jobId: job.id, error: job.error, stderr: job.stderr })
          return
        }

        job.status = 'completed'
        job.percent = 100
        logger.info(`[RenderQueue:${job.id}] Audio export complete: ${outputPath}`)
        this.notifyFinish(job)
        emitToRenderer('render:progress', { jobId: job.id, percent: 100, timeSeconds: timelineDuration })
        emitToRenderer('render:complete', { jobId: job.id, outputPath })
        return
      }

      // 3C: Standard video export (H.264 / ProRes / VP9)
      let videoCodecArgs: string[]
      let audioCodecArgs: string[]
      let step3HwEncoder: string | null = null

      if (codec === 'h264' || codec === 'libx264') {
        const hwCaps = detectHardwareEncoders(ffmpegPath)
        const useHw = params.hardwareAcceleration !== false && hwCaps.hardwareAccelerationSupported && hwCaps.preferredEncoder !== null
        step3HwEncoder = useHw ? hwCaps.preferredEncoder : null
        const encoder = step3HwEncoder || 'libx264'

        if (videoBitrate && videoBitrate > 0) {
          const vbK = Math.round(videoBitrate)
          const maxrateK = Math.round(videoBitrate * 1.5)
          const bufsizeK = Math.round(videoBitrate * 2)
          videoCodecArgs = [
            '-c:v', encoder,
            '-b:v', `${vbK}k`,
            '-maxrate', `${maxrateK}k`,
            '-bufsize', `${bufsizeK}k`,
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
          ]
        } else {
          videoCodecArgs = [...getEncoderArgs(encoder, quality || 18, 'medium'), '-movflags', '+faststart']
        }

        const aBitrate = audioBitrate ? `${Math.round(audioBitrate)}k` : '192k'
        audioCodecArgs = ['-c:a', 'aac', '-b:a', aBitrate]
      } else if (codec === 'prores') {
        videoCodecArgs = ['-c:v', 'prores_ks', '-profile:v', String(quality || 3), '-pix_fmt', 'yuva444p10le']
        audioCodecArgs = ['-c:a', 'pcm_s16le']
      } else if (codec === 'vp9') {
        const vBitrate = videoBitrate ? `${Math.round(videoBitrate)}k` : `${quality || 8}M`
        videoCodecArgs = ['-c:v', 'libvpx-vp9', '-b:v', vBitrate, '-pix_fmt', 'yuv420p']
        const aBitrate = audioBitrate ? `${Math.round(audioBitrate)}k` : '128k'
        audioCodecArgs = ['-c:a', 'libopus', '-b:a', aBitrate]
      } else {
        cleanup()
        job.status = 'failed'
        job.error = `Unknown codec: ${codec}`
        this.notifyFinish(job)
        emitToRenderer('render:error', { jobId: job.id, error: job.error })
        return
      }

      // If videoBitrate was explicitly requested, re-encode video instead of copying raw step1
      const canCopyVideo = (codec === 'h264' || codec === 'libx264') && (!videoBitrate || videoBitrate <= 0)
      const chapterInputs: string[] = []
      const chapterMaps: string[] = []

      if (markers && markers.length > 0 && formatSupportsChapters(outputPath)) {
        const metadataContent = generateFfmetadataChapters(markers, timelineDuration)
        if (metadataContent) {
          fs.writeFileSync(tmpChapters, metadataContent, 'utf8')
          hasChapters = true
          chapterInputs.push('-i', tmpChapters)
          chapterMaps.push('-map_metadata', '2')
        }
      }

      const runStep3Ffmpeg = (vArgs: string[]) => {
        const handle = runFfmpegWithProgress(
          ffmpegPath,
          [
            '-y', '-i', tmpVideo, '-i', tmpAudio,
            ...chapterInputs,
            '-map', '0:v', '-map', '1:a',
            ...chapterMaps,
            ...vArgs,
            ...audioCodecArgs, '-shortest', outputPath,
          ],
          progress => {
            if (job.status !== 'running') return
            const outTimeSec = progress.outTimeUs && Number.isFinite(progress.outTimeUs)
              ? progress.outTimeUs / 1_000_000
              : 0
            const raw = 93 + (outTimeSec / (timelineDuration || 1)) * 6
            const stepPercent = Number.isFinite(raw) ? Math.min(99, Math.max(93, raw)) : 93
            job.percent = Number(stepPercent.toFixed(1))
            emitToRenderer('render:progress', {
              jobId: job.id,
              percent: job.percent,
              fps: Number.isFinite(progress.fps) ? progress.fps : undefined,
              timeSeconds: outTimeSec,
            })
          },
        )
        job.activeHandle = handle
        return handle
      }

      let step3Handle = runStep3Ffmpeg(canCopyVideo ? ['-c:v', 'copy'] : videoCodecArgs)
      let step3Result = await step3Handle.promise

      // Fallback if re-encoding step 3 failed on hardware encoder
      if (!step3Result.success && !canCopyVideo && step3HwEncoder && !isCancelled(job)) {
        logger.warn(
          `[RenderQueue:${job.id}] Step 3 hardware encoding with ${step3HwEncoder} failed: ${step3Result.error ?? 'unknown error'}. Retrying with CPU libx264.`
        )
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch {}
        const fallbackArgs = [...getEncoderArgs('libx264', quality || 18, 'medium'), '-movflags', '+faststart']
        step3Handle = runStep3Ffmpeg(fallbackArgs)
        step3Result = await step3Handle.promise
      }

      cleanup()

      if (isCancelled(job)) return

      if (!step3Result.success) {
        job.status = 'failed'
        job.error = step3Result.error ?? 'FFmpeg mux step failed'
        job.stderr = step3Result.stderr
        this.notifyFinish(job)
        emitToRenderer('render:error', {
          jobId: job.id,
          error: job.error,
          stderr: job.stderr,
        })
        return
      }

      // Complete
      job.status = 'completed'
      job.percent = 100
      logger.info(`[RenderQueue:${job.id}] Export complete: ${outputPath}`)
      this.notifyFinish(job)
      emitToRenderer('render:progress', {
        jobId: job.id,
        percent: 100,
        timeSeconds: timelineDuration,
      })
      emitToRenderer('render:complete', {
        jobId: job.id,
        outputPath,
      })
    } catch (err) {
      cleanup()
      if (isCancelled(job)) return
      job.status = 'failed'
      job.error = String(err)
      this.notifyFinish(job)
      emitToRenderer('render:error', {
        jobId: job.id,
        error: job.error,
      })
    }
  }
}

export const renderQueue = new RenderQueueManager()
