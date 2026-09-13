import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { play, togglePlayPause, setClipSpeed, setCurrentTime } from '../src/editor-actions'
import { selectContentDuration, selectCurrentTime, selectIsPlaying } from '../src/editor-selectors'
import type { Timeline, TimelineClip } from '../src/project-model'

function clip(id: string, startTime: number, duration: number): TimelineClip {
  return {
    id,
    assetId: 'asset-1',
    type: 'video',
    startTime,
    duration,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: false,
    volume: 1,
    trackIndex: 0,
    asset: { id: 'asset-1', type: 'video', path: '/tmp/a.mp4', duration: 120, createdAt: 0 },
    flipH: false,
    flipV: false,
    opacity: 100,
  } as unknown as TimelineClip
}

function singleClipTimeline(duration = 20) {
  const timeline = {
    id: 'timeline-1',
    name: 'Timeline 1',
    createdAt: 0,
    tracks: [
      { id: 'track-v1', name: 'V1', muted: false, locked: false, sourcePatched: true, kind: 'video' },
    ],
    clips: [clip('first', 0, duration)],
    subtitles: [],
  } as unknown as Timeline

  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

describe('selectContentDuration', () => {
  it('measures exact end of latest clip', () => {
    const state = singleClipTimeline(13.5)
    expect(selectContentDuration(state)).toBe(13.5)
  })

  it('returns 0 when timeline is empty', () => {
    const timeline = {
      id: 'timeline-empty',
      name: 'Empty',
      createdAt: 0,
      tracks: [{ id: 'track-v1', name: 'V1', muted: false, locked: false, sourcePatched: true, kind: 'video' }],
      clips: [],
      subtitles: [],
    } as unknown as Timeline

    const state = createInitialEditorState({
      assets: [],
      bins: {},
      timelines: [timeline],
      activeTimelineId: timeline.id,
    })

    expect(selectContentDuration(state)).toBe(0)
  })
})

describe('playhead bounds when video duration changes', () => {
  it('clamps currentTime when video duration shrinks from speed increase', () => {
    // Start with 20s clip, playhead at 15s
    let state = singleClipTimeline(20)
    state = setCurrentTime(state, 15)
    expect(selectCurrentTime(state)).toBe(15)

    // Double speed -> clip duration shrinks to 10s
    const next = setClipSpeed(state, 'first', 2, 10)
    expect(selectContentDuration(next)).toBe(10)
    // Playhead must now be clamped to the end of the video (10s), NOT left at 15s in empty void
    expect(selectCurrentTime(next)).toBe(10)
  })
})

describe('auto-rewind when playing from the end of the video', () => {
  it('rewinds to 0 when play is invoked at the end of the video', () => {
    let state = singleClipTimeline(13.5)
    state = setCurrentTime(state, 13.5)
    expect(selectCurrentTime(state)).toBe(13.5)

    const afterPlay = play(state)
    expect(selectIsPlaying(afterPlay)).toBe(true)
    expect(selectCurrentTime(afterPlay)).toBe(0)
  })

  it('rewinds to 0 when togglePlayPause is invoked at the end of the video', () => {
    let state = singleClipTimeline(13.5)
    state = setCurrentTime(state, 13.48) // within epsilon of end
    expect(selectCurrentTime(state)).toBe(13.48)

    const afterToggle = togglePlayPause(state)
    expect(selectIsPlaying(afterToggle)).toBe(true)
    expect(selectCurrentTime(afterToggle)).toBe(0)
  })

  it('does not rewind when play is invoked in the middle of the video', () => {
    let state = singleClipTimeline(13.5)
    state = setCurrentTime(state, 5.0)

    const afterPlay = play(state)
    expect(selectIsPlaying(afterPlay)).toBe(true)
    expect(selectCurrentTime(afterPlay)).toBe(5.0)
  })
})
