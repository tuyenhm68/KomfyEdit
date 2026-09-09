import { describe, it, expect } from 'vitest'
import {
  fastHash64,
  findComplexSegments,
  computeSegmentContentHash,
} from '../src/render-cache'
import {
  timelineClipSchema,
  type Timeline,
  type TimelineClip,
} from '../src/index'

function makeClip(overrides: Partial<TimelineClip> & { id: string; trackIndex: number; startTime: number; duration: number }): TimelineClip {
  return timelineClipSchema.parse({
    type: 'video',
    assetId: null,
    asset: null,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: false,
    volume: 1,
    flipH: false,
    flipV: false,
    opacity: 100,
    ...overrides,
  })
}

function createTimeline(partial: Partial<Timeline>): Timeline {
  return {
    id: 'timeline-test',
    name: 'Test Timeline',
    createdAt: Date.now(),
    tracks: [
      { id: 't1', name: 'Track 1', type: 'default', muted: false, locked: false, kind: 'video', enabled: true },
      { id: 't2', name: 'Track 2', type: 'default', muted: false, locked: false, kind: 'video', enabled: true },
    ],
    clips: [],
    subtitles: [],
    ...partial,
  }
}

describe('fastHash64', () => {
  it('produces a deterministic 16-hex character string', () => {
    const hash1 = fastHash64('komfyedit_test_render_cache')
    const hash2 = fastHash64('komfyedit_test_render_cache')
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[0-9a-f]{16}$/)
  })

  it('produces different hashes for different inputs', () => {
    const hashA = fastHash64('input_alpha')
    const hashB = fastHash64('input_beta')
    expect(hashA).not.toBe(hashB)
  })
})

describe('findComplexSegments', () => {
  it('returns empty array for empty or simple timeline', () => {
    expect(findComplexSegments(createTimeline({ clips: [] }))).toEqual([])

    const simpleTimeline = createTimeline({
      clips: [
        makeClip({ id: 'c1', trackIndex: 0, startTime: 0, duration: 5 }),
        makeClip({ id: 'c2', trackIndex: 0, startTime: 5, duration: 5 }),
      ],
    })
    expect(findComplexSegments(simpleTimeline)).toEqual([])
  })

  it('detects transitions as complex segments', () => {
    const timeline = createTimeline({
      clips: [
        makeClip({ id: 'c1', trackIndex: 0, startTime: 0, duration: 5 }),
        makeClip({ id: 'c2', trackIndex: 0, startTime: 4, duration: 5 }),
      ],
      transitions: [
        {
          id: 'tr1',
          trackIndex: 0,
          type: 'cross-fade',
          duration: 1,
          leftClipId: 'c1',
          rightClipId: 'c2',
        },
      ],
    })

    const segments = findComplexSegments(timeline)
    expect(segments.length).toBe(1)
    expect(segments[0].startTime).toBe(4)
    expect(segments[0].endTime).toBe(5)
    expect(segments[0].reasons).toContain('transition')
  })

  it('detects multi-track visual overlaps', () => {
    const timeline = createTimeline({
      clips: [
        makeClip({ id: 'c1', trackIndex: 0, startTime: 0, duration: 10 }),
        makeClip({ id: 'c2', trackIndex: 1, startTime: 3, duration: 4 }),
      ],
    })

    const segments = findComplexSegments(timeline)
    expect(segments.length).toBe(1)
    expect(segments[0].startTime).toBe(3)
    expect(segments[0].endTime).toBe(7)
    expect(segments[0].reasons).toContain('multi_layer')
  })

  it('detects chroma key, masks, non-normal blend modes, and adjustments', () => {
    const chromaTimeline = createTimeline({
      clips: [
        makeClip({
          id: 'c1',
          trackIndex: 0,
          startTime: 2,
          duration: 3,
          chromaKey: { enabled: true, color: '#00ff00', similarity: 40, smoothness: 10, spill: 10 },
        }),
      ],
    })
    const chromaSegments = findComplexSegments(chromaTimeline)
    expect(chromaSegments.length).toBe(1)
    expect(chromaSegments[0].reasons).toContain('chromakey')

    const maskTimeline = createTimeline({
      clips: [
        makeClip({
          id: 'c2',
          trackIndex: 0,
          startTime: 1,
          duration: 4,
          mask: { enabled: true, shape: 'ellipse', x: 50, y: 50, width: 50, height: 50, rotation: 0, feather: 0, invert: false },
        }),
      ],
    })
    const maskSegments = findComplexSegments(maskTimeline)
    expect(maskSegments.length).toBe(1)
    expect(maskSegments[0].reasons).toContain('mask')

    const blendTimeline = createTimeline({
      clips: [
        makeClip({
          id: 'c3',
          trackIndex: 0,
          startTime: 0,
          duration: 2,
          blendMode: 'multiply',
        }),
      ],
    })
    const blendSegments = findComplexSegments(blendTimeline)
    expect(blendSegments.length).toBe(1)
    expect(blendSegments[0].reasons).toContain('blendmode')

    const adjTimeline = createTimeline({
      clips: [
        makeClip({
          id: 'adj1',
          trackIndex: 0,
          type: 'adjustment',
          startTime: 5,
          duration: 3,
        }),
      ],
    })
    const adjSegments = findComplexSegments(adjTimeline)
    expect(adjSegments.length).toBe(1)
    expect(adjSegments[0].reasons).toContain('adjustment')
  })

  it('merges adjacent or overlapping complex intervals', () => {
    const timeline = createTimeline({
      clips: [
        makeClip({
          id: 'c1',
          trackIndex: 0,
          startTime: 0,
          duration: 2,
          chromaKey: { enabled: true, color: '#00ff00', similarity: 40, smoothness: 10, spill: 10 },
        }),
        makeClip({
          id: 'c2',
          trackIndex: 0,
          startTime: 2,
          duration: 3,
          mask: { enabled: true, shape: 'rectangle', x: 50, y: 50, width: 50, height: 50, rotation: 0, feather: 0, invert: false },
        }),
      ],
    })

    const segments = findComplexSegments(timeline)
    expect(segments.length).toBe(1)
    expect(segments[0].startTime).toBe(0)
    expect(segments[0].endTime).toBe(5)
  })
})

describe('computeSegmentContentHash', () => {
  const baseTimeline = createTimeline({
    width: 1920,
    height: 1080,
    clips: [
      makeClip({
        id: 'c1',
        assetId: 'a1',
        trackIndex: 0,
        startTime: 0,
        duration: 5,
        trimStart: 1,
        trimEnd: 0,
        speed: 1,
        opacity: 100,
        filter: { id: 'lut_warm', intensity: 80 },
      }),
    ],
  })

  const segment = {
    id: 'seg-1',
    startTime: 0,
    endTime: 5,
    duration: 5,
    reasons: ['test'],
  }

  it('is deterministic for identical inputs', () => {
    const hash1 = computeSegmentContentHash(segment, baseTimeline, '480p')
    const hash2 = computeSegmentContentHash(segment, baseTimeline, '480p')
    expect(hash1).toBe(hash2)
  })

  it('invalidates when clip properties change', () => {
    const originalHash = computeSegmentContentHash(segment, baseTimeline, '480p')

    const timelineTrim = JSON.parse(JSON.stringify(baseTimeline))
    timelineTrim.clips[0].trimStart = 2
    expect(computeSegmentContentHash(segment, timelineTrim, '480p')).not.toBe(originalHash)

    const timelineFilter = JSON.parse(JSON.stringify(baseTimeline))
    timelineFilter.clips[0].filter.intensity = 50
    expect(computeSegmentContentHash(segment, timelineFilter, '480p')).not.toBe(originalHash)

    const timelineSpeed = JSON.parse(JSON.stringify(baseTimeline))
    timelineSpeed.clips[0].speed = 1.5
    expect(computeSegmentContentHash(segment, timelineSpeed, '480p')).not.toBe(originalHash)

    expect(computeSegmentContentHash(segment, baseTimeline, '720p')).not.toBe(originalHash)
  })
})