import type { KeyframePoint, KeyframeTrack, TimelineClip } from './project-model'
import { MAX_CLIP_VOLUME } from './project-model'

export interface SpeechInterval {
  start: number // in seconds
  end: number   // in seconds
}

export interface SilenceDetectionInterval {
  start: number
  end: number
  duration?: number
}

export interface AudioDuckingOptions {
  /** Target ducking reduction in dB. E.g. -12 means 12 dB attenuation. Default: -12 */
  duckingDb?: number
  /** Fade-in time into ducking (seconds). Default: 0.3 */
  attack?: number
  /** Fade-out time back to normal (seconds). Default: 0.5 */
  release?: number
  /** Threshold for bridging small gaps between speech segments (seconds). Default: 0.5 */
  bridgeGapThreshold?: number
  /** Base normal volume of the clip. Defaults to clip.volume or 1.0 */
  normalVolume?: number
}

/**
 * Compute speech intervals from silence detection output.
 * If silences is empty, returns the entire range [0, totalDuration] if totalDuration > 0.
 */
export function computeSpeechIntervalsFromSilence(
  silences: SilenceDetectionInterval[],
  totalDuration: number,
  options?: {
    minSpeechDuration?: number
    bridgeGapThreshold?: number
  },
): SpeechInterval[] {
  const minSpeechDuration = options?.minSpeechDuration ?? 0.2
  const bridgeGapThreshold = options?.bridgeGapThreshold ?? 0.5

  if (totalDuration <= 0) return []

  // If no silence was detected, the entire duration is considered speech
  if (!silences || silences.length === 0) {
    return [{ start: 0, end: totalDuration }]
  }

  // Sort silences by start time
  const sortedSilences = [...silences].sort((a, b) => a.start - b.start)

  const rawSpeech: SpeechInterval[] = []
  let cursor = 0

  for (const s of sortedSilences) {
    const silStart = Math.max(0, Math.min(totalDuration, s.start))
    const silEnd = Math.max(0, Math.min(totalDuration, s.end))

    if (silStart > cursor) {
      rawSpeech.push({ start: cursor, end: silStart })
    }
    cursor = Math.max(cursor, silEnd)
  }

  if (cursor < totalDuration) {
    rawSpeech.push({ start: cursor, end: totalDuration })
  }

  // Filter out tiny speech fragments
  const filtered = rawSpeech.filter(sp => (sp.end - sp.start) >= minSpeechDuration)

  // Merge speech intervals that are separated by small gaps <= bridgeGapThreshold
  const merged: SpeechInterval[] = []
  for (const seg of filtered) {
    const last = merged[merged.length - 1]
    if (last && (seg.start - last.end) <= bridgeGapThreshold) {
      last.end = Math.max(last.end, seg.end)
    } else {
      merged.push({ start: seg.start, end: seg.end })
    }
  }

  return merged
}

/**
 * Convert voice clip local speech intervals to timeline intervals.
 */
export function voiceClipSpeechToTimeline(
  clip: TimelineClip,
  localSpeechIntervals: SpeechInterval[],
): SpeechInterval[] {
  const speed = clip.speed || 1
  const trimStart = clip.trimStart || 0
  const clipDuration = clip.duration
  const clipTimelineStart = clip.startTime

  const timelineIntervals: SpeechInterval[] = []

  for (const seg of localSpeechIntervals) {
    // Map local media time to clip playback time
    const segStartRel = (seg.start - trimStart) / speed
    const segEndRel = (seg.end - trimStart) / speed

    // Clip to [0, clipDuration]
    const clampedStartRel = Math.max(0, Math.min(clipDuration, segStartRel))
    const clampedEndRel = Math.max(0, Math.min(clipDuration, segEndRel))

    if (clampedEndRel > clampedStartRel) {
      timelineIntervals.push({
        start: clipTimelineStart + clampedStartRel,
        end: clipTimelineStart + clampedEndRel,
      })
    }
  }

  return timelineIntervals
}

/**
 * Generate volume keyframes on a music clip so that it ducks during speech segments.
 * Returns a new copy of musicClip with updated keyframes on 'volume'.
 */
export function applyDuckingKeyframes(
  musicClip: TimelineClip,
  speechIntervalsOnTimeline: SpeechInterval[],
  options?: AudioDuckingOptions,
): TimelineClip {
  const duckingDb = options?.duckingDb ?? -12
  const attack = Math.max(0.05, options?.attack ?? 0.3)
  const release = Math.max(0.05, options?.release ?? 0.5)
  const bridgeGap = options?.bridgeGapThreshold ?? 0.5

  const normalVol = Math.max(0, Math.min(MAX_CLIP_VOLUME, options?.normalVolume ?? musicClip.volume ?? 1))
  const multiplier = Math.pow(10, duckingDb / 20)
  const duckedVol = Math.max(0, Math.min(MAX_CLIP_VOLUME, normalVol * multiplier))

  const clipStart = musicClip.startTime
  const clipEnd = musicClip.startTime + musicClip.duration
  const clipDuration = musicClip.duration

  // Filter speech intervals that overlap with music clip plus ramp margins
  const relevantIntervals = speechIntervalsOnTimeline
    .filter(s => s.end > (clipStart - release) && s.start < (clipEnd + attack))
    .sort((a, b) => a.start - b.start)

  if (relevantIntervals.length === 0) {
    return musicClip
  }

  // Merge intervals that are closer than attack + release (or bridgeGap) to avoid pumping
  const mergeGap = Math.max(bridgeGap, attack + release)
  const mergedSpeech: SpeechInterval[] = []
  for (const s of relevantIntervals) {
    const last = mergedSpeech[mergedSpeech.length - 1]
    if (last && (s.start - last.end) <= mergeGap) {
      last.end = Math.max(last.end, s.end)
    } else {
      mergedSpeech.push({ start: s.start, end: s.end })
    }
  }

  // Build raw keyframe points on clip local time [0, clipDuration]
  const rawPoints: KeyframePoint[] = []

  for (const sp of mergedSpeech) {
    // Ramp down starts at sp.start - attack
    const tDownStart = sp.start - attack - clipStart
    // Reaches ducked at sp.start
    const tDuckStart = sp.start - clipStart
    // Stays ducked until sp.end
    const tDuckEnd = sp.end - clipStart
    // Ramps back up to normal at sp.end + release
    const tUpEnd = sp.end + release - clipStart

    // Helper to evaluate value if clamped
    const sampleRamp = (t: number) => {
      if (t <= tDownStart) return normalVol
      if (t < tDuckStart) {
        const p = (t - tDownStart) / (tDuckStart - tDownStart)
        return normalVol + p * (duckedVol - normalVol)
      }
      if (t <= tDuckEnd) return duckedVol
      if (t < tUpEnd) {
        const p = (t - tDuckEnd) / (tUpEnd - tDuckEnd)
        return duckedVol + p * (normalVol - duckedVol)
      }
      return normalVol
    }

    // Add keyframe points within clip boundaries
    if (tDownStart >= 0 && tDownStart <= clipDuration) {
      rawPoints.push({ t: tDownStart, value: normalVol, easing: 'linear' })
    } else if (tDownStart < 0 && tDuckStart > 0) {
      // clip starts in the middle of ramp down
      rawPoints.push({ t: 0, value: sampleRamp(0), easing: 'linear' })
    }

    if (tDuckStart >= 0 && tDuckStart <= clipDuration) {
      rawPoints.push({ t: tDuckStart, value: duckedVol, easing: 'linear' })
    } else if (tDuckStart < 0 && tDuckEnd > 0) {
      // clip starts already ducked
      rawPoints.push({ t: 0, value: duckedVol, easing: 'linear' })
    }

    if (tDuckEnd >= 0 && tDuckEnd <= clipDuration) {
      rawPoints.push({ t: tDuckEnd, value: duckedVol, easing: 'linear' })
    } else if (tDuckEnd > clipDuration && tDuckStart < clipDuration) {
      // clip ends while ducked
      rawPoints.push({ t: clipDuration, value: duckedVol, easing: 'linear' })
    }

    if (tUpEnd >= 0 && tUpEnd <= clipDuration) {
      rawPoints.push({ t: tUpEnd, value: normalVol, easing: 'linear' })
    } else if (tDuckEnd < clipDuration && tUpEnd > clipDuration) {
      // clip ends in the middle of ramp up
      rawPoints.push({ t: clipDuration, value: sampleRamp(clipDuration), easing: 'linear' })
    }
  }

  // Add boundary anchors at t=0 and t=clipDuration if they are outside any ducking
  const minT = rawPoints.length > 0 ? Math.min(...rawPoints.map(p => p.t)) : 0
  const maxT = rawPoints.length > 0 ? Math.max(...rawPoints.map(p => p.t)) : 0

  if (minT > 0.05) {
    rawPoints.push({ t: 0, value: normalVol, easing: 'linear' })
  }
  if (maxT < (clipDuration - 0.05)) {
    rawPoints.push({ t: clipDuration, value: normalVol, easing: 'linear' })
  }

  // Sort and deduplicate/round
  rawPoints.sort((a, b) => a.t - b.t)
  const deduped: KeyframePoint[] = []
  for (const pt of rawPoints) {
    const roundedT = Math.round(Math.max(0, Math.min(clipDuration, pt.t)) * 1000) / 1000
    const roundedVal = Math.round(pt.value * 1000) / 1000
    const last = deduped[deduped.length - 1]
    if (last && Math.abs(last.t - roundedT) <= 0.02) {
      // If timestamps are essentially identical, keep the minimum volume (duck takes priority)
      last.value = Math.min(last.value, roundedVal)
    } else {
      deduped.push({ t: roundedT, value: roundedVal, easing: 'linear' })
    }
  }

  // Update clip keyframes track
  const currentKeyframes = musicClip.keyframes ? [...musicClip.keyframes] : []
  const trackIdx = currentKeyframes.findIndex(k => k.property === 'volume')
  const newTrack: KeyframeTrack = {
    property: 'volume',
    points: deduped,
  }

  if (trackIdx >= 0) {
    currentKeyframes[trackIdx] = newTrack
  } else {
    currentKeyframes.push(newTrack)
  }

  return {
    ...musicClip,
    keyframes: currentKeyframes,
  }
}
