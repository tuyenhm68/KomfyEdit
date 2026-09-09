import { describe, it, expect } from 'vitest'
import { findCutPoints, findJunctionNear, findJunctions, nearestCut } from '../src/timeline-cuts'
import type { TimelineClip, TimelineTransition } from '../src/project-model'

const clip = (id: string, startTime: number, duration: number, trackIndex = 0) =>
  ({ id, startTime, duration, trackIndex } as TimelineClip)

const transition = (leftClipId: string, rightClipId: string, duration: number) =>
  ({ id: `t-${leftClipId}`, leftClipId, rightClipId, trackIndex: 0, type: 'dissolve', duration } as TimelineTransition)

describe('findCutPoints', () => {
  it('finds a plain cut between two touching clips', () => {
    const cuts = findCutPoints([clip('a', 0, 4), clip('b', 4, 4)])
    expect(cuts).toHaveLength(1)
    expect(cuts[0]).toMatchObject({ time: 4, overlapStart: 4, overlapEnd: 4, transition: null })
  })

  it('keeps finding the junction once a transition makes the clips overlap', () => {
    // The old adjacency test lost the cut here: the edges no longer meet, and
    // the marker vanished exactly when there was a transition to show.
    const cuts = findCutPoints([clip('a', 0, 4), clip('b', 3, 4)], [transition('a', 'b', 1)])
    expect(cuts).toHaveLength(1)
    expect(cuts[0].overlapStart).toBe(3)
    expect(cuts[0].overlapEnd).toBe(4)
    expect(cuts[0].time).toBe(3.5)
    expect(cuts[0].transition?.duration).toBe(1)
  })

  it('ignores an overlap no transition explains', () => {
    expect(findCutPoints([clip('a', 0, 4), clip('b', 2, 4)])).toHaveLength(0)
  })

  it('ignores a gap', () => {
    expect(findCutPoints([clip('a', 0, 4), clip('b', 6, 4)])).toHaveLength(0)
  })

  it('never pairs clips across tracks', () => {
    expect(findCutPoints([clip('a', 0, 4), clip('b', 4, 4, 1)])).toHaveLength(0)
  })

  it('finds every junction along a run', () => {
    const cuts = findCutPoints(
      [clip('a', 0, 4), clip('b', 3, 4), clip('c', 6, 4)],
      [transition('a', 'b', 1), transition('b', 'c', 1)],
    )
    expect(cuts).toHaveLength(2)
  })
})

describe('nearestCut', () => {
  const cuts = findCutPoints(
    [clip('a', 0, 4), clip('b', 3, 4), clip('c', 7, 4)],
    [transition('a', 'b', 1)],
  )

  it('picks the closer junction', () => {
    expect(nearestCut(cuts, 0.5)?.leftClip.id).toBe('a')
    expect(nearestCut(cuts, 6.9)?.leftClip.id).toBe('b')
  })

  it('treats a playhead inside an overlap as being on that cut', () => {
    // Parked mid-transition, you mean the transition you are looking at.
    expect(nearestCut(cuts, 3.5)?.transition).not.toBeNull()
  })

  it('refuses when everything is too far away', () => {
    expect(nearestCut(cuts, 100, 2)).toBeNull()
  })

  it('returns nothing when there are no cuts at all', () => {
    expect(nearestCut([], 5)).toBeNull()
  })
})

describe('findJunctionNear', () => {
  /** The overlay-track case: two clips placed by hand, not quite touching. */
  const GAPPED = [clip('a', 10, 4, 2), clip('b', 14.4, 4, 2), clip('x', 0, 4, 0)]

  it('finds the pair a drop between them was aimed at', () => {
    const junction = findJunctionNear(GAPPED, 2, 14.3, 1, 0.5)
    expect(junction?.leftClip.id).toBe('a')
    expect(junction?.rightClip.id).toBe('b')
    expect(junction?.gap).toBeCloseTo(0.4, 5)
  })

  it('ignores junctions on other tracks', () => {
    expect(findJunctionNear(GAPPED, 0, 14.3, 1, 0.5)).toBeNull()
  })

  it('refuses a gap wider than the caller allows', () => {
    expect(findJunctionNear(GAPPED, 2, 14.3, 1, 0.2)).toBeNull()
  })

  it('refuses a drop that landed too far from the junction', () => {
    expect(findJunctionNear(GAPPED, 2, 17, 1, 0.5)).toBeNull()
  })

  it('leaves overlapping clips to the cut finder', () => {
    expect(findJunctionNear([clip('a', 0, 4, 0), clip('b', 3, 4, 0)], 0, 3.5, 1, 0.5)).toBeNull()
  })
})

describe('findJunctions', () => {
  it('reports every near-cut on every track, with its gap', () => {
    const junctions = findJunctions([
      clip('a', 10, 4, 2), clip('b', 14.4, 4, 2),
      clip('x', 0, 4, 0), clip('y', 4, 4, 0),
    ], 0.5)

    expect(junctions).toHaveLength(2)
    expect(junctions.find(j => j.trackIndex === 2)?.gap).toBeCloseTo(0.4, 5)
    expect(junctions.find(j => j.trackIndex === 0)?.gap).toBe(0)
  })

  it('leaves out gaps too wide to be an aiming mistake', () => {
    expect(findJunctions([clip('a', 0, 4, 0), clip('b', 9, 4, 0)], 0.5)).toHaveLength(0)
  })
})
