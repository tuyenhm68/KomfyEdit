import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { splitClipsAtTime } from '../src/editor-actions'
import { selectActiveTimeline } from '../src/editor-selectors'
import { mediaSecondsForTimelineSeconds } from '../src/clip-speed'
import type { Timeline, TimelineClip } from '../src/project-model'

/**
 * Cutting a clip that has been sped up.
 *
 * `startTime` and `duration` count timeline seconds; `trimStart` and `trimEnd`
 * count seconds inside the source file. Speed converts between them. The split
 * used to carry the cut offset across unconverted, so at 6x the second half
 * started six times too early in the file and replayed footage the first half
 * had already shown — which is what a real project looked like: a cut at 29.2s
 * whose second half read from 33.9s instead of 177.3s.
 */

function speedClip(speed: number, trimStart = 0): TimelineClip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    type: 'video',
    startTime: 0,
    duration: 30,
    trimStart,
    trimEnd: 0,
    speed,
    reversed: false,
    muted: false,
    volume: 1,
    trackIndex: 0,
    asset: { id: 'asset-1', type: 'video', path: '/tmp/a.mp4', duration: 600, createdAt: 0 },
    flipH: false,
    flipV: false,
    opacity: 100,
  } as unknown as TimelineClip
}

function stateWith(clip: TimelineClip) {
  const timeline = {
    id: 't1',
    name: 'T',
    createdAt: 0,
    tracks: [{ id: 'v1', name: 'V1', muted: false, locked: false, kind: 'video' }],
    clips: [clip],
    subtitles: [],
  } as unknown as Timeline

  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines: [timeline],
    activeTimelineId: 't1',
  })
}

const halves = (state: ReturnType<typeof stateWith>) =>
  [...selectActiveTimeline(state)!.clips].sort((a, b) => a.startTime - b.startTime)

describe('splitting a clip that plays at speed', () => {
  it('starts the second half where the first half stopped reading', () => {
    const [first, second] = halves(splitClipsAtTime(stateWith(speedClip(6, 1.9)), ['clip-1'], 20))

    // The first half plays 20 timeline seconds at 6x, so it consumes 120
    // seconds of the file starting at 1.9.
    expect(second.trimStart).toBeCloseTo(1.9 + 120, 6)
    expect(first.trimStart + mediaSecondsForTimelineSeconds(first.duration, first.speed))
      .toBeCloseTo(second.trimStart, 6)
  })

  it('closes the first half at the cut rather than at the old out-point', () => {
    const [first] = halves(splitClipsAtTime(stateWith(speedClip(6, 1.9)), ['clip-1'], 20))

    // 10 timeline seconds were cut off the end, which is 60 seconds of file.
    expect(first.trimEnd).toBeCloseTo(60, 6)
  })

  it('leaves the two halves reading disjoint stretches of the file', () => {
    const [first, second] = halves(splitClipsAtTime(stateWith(speedClip(6, 1.9)), ['clip-1'], 20))
    const firstEnd = first.trimStart + mediaSecondsForTimelineSeconds(first.duration, first.speed)

    // The symptom the user saw: the second half overlapping the first, so
    // playing across the cut looped back into footage already shown.
    expect(second.trimStart).toBeGreaterThanOrEqual(firstEnd - 1e-6)
  })

  it('is unchanged at normal speed, where the two units are equal', () => {
    const [first, second] = halves(splitClipsAtTime(stateWith(speedClip(1, 1.9)), ['clip-1'], 20))

    expect(second.trimStart).toBeCloseTo(21.9, 6)
    expect(first.trimEnd).toBeCloseTo(10, 6)
  })

  it('works the other way for a slowed clip', () => {
    const [, second] = halves(splitClipsAtTime(stateWith(speedClip(0.5)), ['clip-1'], 20))
    expect(second.trimStart).toBeCloseTo(10, 6)
  })
})
