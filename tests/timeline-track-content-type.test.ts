import { describe, it, expect } from 'vitest'
import { getTrackContentType } from '../frontend/views/editor/timeline/TimelineTrackHeaders'
import type { Track, TimelineClip } from '../frontend/types/project-model'

describe('getTrackContentType', () => {
  const createBaseTrack = (overrides: Partial<Track> = {}): Track => ({
    id: 'track-1',
    name: 'V1',
    muted: false,
    locked: false,
    kind: 'video',
    ...overrides,
  })

  const createBaseClip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
    id: 'clip-1',
    assetId: null,
    type: 'video',
    startTime: 0,
    duration: 5,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: false,
    volume: 1,
    trackIndex: 0,
    asset: null,
    flipH: false,
    flipV: false,
    transitionIn: { type: 'none', duration: 0 },
    transitionOut: { type: 'none', duration: 0 },
    colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
    transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
    opacity: 100,
    ...overrides,
  })

  it('identifies subtitle tracks', () => {
    const track = createBaseTrack({ type: 'subtitle' })
    expect(getTrackContentType(track, 0, [])).toBe('subtitle')
  })

  it('identifies audio tracks', () => {
    const track = createBaseTrack({ kind: 'audio', name: 'A1' })
    expect(getTrackContentType(track, 0, [])).toBe('audio')
  })

  it('identifies text tracks when track contains text clips', () => {
    const track = createBaseTrack({ name: 'V2' })
    const clips = [
      createBaseClip({ id: 'c1', type: 'text', trackIndex: 1 }),
      createBaseClip({ id: 'c2', type: 'video', trackIndex: 0 }),
    ]
    expect(getTrackContentType(track, 1, clips)).toBe('text')
  })

  it('identifies adjustment layer tracks when track contains adjustment clips', () => {
    const track = createBaseTrack({ name: 'V3' })
    const clips = [
      createBaseClip({ id: 'c1', type: 'adjustment', trackIndex: 2 }),
    ]
    expect(getTrackContentType(track, 2, clips)).toBe('adjustment')
  })

  it('identifies image tracks when track contains image clips', () => {
    const track = createBaseTrack({ name: 'V2' })
    const clips = [
      createBaseClip({ id: 'c1', type: 'image', trackIndex: 1 }),
    ]
    expect(getTrackContentType(track, 1, clips)).toBe('image')
  })

  it('falls back to text when track name contains text/chữ and track is empty', () => {
    const track = createBaseTrack({ name: 'Text Overlay' })
    expect(getTrackContentType(track, 0, [])).toBe('text')
  })

  it('defaults to video for normal empty video tracks', () => {
    const track = createBaseTrack({ name: 'V1' })
    expect(getTrackContentType(track, 0, [])).toBe('video')
  })

  describe('sticker rows', () => {
    it('reports sticker from the track kind, not from what is on it', () => {
      // A sticker clip is an image clip. Reading the contents would give a
      // sticker row the same picture icon a photo row gets, which is exactly
      // the confusion the separate track kind exists to remove.
      const track = createBaseTrack({ kind: 'sticker', name: 'S1' })
      const clips = [createBaseClip({ type: 'image', trackIndex: 0, stickerId: 'fire' })]

      expect(getTrackContentType(track, 0, clips)).toBe('sticker')
    })

    it('reports sticker even for an empty sticker row', () => {
      const track = createBaseTrack({ kind: 'sticker', name: 'S1' })
      expect(getTrackContentType(track, 0, [])).toBe('sticker')
    })

    it('still calls a plain image row an image row', () => {
      const track = createBaseTrack({ kind: 'video', name: 'V2' })
      const clips = [createBaseClip({ type: 'image', trackIndex: 0 })]
      expect(getTrackContentType(track, 0, clips)).toBe('image')
    })
  })
})
