import { describe, it, expect } from 'vitest'
import { buildVideoFilterGraph } from '../video-filter'
import { buildTransitionRuns, runTimeline, xfadeOffsets } from '../transition-runs'
import type { ExportClip } from '../timeline'

const clip = (id: string, startTime: number, duration: number, trackIndex = 0): ExportClip => ({
  id,
  path: `C:/media/${id}.mp4`,
  type: 'video',
  startTime,
  duration,
  trimStart: 0,
  speed: 1,
  reversed: false,
  flipH: false,
  flipV: false,
  opacity: 100,
  trackIndex,
  muted: false,
  volume: 1,
})

const OPTS = { width: 1920, height: 1080, fps: 30, totalDuration: 7 }

describe('buildTransitionRuns', () => {
  it('joins clips a transition names and leaves the rest alone', () => {
    const clips = [clip('a', 0, 4), clip('b', 3, 4), clip('c', 7, 4)]
    const runs = buildTransitionRuns(clips, [
      { leftClipId: 'a', rightClipId: 'b', type: 'dissolve', duration: 1 },
    ])
    expect(runs).toHaveLength(2)
    expect(runs[0].clips.map(c => c.id)).toEqual(['a', 'b'])
    expect(runs[1].clips.map(c => c.id)).toEqual(['c'])
  })

  it('chains three clips into one run', () => {
    const clips = [clip('a', 0, 4), clip('b', 3, 4), clip('c', 6, 4)]
    const runs = buildTransitionRuns(clips, [
      { leftClipId: 'a', rightClipId: 'b', type: 'dissolve', duration: 1 },
      { leftClipId: 'b', rightClipId: 'c', type: 'wipe-left', duration: 1 },
    ])
    expect(runs).toHaveLength(1)
    expect(runs[0].transitions).toHaveLength(2)
  })

  it('refuses to join clips on different tracks', () => {
    const clips = [clip('a', 0, 4), clip('b', 3, 4, 1)]
    const runs = buildTransitionRuns(clips, [
      { leftClipId: 'a', rightClipId: 'b', type: 'dissolve', duration: 1 },
    ])
    // Two tracks are composited, never folded into one stream.
    expect(runs).toHaveLength(2)
  })

  it('is the identity when there are no transitions', () => {
    const runs = buildTransitionRuns([clip('a', 0, 4), clip('b', 4, 4)], [])
    expect(runs.map(run => run.clips.length)).toEqual([1, 1])
  })
})

describe('run timing', () => {
  it('reports the run shorter by every overlap it contains', () => {
    const run = buildTransitionRuns(
      [clip('a', 0, 4), clip('b', 3, 4), clip('c', 6, 4)],
      [
        { leftClipId: 'a', rightClipId: 'b', type: 'dissolve', duration: 1 },
        { leftClipId: 'b', rightClipId: 'c', type: 'dissolve', duration: 1 },
      ],
    )[0]
    expect(runTimeline(run)).toEqual({ startTime: 0, duration: 10 })
  })

  it('places each xfade where the blend actually begins', () => {
    const run = buildTransitionRuns(
      [clip('a', 0, 4), clip('b', 3, 4), clip('c', 6, 4)],
      [
        { leftClipId: 'a', rightClipId: 'b', type: 'dissolve', duration: 1 },
        { leftClipId: 'b', rightClipId: 'c', type: 'dissolve', duration: 1 },
      ],
    )[0]
    // First blend one second before A ends. After it the stream is 7s long
    // (4 + 4 - 1), so the second blend starts at 6 — not at 7, which is the
    // mistake that silently slides the second cut a second late.
    expect(xfadeOffsets(run)).toEqual([3, 6])
  })
})

describe('the filtergraph', () => {
  it('emits an xfade with the name the catalogue pairs with the id', () => {
    const { filterScript } = buildVideoFilterGraph(
      [clip('a', 0, 4), clip('b', 3, 4)],
      { ...OPTS, transitions: [{ leftClipId: 'a', rightClipId: 'b', type: 'wipe-left', duration: 1 }] },
    )
    expect(filterScript).toContain('xfade=transition=wipeleft')
    expect(filterScript).toContain('duration=1.000000')
    expect(filterScript).toContain('offset=3.000000')
  })

  it('lays both clips onto a full frame first, so xfade gets matching sizes', () => {
    // xfade refuses two streams of different dimensions, and each clip is only
    // as large as its own scale makes it.
    const { filterScript, inputs } = buildVideoFilterGraph(
      [clip('a', 0, 4), clip('b', 3, 4)],
      { ...OPTS, transitions: [{ leftClipId: 'a', rightClipId: 'b', type: 'dissolve', duration: 1 }] },
    )
    expect(filterScript).toContain('[f0_0bg][c0_0]overlay=')
    expect(filterScript).toContain('[f0_1bg][c0_1]overlay=')
    expect(inputs.filter(arg => arg.startsWith('color=c=black@0.0'))).toHaveLength(2)
  })

  it('changes nothing for a timeline with no transitions', () => {
    const withOut = buildVideoFilterGraph([clip('a', 0, 4), clip('b', 4, 4)], OPTS)
    const withEmpty = buildVideoFilterGraph([clip('a', 0, 4), clip('b', 4, 4)], { ...OPTS, transitions: [] })
    expect(withOut.filterScript).toBe(withEmpty.filterScript)
    expect(withOut.filterScript).not.toContain('xfade')
  })

  it('falls back to a cross-fade for a name it does not know', () => {
    const { filterScript } = buildVideoFilterGraph(
      [clip('a', 0, 4), clip('b', 3, 4)],
      { ...OPTS, transitions: [{ leftClipId: 'a', rightClipId: 'b', type: 'radiant-burst', duration: 1 }] },
    )
    // Wrong effect but a watchable file, rather than a failed export.
    expect(filterScript).toContain('xfade=transition=fade')
  })
})
