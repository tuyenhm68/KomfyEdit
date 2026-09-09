import type { Timeline } from './project-model'
import { mainVideoTrackIndex } from './video-editor-utils'

export type ValidationRule =
  | 'CLIP_INVALID_TRACK'
  | 'SUBTITLE_INVALID_TRACK'
  | 'INVALID_TIMING'
  | 'V1_NOT_SEAMLESS'
  | 'LOCKED_TRACK_MODIFIED'

export interface ValidationError {
  rule: ValidationRule
  message: string
  entityType: 'clip' | 'track' | 'subtitle'
  entityId?: string
  trackIndex?: number
  details?: Record<string, unknown>
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

let lastValidationResult: ValidationResult | null = null

export function getLastTimelineValidationError(): ValidationResult | null {
  return lastValidationResult
}

export function setLastTimelineValidationError(result: ValidationResult | null): void {
  lastValidationResult = result
}

export function clearLastTimelineValidationError(): void {
  lastValidationResult = null
}

/**
 * Validates timeline invariants before committing mutations.
 * If previousTimeline is provided, verifies that clips on locked tracks have not been modified.
 */
export function validateTimeline(
  timeline: Timeline,
  previousTimeline?: Timeline,
): ValidationResult {
  const errors: ValidationError[] = []
  const trackCount = timeline.tracks.length

  // Rule 1: No clip references a non-existent track
  // Rule 3: Timing invariants: startTime >= 0, duration > 0, trimStart >= 0
  for (const clip of timeline.clips) {
    if (clip.trackIndex < 0 || clip.trackIndex >= trackCount) {
      errors.push({
        rule: 'CLIP_INVALID_TRACK',
        message: `Clip "${clip.id}" references non-existent track index ${clip.trackIndex} (total tracks: ${trackCount})`,
        entityType: 'clip',
        entityId: clip.id,
        trackIndex: clip.trackIndex,
      })
    }

    if (clip.startTime < 0) {
      errors.push({
        rule: 'INVALID_TIMING',
        message: `Clip "${clip.id}" has negative startTime: ${clip.startTime}`,
        entityType: 'clip',
        entityId: clip.id,
        details: { startTime: clip.startTime },
      })
    }

    if (clip.duration <= 0 || !Number.isFinite(clip.duration)) {
      errors.push({
        rule: 'INVALID_TIMING',
        message: `Clip "${clip.id}" has non-positive duration: ${clip.duration}`,
        entityType: 'clip',
        entityId: clip.id,
        details: { duration: clip.duration },
      })
    }

    if (clip.trimStart < 0) {
      errors.push({
        rule: 'INVALID_TIMING',
        message: `Clip "${clip.id}" has negative trimStart: ${clip.trimStart}`,
        entityType: 'clip',
        entityId: clip.id,
        details: { trimStart: clip.trimStart },
      })
    }
  }

  // Rule 2: No subtitle references a non-existent track
  if (timeline.subtitles && timeline.subtitles.length > 0) {
    for (const sub of timeline.subtitles) {
      if (sub.trackIndex !== undefined && (sub.trackIndex < 0 || sub.trackIndex >= trackCount)) {
        errors.push({
          rule: 'SUBTITLE_INVALID_TRACK',
          message: `Subtitle "${sub.id}" references non-existent track index ${sub.trackIndex} (total tracks: ${trackCount})`,
          entityType: 'subtitle',
          entityId: sub.id,
          trackIndex: sub.trackIndex,
        })
      }
    }
  }

  // Rule 4: V1 (main magnetic video track) must be seamless from 0
  const mainIndex = mainVideoTrackIndex(timeline.tracks)
  if (mainIndex >= 0 && mainIndex < trackCount) {
    const v1Clips = timeline.clips
      .filter(c => c.trackIndex === mainIndex)
      .sort((a, b) => a.startTime - b.startTime)

    if (v1Clips.length > 0) {
      if (Math.abs(v1Clips[0].startTime) > 0.001) {
        errors.push({
          rule: 'V1_NOT_SEAMLESS',
          message: `Main track (V1) must start at 0, but first clip starts at ${v1Clips[0].startTime}`,
          entityType: 'track',
          trackIndex: mainIndex,
          details: { expected: 0, actual: v1Clips[0].startTime, clipId: v1Clips[0].id },
        })
      }

      // A transition is a deliberate overlap of exactly its duration, so the
      // seam it creates is the feature rather than a violation. Anything other
      // than that amount still fails: a transition must not become a licence
      // for arbitrary gaps on the magnetic track.
      const overlapAfter = new Map<string, number>()
      for (const transition of timeline.transitions ?? []) {
        overlapAfter.set(transition.leftClipId, transition.duration)
      }

      for (let i = 1; i < v1Clips.length; i++) {
        const prevClip = v1Clips[i - 1]
        const prevEnd = prevClip.startTime + prevClip.duration
        const expected = prevEnd - (overlapAfter.get(prevClip.id) ?? 0)
        const curStart = v1Clips[i].startTime
        if (Math.abs(curStart - expected) > 0.001) {
          errors.push({
            rule: 'V1_NOT_SEAMLESS',
            message: `Main track (V1) has gap/overlap between clip "${prevClip.id}" and "${v1Clips[i].id}" at time ${curStart} (expected ${expected})`,
            entityType: 'track',
            trackIndex: mainIndex,
            details: {
              expected,
              actual: curStart,
              prevClipId: prevClip.id,
              clipId: v1Clips[i].id,
            },
          })
        }
      }
    }
  }

  // Rule 5: No clip on a locked track may be modified, added, or deleted
  if (previousTimeline) {
    for (let prevTrackIdx = 0; prevTrackIdx < previousTimeline.tracks.length; prevTrackIdx++) {
      const prevTrack = previousTimeline.tracks[prevTrackIdx]
      if (!prevTrack?.locked) continue

      const nextTrackIdx = timeline.tracks.findIndex(t => t.id === prevTrack.id)
      if (nextTrackIdx === -1) {
        errors.push({
          rule: 'LOCKED_TRACK_MODIFIED',
          message: `Track "${prevTrack.name || `Track ${prevTrackIdx + 1}`}" is locked; track cannot be removed`,
          entityType: 'track',
          entityId: prevTrack.id,
          trackIndex: prevTrackIdx,
        })
        continue
      }

      const prevClips = previousTimeline.clips.filter(c => c.trackIndex === prevTrackIdx)
      const nextClips = timeline.clips.filter(c => c.trackIndex === nextTrackIdx)

      let trackModified = false
      if (prevClips.length !== nextClips.length) {
        trackModified = true
      } else {
        const prevMap = new Map(prevClips.map(c => [c.id, c]))
        for (const nextClip of nextClips) {
          const prevClip = prevMap.get(nextClip.id)
          if (!prevClip) {
            trackModified = true
            break
          }
          if (
            prevClip.startTime !== nextClip.startTime ||
            prevClip.duration !== nextClip.duration ||
            prevClip.trimStart !== nextClip.trimStart ||
            prevClip.trimEnd !== nextClip.trimEnd ||
            prevClip.speed !== nextClip.speed ||
            prevClip.volume !== nextClip.volume ||
            prevClip.muted !== nextClip.muted ||
            prevClip.assetId !== nextClip.assetId
          ) {
            trackModified = true
            break
          }
        }
      }

      if (trackModified) {
        errors.push({
          rule: 'LOCKED_TRACK_MODIFIED',
          message: `Track "${prevTrack.name || `Track ${prevTrackIdx + 1}`}" is locked; clips on this track cannot be modified, added, or removed`,
          entityType: 'track',
          entityId: prevTrack.id,
          trackIndex: nextTrackIdx,
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
