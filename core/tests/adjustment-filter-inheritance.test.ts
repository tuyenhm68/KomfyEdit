import { describe, it, expect } from 'vitest'
import type { TimelineClip, Track } from '../src/project-model'
import { getClipEffectStyles, resolveEffectiveClipFilter } from '../src/video-editor-utils'

/**
 * Who grades a clip, taken from a real project: a video with its own LUT on V1,
 * two stills with none on V3, and a "Filter: Film Classic" adjustment layer on
 * V4 spanning the whole timeline. The stills looked ungraded next to the very
 * obviously graded video, so what each layer inherits is pinned here.
 */

const track = (name: string, enabled?: boolean): Track => (
  { id: name, name, kind: 'video', muted: false, locked: false, ...(enabled === undefined ? {} : { enabled }) } as Track
)

const clip = (id: string, type: TimelineClip['type'], startTime: number, duration: number, o: Partial<TimelineClip> = {}): TimelineClip => ({
  id, assetId: `a-${id}`, type, startTime, duration, trackIndex: 0,
  trimStart: 0, trimEnd: 0, volume: 1, speed: 1,
  transitionIn: { type: 'none', duration: 0.5 }, transitionOut: { type: 'none', duration: 0.5 },
  ...o,
} as TimelineClip)

const TRACKS = [track('V1'), track('A1'), track('V3'), track('V4')]
const ADJUSTMENT = clip('adj', 'adjustment', 0, 918, { trackIndex: 3, filter: { id: 'film-classic', intensity: 100 } })

describe('resolveEffectiveClipFilter', () => {
  it('lends an adjustment layer to a still that has none of its own', () => {
    const still = clip('boy', 'image', 5, 5.62, { trackIndex: 2 })
    expect(resolveEffectiveClipFilter(still, [ADJUSTMENT], TRACKS)).toEqual({ id: 'film-classic', intensity: 100 })
  })

  it('lets the clip’s own filter win over the layer above it', () => {
    const video = clip('vid', 'video', 0, 351, { trackIndex: 0, filter: { id: 'noir-bw', intensity: 100 } })
    expect(resolveEffectiveClipFilter(video, [ADJUSTMENT], TRACKS)?.id).toBe('noir-bw')
  })

  it('grades nothing that the export would not grade', () => {
    const text = clip('txt', 'text', 0, 10, { trackIndex: 2 })
    const audio = clip('aud', 'audio', 0, 10, { trackIndex: 1 })
    expect(resolveEffectiveClipFilter(text, [ADJUSTMENT], TRACKS)).toBeUndefined()
    expect(resolveEffectiveClipFilter(audio, [ADJUSTMENT], TRACKS)).toBeUndefined()
  })

  it('ignores a layer that does not span the whole clip', () => {
    const still = clip('boy', 'image', 5, 5.62, { trackIndex: 2 })
    const short = { ...ADJUSTMENT, startTime: 6, duration: 1 }
    expect(resolveEffectiveClipFilter(still, [short], TRACKS)).toBeUndefined()
  })

  it('ignores a layer on a disabled track', () => {
    const still = clip('boy', 'image', 5, 5.62, { trackIndex: 2 })
    const tracks = [track('V1'), track('A1'), track('V3'), track('V4', false)]
    expect(resolveEffectiveClipFilter(still, [ADJUSTMENT], tracks)).toBeUndefined()
  })
})

describe('LUT approximation in CSS', () => {
  const still = clip('boy', 'image', 5, 5.62, { trackIndex: 2, filter: { id: 'noir-bw', intensity: 100 } })

  it('stands in for the LUT by default', () => {
    expect(getClipEffectStyles(still, 0).filter).toContain('grayscale(')
  })

  it('steps aside for the layer the canvas grades for real', () => {
    // Otherwise the preview shows the look twice — once from the .cube file,
    // once from the CSS — and comes out heavier than the exported file.
    expect(getClipEffectStyles(still, 0, { lutApproximation: false }).filter).toBeUndefined()
  })

  it('keeps colour correction, which no canvas applies', () => {
    const corrected = { ...still, colorCorrection: { brightness: 20, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 } } as TimelineClip
    const style = getClipEffectStyles(corrected, 0, { lutApproximation: false })
    expect(style.filter).toContain('brightness(1.2)')
    expect(style.filter).not.toContain('grayscale(')
  })

  it('grades incoming transition half and lower composited layers for real without CSS double-grading', () => {
    const incomingClip = clip('incoming', 'video', 10, 5, { trackIndex: 0, filter: { id: 'noir-bw', intensity: 100 } })
    const lowerClip = clip('lower', 'video', 0, 20, { trackIndex: 0 })

    // Incoming transition clip resolves its effective filter
    const incomingEffective = resolveEffectiveClipFilter(incomingClip, [ADJUSTMENT], TRACKS)
    expect(incomingEffective?.id).toBe('noir-bw')

    // Lower compositing clip resolves adjustment layer filter
    const lowerEffective = resolveEffectiveClipFilter(lowerClip, [ADJUSTMENT], TRACKS)
    expect(lowerEffective).toEqual({ id: 'film-classic', intensity: 100 })

    // When real WebGL LutCanvas grades the layer (lutApproximation: false):
    // CSS approximation steps aside so the layer is graded for real via WebGL without double-grading
    const incomingGraded = getClipEffectStyles(incomingClip, 0, { lutApproximation: false })
    expect(incomingGraded.filter).toBeUndefined()

    const lowerWithLut = { ...lowerClip, filter: lowerEffective }
    const lowerGraded = getClipEffectStyles(lowerWithLut, 0, { lutApproximation: false })
    expect(lowerGraded.filter).toBeUndefined()

    // Fallback when no WebGL canvas is available (lutApproximation: true):
    const lowerFallback = getClipEffectStyles(lowerWithLut, 0, { lutApproximation: true })
    expect(lowerFallback.filter).toBeDefined()
  })
})
