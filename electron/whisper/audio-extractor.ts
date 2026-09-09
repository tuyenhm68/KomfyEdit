import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { findFfmpegPath } from '../export/ffmpeg-utils'
import { logger } from '../logger'

export interface ExtractAudioOptions {
  inputPath: string
  outputPath?: string
  startTime?: number
  duration?: number
  onCancel?: () => void
}

export interface ExtractAudioResult {
  outputPath: string
  cleanup: () => void
}

/**
 * Extracts a mono, 16kHz, 64kbps MP3 from an audio or video file.
 * This format is compact (< 0.5 MB/min, < 25 MB for 45+ minutes) and
 * optimized for OpenAI Whisper API / faster-whisper.
 */
export function extractAudioForWhisper(options: ExtractAudioOptions): {
  promise: Promise<ExtractAudioResult>
  kill: () => void
} {
  const { inputPath, startTime, duration } = options
  const ffmpegPath = findFfmpegPath()
  if (!ffmpegPath) {
    return {
      promise: Promise.reject(new Error('ffmpeg binary not found')),
      kill: () => {},
    }
  }

  if (!fs.existsSync(inputPath)) {
    return {
      promise: Promise.reject(new Error(`Input media file not found: ${inputPath}`)),
      kill: () => {},
    }
  }

  const outputPath =
    options.outputPath ??
    path.join(
      os.tmpdir(),
      `komfy_whisper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`,
    )

  const args: string[] = ['-y']
  if (startTime !== undefined && startTime > 0) {
    args.push('-ss', startTime.toFixed(3))
  }
  args.push('-i', inputPath)
  if (duration !== undefined && duration > 0) {
    args.push('-t', duration.toFixed(3))
  }
  // Audio: no video, 16kHz sample rate, 1 mono channel, 64kbps mp3
  args.push('-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', '-f', 'mp3', outputPath)

  logger.info(`[whisper-audio] Extracting audio with ffmpeg: ${args.join(' ')}`)

  let proc: ChildProcess | null = null
  let killed = false
  let stderrLog = ''

  const kill = () => {
    killed = true
    if (proc) {
      try {
        proc.kill('SIGTERM')
      } catch {}
    }
  }

  const cleanup = () => {
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath)
      }
    } catch {}
  }

  const promise = new Promise<ExtractAudioResult>((resolve, reject) => {
    try {
      proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      cleanup()
      return reject(new Error(`Failed to spawn ffmpeg: ${String(err)}`))
    }

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrLog += chunk.toString()
    })

    proc.on('close', (code) => {
      if (killed) {
        cleanup()
        return reject(new Error('Audio extraction cancelled'))
      }
      if (code === 0 && fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath)
        if (stat.size > 0) {
          logger.info(`[whisper-audio] Extracted audio size: ${(stat.size / 1024).toFixed(1)} KB`)
          return resolve({ outputPath, cleanup })
        }
      }
      cleanup()
      const lastErr = stderrLog.split('\n').filter(Boolean).slice(-4).join('\n')
      reject(new Error(`FFmpeg audio extraction failed (code ${code}): ${lastErr.slice(0, 300)}`))
    })

    proc.on('error', (err) => {
      cleanup()
      reject(new Error(`FFmpeg process error: ${err.message}`))
    })
  })

  return { promise, kill }
}
