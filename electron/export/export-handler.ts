import path from 'path'
import fs from 'fs'
import os from 'os'
import { getAllowedRoots } from '../config'
import { logger } from '../logger'
import { validatePath } from '../path-validation'
import { findFfmpegPath, runFfmpeg, stopExportProcess } from './ffmpeg-utils'
import { getTimelineDuration } from './timeline'
import { buildVideoFilterGraph } from './video-filter'
import { mixAudioToPcm } from './audio-mix'
import { formatSupportsChapters, generateFfmetadataChapters } from './chapter-utils'
import { handle } from '../ipc/typed-handle'

export interface ExportSizeEstimateParams {
  width: number
  height: number
  fps: number
  durationSec: number
}

/**
 * Pure function: Estimate required temporary intermediate space for export (MKV libx264 -crf 16 + audio buffers).
 * Uses a conservative 0.28 bits-per-pixel-per-frame model + PCM audio buffer overhead + 20% safety margin.
 * E.g., 4K 30fps 1hr ~ 39 GB (matches 25-36+ GB requirement).
 */
export function estimateExportIntermediateSize({ width, height, fps, durationSec }: ExportSizeEstimateParams): number {
  if (width <= 0 || height <= 0 || fps <= 0 || durationSec <= 0) return 0

  const totalPixels = width * height * fps * durationSec
  // CRF 16 conservative visual bitrate: ~0.28 bpp
  const estimatedVideoBytes = (totalPixels * 0.28) / 8

  // Raw PCM intermediate + WAV file: 48kHz stereo 16-bit is 192KB/s each (total 384KB/s)
  const audioBytesPerSec = 48000 * 2 * 2 * 2
  const estimatedAudioBytes = audioBytesPerSec * durationSec

  const safetyMultiplier = 1.2
  return Math.ceil((estimatedVideoBytes + estimatedAudioBytes) * safetyMultiplier)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

export interface DiskSpaceCheckResult {
  sufficient: boolean
  requiredBytes: number
  availableBytes: number
}

export function checkDiskSpaceForExport(dirPath: string, requiredBytes: number): DiskSpaceCheckResult {
  try {
    const stat = fs.statfsSync(dirPath)
    const availableBytes = Number(stat.bavail) * Number(stat.bsize)
    return {
      sufficient: availableBytes >= requiredBytes,
      requiredBytes,
      availableBytes,
    }
  } catch (error) {
    logger.warn(`[Export] Failed to query disk space with fs.statfsSync: ${error}`)
    return {
      sufficient: true,
      requiredBytes,
      availableBytes: Number.MAX_SAFE_INTEGER,
    }
  }
}

export function registerExportHandlers(): void {
  handle('exportNative', async ({ clips, outputPath, codec, width, height, fps, quality, background, letterbox, subtitles, transitions, markers }) => {
    const ffmpegPath = findFfmpegPath()
    if (!ffmpegPath) return { success: false, error: 'FFmpeg not found' }

    try {
      validatePath(outputPath, getAllowedRoots())
      for (const clip of clips) {
        const fp = clip.path
        if (fp) validatePath(fp, getAllowedRoots())
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }

    const visualClips = clips.filter(clip => clip.type === 'video' || clip.type === 'image')
    const textClips = clips.filter(clip => clip.type === 'text')
    if (visualClips.length === 0 && textClips.length === 0) {
      return { success: false, error: 'No clips to export' }
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
    const ts = Date.now()
    const tmpVideo = path.join(tmpDir, `komfy-export-video-${ts}.mkv`)
    const tmpAudio = path.join(tmpDir, `komfy-export-audio-${ts}.wav`)
    const tmpChapters = path.join(tmpDir, `komfy-chapters-${ts}.txt`)
    let hasChapters = false

    const cleanup = () => {
      try { fs.unlinkSync(tmpVideo) } catch {}
      try { fs.unlinkSync(tmpAudio) } catch {}
      if (hasChapters) {
        try { fs.unlinkSync(tmpChapters) } catch {}
      }
    }

    try {
      logger.info( `[Export] Step 1: Video-only export (${visualClips.length} visual + ${textClips.length} text clip(s), ${timelineDuration.toFixed(2)}s)`)
      {
        const { inputs, filterScript } = buildVideoFilterGraph(clips, {
          transitions,
          width, height, fps, totalDuration: timelineDuration, background: background as any, letterbox, subtitles,
        })

        const filterFile = path.join(tmpDir, `komfy-filter-v-${ts}.txt`)
        fs.writeFileSync(filterFile, filterScript, 'utf8')

        const r = await runFfmpeg(ffmpegPath, [
          '-y', ...inputs, '-filter_complex_script', filterFile,
          '-map', '[outv]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', tmpVideo
        ])
        try { fs.unlinkSync(filterFile) } catch {}
        if (!r.success) { cleanup(); return { success: false, error: r.error ?? 'ffmpeg failed' } }
      }

      logger.info( '[Export] Step 2: Audio mixdown (PCM buffer approach)')
      const totalDuration = timelineDuration

      const { pcmBuffer, sampleRate, channels: audioChannels } = await mixAudioToPcm(clips, totalDuration, ffmpegPath)

      const tmpRawPcm = path.join(tmpDir, `komfy-pcm-${ts}.raw`)
      fs.writeFileSync(tmpRawPcm, pcmBuffer)
      logger.info( `[Export] Wrote raw PCM: ${pcmBuffer.length} bytes (${totalDuration.toFixed(2)}s)`)

      {
        const r = await runFfmpeg(ffmpegPath, [
          '-y', '-f', 's16le', '-ar', String(sampleRate), '-ac', String(audioChannels),
          '-i', tmpRawPcm, '-c:a', 'pcm_s16le', tmpAudio,
        ])
        try { fs.unlinkSync(tmpRawPcm) } catch {}
        if (!r.success) { cleanup(); return { success: false, error: r.error ?? 'ffmpeg failed' } }
      }

      logger.info( '[Export] Step 3: Combining video + audio')
      let videoCodecArgs: string[]
      let audioCodecArgs: string[]
      if (codec === 'h264') {
        videoCodecArgs = ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(quality || 18), '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
        audioCodecArgs = ['-c:a', 'aac', '-b:a', '192k']
      } else if (codec === 'prores') {
        videoCodecArgs = ['-c:v', 'prores_ks', '-profile:v', String(quality || 3), '-pix_fmt', 'yuva444p10le']
        audioCodecArgs = ['-c:a', 'pcm_s16le']
      } else if (codec === 'vp9') {
        videoCodecArgs = ['-c:v', 'libvpx-vp9', '-b:v', `${quality || 8}M`, '-pix_fmt', 'yuv420p']
        audioCodecArgs = ['-c:a', 'libopus', '-b:a', '128k']
      } else {
        cleanup()
        return { success: false, error: `Unknown codec: ${codec}` }
      }

      const canCopyVideo = codec === 'h264'
      const chapterInputs: string[] = []
      const chapterMaps: string[] = []

      if (markers && markers.length > 0 && formatSupportsChapters(outputPath)) {
        const metadataContent = generateFfmetadataChapters(markers, totalDuration)
        if (metadataContent) {
          fs.writeFileSync(tmpChapters, metadataContent, 'utf8')
          hasChapters = true
          chapterInputs.push('-i', tmpChapters)
          chapterMaps.push('-map_metadata', '2')
        }
      }

      const r = await runFfmpeg(ffmpegPath, [
        '-y', '-i', tmpVideo, '-i', tmpAudio,
        ...chapterInputs,
        '-map', '0:v', '-map', '1:a',
        ...chapterMaps,
        ...(canCopyVideo ? ['-c:v', 'copy'] : videoCodecArgs),
        ...audioCodecArgs, '-shortest', outputPath
      ])

      cleanup()
      if (!r.success) return { success: false, error: r.error ?? 'ffmpeg failed' }
      logger.info( `[Export] Done: ${outputPath}`)
      return { success: true }
    } catch (err) {
      cleanup()
      return { success: false, error: String(err) }
    }
  })

  handle('exportCancel', () => {
    stopExportProcess()
    return { success: true }
  })

  // Asynchronous render queue handlers
  handle('render.start', async params => {
    const { renderQueue } = await import('./render-queue')
    return renderQueue.startJob(params)
  })

  handle('render.status', async ({ jobId }) => {
    const { renderQueue } = await import('./render-queue')
    const job = renderQueue.getJob(jobId)
    if (!job) return { success: false, error: `Job ${jobId} not found` }
    return {
      success: true,
      status: job.status,
      percent: job.percent,
      error: job.error,
    }
  })

  handle('render.cancel', async ({ jobId }) => {
    const { renderQueue } = await import('./render-queue')
    renderQueue.cancelJob(jobId)
    return { success: true }
  })

  handle('render.preview', async params => {
    const { renderQueue } = await import('./render-queue')
    return renderQueue.startPreviewJob(params)
  })

  handle('getHardwareEncoderCapabilities', async ({ forceRecheck }) => {
    const { findFfmpegPath } = await import('./ffmpeg-utils')
    const { detectHardwareEncoders, getEncoderDisplayName } = await import('./hardware-encoder')
    const ffmpegPath = findFfmpegPath()
    if (!ffmpegPath) {
      return {
        availableEncoders: [],
        preferredEncoder: null,
        preferredEncoderDisplayName: getEncoderDisplayName(null),
        hardwareAccelerationSupported: false,
      }
    }
    const caps = detectHardwareEncoders(ffmpegPath, forceRecheck)
    return {
      availableEncoders: caps.availableEncoders,
      preferredEncoder: caps.preferredEncoder,
      preferredEncoderDisplayName: getEncoderDisplayName(caps.preferredEncoder),
      hardwareAccelerationSupported: caps.hardwareAccelerationSupported,
    }
  })
}

