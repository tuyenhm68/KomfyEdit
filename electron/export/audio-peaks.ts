import { spawn } from 'child_process'
import { findFfmpegPath } from './ffmpeg-utils'

/**
 * Sample rate the waveform is decoded at. Only the amplitude envelope matters,
 * so this is deliberately far below anything audible — it keeps the pipe small
 * enough that even a multi-hour file streams through in a few MB.
 */
const PEAK_SAMPLE_RATE = 8000

/** Envelope resolution before it is resampled to the caller's bucket count. */
const WINDOWS_PER_SECOND = 100

const MAX_BUCKETS = 4000

/**
 * Extract an amplitude envelope for a media file.
 *
 * The renderer used to read the whole file and decode it in the browser, which
 * fails outright past 2 GB and is ruinous long before that. Here ffmpeg decodes
 * to low-rate mono PCM which is reduced to peaks as it streams, so peak memory
 * stays proportional to the file's *duration*, not its size.
 */
export function extractAudioPeaks(filePath: string, buckets: number): Promise<number[]> {
  const targetBuckets = Math.max(1, Math.min(MAX_BUCKETS, Math.floor(buckets) || 1))

  return new Promise((resolve, reject) => {
    const ffmpegPath = findFfmpegPath()
    if (!ffmpegPath) {
      reject(new Error('ffmpeg not found'))
      return
    }

    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-i', filePath,
      '-vn',
      '-ac', '1', '-ar', String(PEAK_SAMPLE_RATE),
      '-f', 's16le', 'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    const samplesPerWindow = Math.max(1, Math.round(PEAK_SAMPLE_RATE / WINDOWS_PER_SECOND))
    const envelope: number[] = []
    let windowMax = 0
    let samplesInWindow = 0
    // s16le samples are 2 bytes, and a chunk boundary can land mid-sample.
    let leftoverByte: number | null = null

    proc.stdout.on('data', (chunk: Buffer) => {
      let offset = 0
      if (leftoverByte !== null && chunk.length > 0) {
        const sample = (chunk[0] << 8 | leftoverByte) << 16 >> 16
        const magnitude = Math.abs(sample) / 32768
        if (magnitude > windowMax) windowMax = magnitude
        if (++samplesInWindow >= samplesPerWindow) {
          envelope.push(windowMax)
          windowMax = 0
          samplesInWindow = 0
        }
        leftoverByte = null
        offset = 1
      }

      const usableEnd = chunk.length - ((chunk.length - offset) % 2)
      for (let i = offset; i < usableEnd; i += 2) {
        const magnitude = Math.abs(chunk.readInt16LE(i)) / 32768
        if (magnitude > windowMax) windowMax = magnitude
        if (++samplesInWindow >= samplesPerWindow) {
          envelope.push(windowMax)
          windowMax = 0
          samplesInWindow = 0
        }
      }

      if (usableEnd < chunk.length) leftoverByte = chunk[usableEnd]
    })

    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => {
      // Keep only the tail; a broken file can be very chatty.
      stderr = (stderr + chunk.toString()).slice(-2000)
    })

    proc.on('error', reject)

    proc.on('close', (code) => {
      if (code !== 0 && envelope.length === 0) {
        reject(new Error(`Waveform extraction failed (code ${code}): ${stderr.trim()}`))
        return
      }
      if (samplesInWindow > 0) envelope.push(windowMax)
      if (envelope.length === 0) {
        // No audio stream: a flat line is the honest answer.
        resolve(new Array(targetBuckets).fill(0))
        return
      }

      // Reduce the envelope to the requested bucket count, keeping the peak of
      // each span so transients survive the downsample.
      const peaks = new Array<number>(targetBuckets)
      const perBucket = envelope.length / targetBuckets
      for (let i = 0; i < targetBuckets; i++) {
        const start = Math.floor(i * perBucket)
        const end = Math.max(start + 1, Math.floor((i + 1) * perBucket))
        let max = 0
        for (let j = start; j < end && j < envelope.length; j++) {
          if (envelope[j] > max) max = envelope[j]
        }
        peaks[i] = max
      }
      resolve(peaks)
    })
  })
}
