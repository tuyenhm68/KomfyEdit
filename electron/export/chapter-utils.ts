import fs from 'fs'
import path from 'path'

export interface ExportMarkerParam {
  id: string
  time: number
  label?: string
  color?: string
}

/** Check if container format allows embedded chapters metadata */
export function formatSupportsChapters(outputPath: string): boolean {
  const ext = path.extname(outputPath).toLowerCase()
  return ['.mp4', '.mkv', '.mov', '.m4v', '.webm'].includes(ext)
}

/**
 * Generates an FFmpeg ffmetadata formatted string with chapter markings.
 * Chapters start from each marker's time up to the next marker's time
 * (or timeline total duration).
 */
export function generateFfmetadataChapters(
  markers: ExportMarkerParam[],
  totalDurationSec: number,
): string {
  if (!markers || markers.length === 0) return ''

  // Sort markers by time ascending
  const sorted = [...markers]
    .map(m => ({ ...m, time: Math.max(0, m.time) }))
    .sort((a, b) => a.time - b.time)

  const lines: string[] = [';FFMETADATA1']
  const chapters: Array<{ startMs: number; endMs: number; title: string }> = []
  const totalMs = Math.max(1000, Math.round(totalDurationSec * 1000))

  for (let i = 0; i < sorted.length; i++) {
    const marker = sorted[i]
    const markerMs = Math.round(marker.time * 1000)

    if (i === 0 && markerMs > 500) {
      // Create Intro chapter before first marker
      chapters.push({
        startMs: 0,
        endMs: markerMs,
        title: 'Intro',
      })
    }

    const nextMarker = sorted[i + 1]
    const nextMs = nextMarker ? Math.round(nextMarker.time * 1000) : totalMs
    // Ensure endMs is strictly greater than startMs
    const endMs = Math.max(markerMs + 100, Math.min(totalMs, nextMs))

    chapters.push({
      startMs: markerMs,
      endMs,
      title: marker.label?.trim() || `Chapter ${chapters.length + 1}`,
    })
  }

  for (const ch of chapters) {
    lines.push('[CHAPTER]')
    lines.push('TIMEBASE=1/1000')
    lines.push(`START=${ch.startMs}`)
    lines.push(`END=${ch.endMs}`)
    // Escape FFmpeg metadata values (=, ;, #, \, and newlines)
    const escapedTitle = ch.title.replace(/[=;#\\]/g, '\\$&')
    lines.push(`title=${escapedTitle}`)
    lines.push('')
  }

  return lines.join('\n')
}
