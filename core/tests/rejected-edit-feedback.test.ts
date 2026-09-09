import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import {
  clearRejectedEdit,
  replaceActiveTimeline,
  setClipDuration,
  setClipSpeed,
  updateClip,
} from '../src/editor-actions'
import { selectActiveTimeline, selectLastRejectedEdit } from '../src/editor-selectors'
import type { Timeline, TimelineClip } from '../src/project-model'

/**
 * A refused edit has to say so.
 *
 * The validator keeps the timeline consistent by turning edits down, and the
 * editor then keeps the previous state. That is correct, but it used to happen
 * in complete silence — the reason went into a module variable nothing read, so
 * from the user's side the Speed and Duration controls were simply dead.
 */

function clip(id: string, startTime: number, duration: number, trackIndex = 0): TimelineClip {
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
    trackIndex,
    asset: { id: 'asset-1', type: 'video', path: '/tmp/a.mp4', duration: 120, createdAt: 0 },
    flipH: false,
    flipV: false,
    opacity: 100,
  } as unknown as TimelineClip
}

function twoClipsOnV1() {
  const timeline = {
    id: 'timeline-1',
    name: 'Timeline 1',
    createdAt: 0,
    tracks: [
      { id: 'track-v1', name: 'V1', muted: false, locked: false, sourcePatched: true, kind: 'video' },
    ],
    clips: [clip('first', 0, 20), clip('second', 20, 10)],
    subtitles: [],
  } as unknown as Timeline

  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

describe('feedback when an edit is refused', () => {
  it('records the rule that turned the edit down', () => {
    const next = updateClip(twoClipsOnV1(), 'first', { duration: 10 })

    expect(selectLastRejectedEdit(next)?.rule).toBe('V1_NOT_SEAMLESS')
    expect(selectLastRejectedEdit(next)?.message).toContain('V1')
  })

  it('leaves the timeline exactly as it was', () => {
    const before = twoClipsOnV1()
    const after = updateClip(before, 'first', { duration: 10 })

    expect(after.editorModel).toBe(before.editorModel)
  })

  it('says nothing when the edit goes through', () => {
    const next = setClipSpeed(twoClipsOnV1(), 'first', 2, 10)
    expect(selectLastRejectedEdit(next)).toBeNull()
  })

  it('clears an old complaint once an edit succeeds', () => {
    const refused = updateClip(twoClipsOnV1(), 'first', { duration: 10 })
    expect(selectLastRejectedEdit(refused)).not.toBeNull()

    const accepted = setClipSpeed(refused, 'first', 2, 10)
    expect(selectLastRejectedEdit(accepted)).toBeNull()
  })

  it('can be dismissed by hand', () => {
    const refused = updateClip(twoClipsOnV1(), 'first', { duration: 10 })
    expect(selectLastRejectedEdit(clearRejectedEdit(refused))).toBeNull()
  })

  it('reports a locked track in the same way', () => {
    const state = createInitialEditorState({
      assets: [],
      bins: {},
      timelines: [{
        id: 't1',
        name: 'T',
        createdAt: 0,
        tracks: [{ id: 'v1', name: 'V1', muted: false, locked: true, kind: 'video' }],
        clips: [clip('only', 0, 5)],
        subtitles: [],
      } as unknown as Timeline],
      activeTimelineId: 't1',
    })

    const next = replaceActiveTimeline(state, timeline => ({ ...timeline, clips: [] }))
    expect(selectLastRejectedEdit(next)?.rule).toBe('LOCKED_TRACK_MODIFIED')
  })

  it('the re-timing setters do not trip the rule they used to', () => {
    // setClipDuration packs V1, so shortening the first clip is accepted where
    // the raw patch was refused.
    const next = setClipDuration(twoClipsOnV1(), 'first', 10)

    expect(selectLastRejectedEdit(next)).toBeNull()
    const clips = [...selectActiveTimeline(next)!.clips].sort((a, b) => a.startTime - b.startTime)
    expect(clips[0].duration).toBe(10)
    expect(clips[1].startTime).toBe(10)
  })
})
