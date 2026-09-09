import type { EditorModel, EditorState } from './editor-state'
import type { Timeline, TimelineClip } from './project-model'

export interface ClipSummary {
  id: string
  name: string
  type?: string
  text?: string
  start: number
  end: number
  duration: number
  trackIndex: number
  assetId?: string | null
  mediaPath?: string
  proxyPath?: string
  filter?: { id: string; intensity: number }
}

export interface GapSummary {
  start: number
  end: number
  duration: number
}

export interface TrackSummary {
  id: string
  name: string
  type: string
  index: number
  clipCount: number
  clips: ClipSummary[]
  gaps: GapSummary[]
}

export interface TimelineSummaryResult {
  timelineId: string
  duration: number
  trackCount: number
  clipCount: number
  tracks: TrackSummary[]
  text: string
  byteSize: number
  isCompacted: boolean
}

export interface TimelineSummaryOptions {
  maxBytes?: number // default 16 * 1024 (16KB)
}

function resolveTimelineAndModel(input: EditorState | EditorModel | Timeline): {
  timeline: Timeline | null
  model?: EditorModel
} {
  if ('tracks' in input && Array.isArray(input.tracks) && 'clips' in input) {
    return { timeline: input as Timeline }
  }
  const anyInput = input as any
  const model: EditorModel | undefined = anyInput.model ? anyInput.model : (anyInput.timelines ? anyInput : undefined)
  if (model && Array.isArray(model.timelines)) {
    const activeId = model.activeTimelineId
    const timeline = model.timelines.find(t => t.id === activeId) || model.timelines[0] || null
    return { timeline, model }
  }
  return { timeline: null }
}

function getClipStart(c: TimelineClip): number {
  return (c as any).timelineStart ?? c.startTime ?? 0
}

function getClipDuration(c: TimelineClip): number {
  if ((c as any).timelineEnd !== undefined) {
    return (c as any).timelineEnd - getClipStart(c)
  }
  return c.duration ?? 0
}

function getClipEnd(c: TimelineClip): number {
  return (c as any).timelineEnd ?? (getClipStart(c) + getClipDuration(c))
}

function formatSec(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/**
 * Generate a compact summary of the timeline structure, tracks, clips, and gaps.
 * Automatically enforces a size ceiling (default <= 16KB) and compacts when necessary.
 */
export function timelineSummary(
  input: EditorState | EditorModel | Timeline,
  options?: TimelineSummaryOptions,
): TimelineSummaryResult {
  const maxBytes = options?.maxBytes ?? 16 * 1024
  const { timeline, model } = resolveTimelineAndModel(input)

  if (!timeline) {
    const text = 'Timeline: (empty)'
    return {
      timelineId: '',
      duration: 0,
      trackCount: 0,
      clipCount: 0,
      tracks: [],
      text,
      byteSize: Buffer.byteLength(text, 'utf8'),
      isCompacted: false,
    }
  }

  const tracks: TrackSummary[] = []
  const allClips = [...(timeline.clips || [])]

  let totalDuration = 0
  for (const c of allClips) {
    const end = getClipEnd(c)
    if (end > totalDuration) totalDuration = end
  }

  const assetMap = new Map((model?.assets || []).map(a => [a.id, a]))

  const trackList = timeline.tracks || []
  for (let tIdx = 0; tIdx < trackList.length; tIdx++) {
    const track = trackList[tIdx]
    const trackClips = allClips
      .filter(c => c.trackIndex === tIdx)
      .sort((a, b) => getClipStart(a) - getClipStart(b))

    const clipSummaries: ClipSummary[] = trackClips.map(c => {
      const start = getClipStart(c)
      const duration = getClipDuration(c)
      const end = start + duration
      const asset = c.assetId ? assetMap.get(c.assetId) : undefined
      const mediaPath = (c as any).mediaPath || asset?.path
      const isText = c.type === 'text'
      const textContent = isText ? c.textStyle?.text : undefined
      const defaultName = isText
        ? (textContent ? `Text: "${textContent}"` : 'Text Clip')
        : (mediaPath ? mediaPath.split(/[/\\]/).pop() || '' : `clip_${c.id}`)
      const name = (c as any).name || defaultName

      return {
        id: c.id,
        name,
        type: c.type,
        text: textContent,
        start,
        end,
        duration,
        trackIndex: tIdx,
        assetId: c.assetId,
        mediaPath,
        ...(asset?.proxyPath ? { proxyPath: asset.proxyPath } : {}),
        ...(c.filter ? { filter: c.filter } : {}),
      }
    })

    // Calculate gaps
    const gaps: GapSummary[] = []
    let cursor = 0
    for (const c of clipSummaries) {
      if (c.start > cursor + 0.001) {
        gaps.push({
          start: cursor,
          end: c.start,
          duration: c.start - cursor,
        })
      }
      if (c.end > cursor) {
        cursor = c.end
      }
    }

    tracks.push({
      id: track.id,
      name: track.name,
      type: track.kind || track.type || (track.name.startsWith('A') ? 'audio' : 'video'),
      index: tIdx,
      clipCount: clipSummaries.length,
      clips: clipSummaries,
      gaps,
    })
  }

  // Generate readable representation
  function buildText(compactLevel: number): string {
    const lines: string[] = []
    const tlName = timeline ? (timeline.name || timeline.id) : ''
    const canvasStr = timeline?.width && timeline?.height
      ? ` | Canvas: ${timeline.width}x${timeline.height}${timeline.fps ? ` @ ${timeline.fps}fps` : ''}`
      : ''
    lines.push(`Timeline "${tlName}" | ${totalDuration.toFixed(1)}s | ${tracks.length} tracks | ${allClips.length} clips${canvasStr}`)

    for (const tr of tracks) {
      if (compactLevel === 0) {
        lines.push(`[${tr.name}] ${tr.type} (${tr.clipCount} clips):`)
        let cursor = 0
        for (const c of tr.clips) {
          if (c.start > cursor + 0.001) {
            lines.push(`  * GAP ${formatSec(cursor)}-${formatSec(c.start)} (${(c.start - cursor).toFixed(1)}s)`)
          }
          const filterInfo = c.filter ? ` {filter: ${c.filter.id}@${c.filter.intensity}%}` : ''
          lines.push(`  * ${formatSec(c.start)}-${formatSec(c.end)} (${c.duration.toFixed(1)}s) "${c.name}" [${c.id}]${filterInfo}`)
          cursor = c.end
        }
      } else if (compactLevel === 1) {
        // Semi-compact: one line per clip, no whitespace indent, short time
        lines.push(`[${tr.name}]`)
        for (const c of tr.clips) {
          lines.push(`${c.id}:${c.start.toFixed(2)}-${c.end.toFixed(2)}:${c.name.slice(0, 15)}`)
        }
      } else {
        // Ultra-compact: CSV format `id:start-end`
        lines.push(`[${tr.name}] ` + tr.clips.map(c => `${c.id}:${c.start.toFixed(1)}-${c.end.toFixed(1)}`).join(','))
      }
    }

    return lines.join('\n')
  }

  let level = 0
  let text = buildText(level)
  let byteSize = Buffer.byteLength(text, 'utf8')

  // Auto-compact if exceeding maxBytes
  while (byteSize > maxBytes && level < 2) {
    level++
    text = buildText(level)
    byteSize = Buffer.byteLength(text, 'utf8')
  }

  // If still exceeding maxBytes, truncate safely with a compaction marker
  let isCompacted = level > 0
  if (byteSize > maxBytes) {
    const truncated = text.slice(0, maxBytes - 60)
    text = `${truncated}\n... [TRUNCATED: timeline exceeds ${maxBytes} bytes]`
    byteSize = Buffer.byteLength(text, 'utf8')
    isCompacted = true
  }

  return {
    timelineId: timeline.id,
    duration: totalDuration,
    trackCount: tracks.length,
    clipCount: allClips.length,
    tracks,
    text,
    byteSize,
    isCompacted,
  }
}
