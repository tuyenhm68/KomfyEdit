import type { TimelineClip, TimelineTransition } from './project-model'

/**
 * Finding the junctions between clips, with or without a transition on them.
 *
 * This used to be a plain adjacency test: two clips whose edges meet. That
 * stops working the moment a transition exists, because a transition IS an
 * overlap — the clips no longer meet, they cross, and the old test made the
 * junction disappear from the timeline exactly when it had most to show.
 */

/** How far apart two edges may be and still count as the same cut, in seconds. */
export const CUT_TOLERANCE = 0.05

export interface TimelineCut {
  leftClip: TimelineClip
  rightClip: TimelineClip
  trackIndex: number
  /** Where to draw the marker: the cut itself, or the middle of the overlap. */
  time: number
  /** Start and end of the overlap; equal when there is no transition. */
  overlapStart: number
  overlapEnd: number
  transition: TimelineTransition | null
}

export function findCutPoints(
  clips: TimelineClip[],
  transitions: TimelineTransition[] = [],
): TimelineCut[] {
  const byPair = new Map<string, TimelineTransition>()
  for (const transition of transitions) {
    byPair.set(`${transition.leftClipId} ${transition.rightClipId}`, transition)
  }

  const byTrack = new Map<number, TimelineClip[]>()
  for (const clip of clips) {
    const list = byTrack.get(clip.trackIndex)
    if (list) list.push(clip)
    else byTrack.set(clip.trackIndex, [clip])
  }

  const cuts: TimelineCut[] = []
  for (const [trackIndex, trackClips] of byTrack) {
    const sorted = [...trackClips].sort((a, b) => a.startTime - b.startTime)
    for (let i = 0; i < sorted.length - 1; i++) {
      const leftClip = sorted[i]
      const rightClip = sorted[i + 1]
      const leftEnd = leftClip.startTime + leftClip.duration
      const transition = byPair.get(`${leftClip.id} ${rightClip.id}`) ?? null

      // A transition whose clips no longer overlap is not in force: something
      // moved them since, and drawing a band across a junction that is now a
      // plain cut would be a lie. It must not take the junction down with it,
      // though — the two clips still meet, and a user dropping an effect there
      // has to be able to. So fall through and report it as an ordinary cut.
      if (transition && leftEnd - rightClip.startTime >= CUT_TOLERANCE) {
        const overlapStart = rightClip.startTime
        const overlapEnd = leftEnd
        cuts.push({
          leftClip,
          rightClip,
          trackIndex,
          time: (overlapStart + overlapEnd) / 2,
          overlapStart,
          overlapEnd,
          transition,
        })
        continue
      }

      if (Math.abs(leftEnd - rightClip.startTime) < CUT_TOLERANCE) {
        cuts.push({
          leftClip,
          rightClip,
          trackIndex,
          time: leftEnd,
          overlapStart: leftEnd,
          overlapEnd: leftEnd,
          transition: null,
        })
      }
    }
  }

  return cuts
}

/**
 * The cut a click in the transition library should land on.
 *
 * Nothing on screen says "this cut is selected", so the playhead is the
 * pointer: whichever junction it sits closest to is the one that gets the
 * effect. `maxDistance` keeps a playhead parked far away from applying
 * anything, which is better than silently editing a cut off-screen.
 */
export function nearestCut(
  cuts: TimelineCut[],
  time: number,
  maxDistance = Infinity,
): TimelineCut | null {
  let best: TimelineCut | null = null
  let bestDistance = Infinity

  for (const cut of cuts) {
    // Inside the overlap counts as distance zero, so a playhead parked in the
    // middle of an existing transition always retargets that one.
    const distance = time < cut.overlapStart
      ? cut.overlapStart - time
      : time > cut.overlapEnd
        ? time - cut.overlapEnd
        : 0

    if (distance < bestDistance) {
      bestDistance = distance
      best = cut
    }
  }

  return bestDistance <= maxDistance ? best : null
}

/**
 * A junction that has no cut yet because its two clips are merely *near* each
 * other. Only the magnetic main track keeps clips edge to edge; on an overlay
 * track a pair dropped by hand sits a fraction of a second apart, so
 * `findCutPoints` reports nothing and a transition dropped there has nowhere to
 * go. This finds the pair the drop was aimed at so the caller can close the gap
 * (see `SetTransitionOptions.closeGapUpTo`) instead of ignoring the gesture.
 */
export interface TimelineJunction {
  leftClip: TimelineClip
  rightClip: TimelineClip
  trackIndex: number
  /** Middle of the gap — where a marker would sit once it is closed. */
  time: number
  gap: number
}

export function findJunctions(
  clips: TimelineClip[],
  maxGap: number,
): TimelineJunction[] {
  const byTrack = new Map<number, TimelineClip[]>()
  for (const clip of clips) {
    const list = byTrack.get(clip.trackIndex)
    if (list) list.push(clip)
    else byTrack.set(clip.trackIndex, [clip])
  }

  const junctions: TimelineJunction[] = []
  for (const [trackIndex, trackClips] of byTrack) {
    const sorted = [...trackClips].sort((a, b) => a.startTime - b.startTime)
    for (let i = 0; i < sorted.length - 1; i++) {
      const leftClip = sorted[i]
      const rightClip = sorted[i + 1]
      const leftEnd = leftClip.startTime + leftClip.duration
      const gap = rightClip.startTime - leftEnd
      // Overlaps are somebody else's business: a negative gap means the clips
      // already cross, which either is a transition or needs one resolved first.
      if (gap < 0 || gap > maxGap) continue
      junctions.push({ leftClip, rightClip, trackIndex, time: leftEnd + gap / 2, gap })
    }
  }

  return junctions
}

export function findJunctionNear(
  clips: TimelineClip[],
  trackIndex: number,
  time: number,
  maxDistance: number,
  maxGap: number,
): TimelineJunction | null {
  let best: TimelineJunction | null = null
  let bestDistance = Infinity

  for (const junction of findJunctions(clips, maxGap)) {
    if (junction.trackIndex !== trackIndex) continue

    const leftEnd = junction.leftClip.startTime + junction.leftClip.duration
    const distance = time < leftEnd
      ? leftEnd - time
      : time > junction.rightClip.startTime
        ? time - junction.rightClip.startTime
        : 0

    if (distance < bestDistance) {
      bestDistance = distance
      best = junction
    }
  }

  return bestDistance <= maxDistance ? best : null
}

/**
 * How much of a clip on screen is only there to pay for a transition.
 *
 * A transition is an overlap bought with trimmed-off media: the left clip
 * plays on past the cut, the right one starts early (see
 * `timeline-transitions.ts`). Honest as that is about the film, drawing it
 * literally means the two rectangles grow and cross every time the band is
 * re-timed — so dragging a transition handle looks like it is stretching the
 * clips, which is the one thing the overlap model was chosen to avoid.
 *
 * So the timeline draws each clip at the bounds it had before the transition
 * bought anything, and lets the band straddle the junction between them. The
 * borrowed seconds are exactly `leftExtend`/`rightExtend`, so subtracting them
 * puts every edge back where the user last put it, and a band that grows or
 * shrinks moves nothing else on the track.
 */
export interface ClipEdgeExtents {
  /** Seconds this clip starts early to buy the transition on its left. */
  head: number
  /** Seconds this clip plays on late to buy the transition on its right. */
  tail: number
}

const NO_EXTENTS: ClipEdgeExtents = { head: 0, tail: 0 }

/**
 * Reads the borrowed edges off the cuts, which is deliberate: a cut carries a
 * transition only while its clips really overlap, so a stale record left
 * pointing at a junction that has since been pulled apart cannot shrink a clip
 * the user can see is whole.
 */
export function clipEdgeExtents(cuts: TimelineCut[]): Map<string, ClipEdgeExtents> {
  const extents = new Map<string, ClipEdgeExtents>()

  const entry = (clipId: string): ClipEdgeExtents => {
    const existing = extents.get(clipId)
    if (existing) return existing
    const fresh: ClipEdgeExtents = { head: 0, tail: 0 }
    extents.set(clipId, fresh)
    return fresh
  }

  for (const cut of cuts) {
    if (!cut.transition) continue
    // Never give back more than the overlap actually on the timeline: a record
    // whose extends drifted past it would otherwise carve into the clip.
    const overlap = Math.max(0, cut.overlapEnd - cut.overlapStart)
    const tail = Math.min(Math.max(0, cut.transition.leftExtend ?? 0), overlap)
    const head = Math.min(Math.max(0, cut.transition.rightExtend ?? 0), overlap)
    if (tail > 0) entry(cut.leftClip.id).tail = Math.max(entry(cut.leftClip.id).tail, tail)
    if (head > 0) entry(cut.rightClip.id).head = Math.max(entry(cut.rightClip.id).head, head)
  }

  return extents
}

/** Where the timeline draws a clip: its own bounds, less what it lent. */
export function visibleClipBounds(
  clip: Pick<TimelineClip, 'startTime' | 'duration'>,
  extents: ClipEdgeExtents = NO_EXTENTS,
): { startTime: number; duration: number } {
  const head = Math.max(0, extents.head)
  const tail = Math.max(0, extents.tail)
  const duration = clip.duration - head - tail
  // A clip that lent everything it had is drawn whole rather than as nothing;
  // the arithmetic that produced it is wrong, and a zero-width box hides it.
  if (duration <= 0) return { startTime: clip.startTime, duration: clip.duration }
  return { startTime: clip.startTime + head, duration }
}
