import { describe, it, expect } from 'vitest'
import { escapeFfmpegLutPath, buildLutFilter, resolveLutPath } from '../lut-filter'
import { buildVideoFilterGraph } from '../video-filter'
import type { ExportClip } from '../timeline'

describe('Sprint F0-3: ffmpeg lut3d export integration', () => {
  it('escapes Windows backslashes and drive colons correctly', () => {
    const winPath = 'C:\\Program Files\\KomfyEdit\\resources\\luts\\cine.cube'
    const escaped = escapeFfmpegLutPath(winPath)
    // Double backslash in JS string literal 'C\\\\:' equals C\\: in string value
    expect(escaped).toBe('C\\\\:/Program Files/KomfyEdit/resources/luts/cine.cube')
  })

  it('preserves POSIX paths without modification', () => {
    const posixPath = '/usr/share/komfyedit/resources/luts/cine.cube'
    const escaped = escapeFfmpegLutPath(posixPath)
    expect(escaped).toBe(posixPath)
  })

  it('returns empty string when filter is absent or intensity is 0', () => {
    expect(buildLutFilter(undefined)).toBe('')
    expect(buildLutFilter({ id: '' })).toBe('')
    expect(buildLutFilter({ id: 'test-filter', intensity: 0 })).toBe('')
  })

  it('builds lut3d filter with trilinear interpolation for valid filter', () => {
    const filter = buildLutFilter({ id: 'vintage-warmth', intensity: 100 })
    expect(filter).toContain('lut3d=file=')
    expect(filter).toContain('vintage-warmth.cube')
    expect(filter).toContain(':interp=trilinear')
  })

  it('integrates lut3d filter into buildVideoFilterGraph', () => {
    const clip: ExportClip = {
      path: '/media/video.mp4',
      type: 'video',
      startTime: 0,
      duration: 5,
      trimStart: 0,
      speed: 1,
      reversed: false,
      flipH: false,
      flipV: false,
      opacity: 100,
      trackIndex: 0,
      muted: false,
      volume: 100,
      filter: { id: 'cinematic-gold', intensity: 100 },
      colorCorrection: {
        brightness: 10,
        contrast: 0,
        saturation: 0,
        temperature: 0,
        tint: 0,
        exposure: 0,
        highlights: 0,
        shadows: 0,
      },
    }

    const graph = buildVideoFilterGraph([clip], {
      width: 1920,
      height: 1080,
      fps: 30,
      totalDuration: 5,
    })

    // Confirm that color correction comes first, then lut3d
    const filterScript = graph.filterScript
    const eqIdx = filterScript.indexOf('eq=brightness=')
    const lutIdx = filterScript.indexOf('lut3d=file=')
    expect(eqIdx).toBeGreaterThan(-1)
    expect(lutIdx).toBeGreaterThan(-1)
    expect(eqIdx).toBeLessThan(lutIdx)
  })

  it('grades a still exactly like a video', () => {
    // A still takes a different branch into the chain — looped input, no trim —
    // so its grading is asserted separately rather than assumed.
    const still: ExportClip = {
      path: '/media/photo.png',
      type: 'image',
      startTime: 0,
      duration: 4,
      trimStart: 0,
      speed: 1,
      reversed: false,
      flipH: false,
      flipV: false,
      opacity: 100,
      trackIndex: 0,
      muted: false,
      volume: 100,
      filter: { id: 'cinematic-gold', intensity: 80 },
    }

    const { filterScript } = buildVideoFilterGraph([still], {
      width: 1920,
      height: 1080,
      fps: 30,
      totalDuration: 4,
    })

    const lutIdx = filterScript.indexOf('lut3d=file=')
    const scaleIdx = filterScript.indexOf('scale=')
    expect(lutIdx).toBeGreaterThan(-1)
    // Graded after it is scaled to the frame, as a video clip is.
    expect(scaleIdx).toBeLessThan(lutIdx)
  })
})
