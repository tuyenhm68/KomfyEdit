import { describe, it, expect } from 'vitest'
import type { Timeline, TimelineClip } from '../src/project-model'
import { clipEdgeExtents, findCutPoints, visibleClipBounds } from '../src/timeline-cuts'
import { removeTransitionById, setTransitionAtCut } from '../src/timeline-transitions'

/**
 * What the timeline draws while a transition is re-timed.
 *
 * The overlap the effect needs is bought with trimmed-off media, so the clip
 * records do grow — but the user is dragging a band, not a clip, and every
 * edge they placed has to stay where they placed it. These fix that: the drawn
 * bounds must not move a frame between 0.4s and 1.2s of transition.
 */

let idSeq = 0
const makeId = () => `tr-${++idSeq}`

function clip(id: string, startTime: number, duration: number, overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id,
    assetId: `asset-${id}`,
    type: 'video',
    startTime,
    duration,
    trackIndex: 0,
    // Plenty of spare media on both sides, so neither clip has to make the
    // other pay and neither drags the timeline in.
    trimStart: 2,
    trimEnd: 2,
    volume: 1,
    speed: 1,
    transitionIn: { type: 'none', duration: 0.5 },
    transitionOut: { type: 'none', duration: 0.5 },
    ...overrides,
  } as TimelineClip
}

function timeline(clips: TimelineClip[]): Timeline {
  return {
    id: 'tl',
    name: 'Timeline 1',
    createdAt: 0,
    tracks: [{ id: 't0', name: 'V1', muted: false, locked: false, kind: 'video' }],
    clips,
    subtitles: [],
  } as Timeline
}

/** Every clip's drawn rectangle, by id. */
function drawn(tl: Timeline) {
  const extents = clipEdgeExtents(findCutPoints(tl.clips, tl.transitions ?? []))
  return Object.fromEntries(tl.clips.map(candidate => {
    const bounds = visibleClipBounds(candidate, extents.get(candidate.id))
    return [candidate.id, { start: +bounds.startTime.toFixed(4), duration: +bounds.duration.toFixed(4) }]
  }))
}

function withTransition(tl: Timeline, duration: number): Timeline {
  const result = setTransitionAtCut(tl, 'a', 'b', 'dissolve', duration, makeId)
  if (!result.ok) throw new Error(result.reason)
  return result.timeline
}

const PAIR = () => timeline([clip('a', 0, 4), clip('b', 4, 4), clip('c', 8, 4)])

describe('drawn clip bounds across a transition', () => {
  it('leaves every clip where it was when the transition goes in', () => {
    const bare = PAIR()
    expect(drawn(withTransition(bare, 0.6))).toEqual(drawn(bare))
  })

  it('does not move a clip when the transition is re-timed', () => {
    const bare = PAIR()
    const short = withTransition(bare, 0.4)
    const long = withTransition(short, 1.2)
    const shrunk = withTransition(long, 0.2)

    expect(drawn(short)).toEqual(drawn(bare))
    expect(drawn(long)).toEqual(drawn(bare))
    expect(drawn(shrunk)).toEqual(drawn(bare))
  })

  it('grows the band itself, which is the thing that should change', () => {
    const cutOf = (tl: Timeline) => findCutPoints(tl.clips, tl.transitions ?? [])
      .find(candidate => candidate.transition)!

    const short = cutOf(withTransition(PAIR(), 0.4))
    const long = cutOf(withTransition(PAIR(), 1.2))

    expect(short.overlapEnd - short.overlapStart).toBeCloseTo(0.4, 5)
    expect(long.overlapEnd - long.overlapStart).toBeCloseTo(1.2, 5)
    // Centred on the junction the clips still show, both times.
    expect((short.overlapStart + short.overlapEnd) / 2).toBeCloseTo(4, 5)
    expect((long.overlapStart + long.overlapEnd) / 2).toBeCloseTo(4, 5)
  })

  it('draws the clips whole again once the transition is removed', () => {
    const bare = PAIR()
    const placed = withTransition(bare, 0.8)
    const transitionId = placed.transitions![0].id
    const removed = removeTransitionById(placed, transitionId)

    expect(drawn(removed)).toEqual(drawn(bare))
    expect(removed.clips).toEqual(bare.clips)
  })

  it('draws a clip whole when one side had no media to lend', () => {
    // `a` is trimmed to its last frame, so `b` buys the whole overlap by
    // starting early — and the junction the user sees moves left with it.
    const bare = timeline([clip('a', 0, 4, { trimEnd: 0 }), clip('b', 4, 4)])
    const placed = withTransition(bare, 0.6)
    const transition = placed.transitions![0]

    expect(transition.leftExtend).toBeCloseTo(0, 5)
    expect(transition.rightExtend).toBeCloseTo(0.6, 5)
    expect(drawn(placed)).toEqual(drawn(bare))
  })

  it('leaves a stale record alone rather than carving into a clip', () => {
    // The clips were pulled apart after the fact, so the record describes an
    // overlap that is not happening; nothing may be subtracted for it.
    const placed = withTransition(PAIR(), 0.8)
    const torn: Timeline = {
      ...placed,
      clips: placed.clips.map(candidate => (
        candidate.id === 'b' ? { ...candidate, startTime: candidate.startTime + 5 } : candidate
      )),
    }

    const extents = clipEdgeExtents(findCutPoints(torn.clips, torn.transitions ?? []))
    expect(extents.size).toBe(0)
  })
})
