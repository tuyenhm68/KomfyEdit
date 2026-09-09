import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { setClipAudioLevel } from '../src/editor-actions'
import { selectClipById } from '../src/editor-selectors'
import { MAX_CLIP_VOLUME } from '../src/project-model'
import type { Timeline, TimelineClip } from '../src/project-model'

/**
 * The volume slider runs to MAX_CLIP_VOLUME (400%): preview lifts a boost
 * through a Web Audio gain node and export rides the peaks down with a
 * look-ahead limiter. The action behind the slider used to clamp at unity, so
 * the slider sprang straight back to 100% and no clip could be made louder.
 */

function clip(extra: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: 'clip-1',
    type: 'video',
    startTime: 0,
    duration: 10,
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
    ...extra,
  } as unknown as TimelineClip
}

function stateWith(clips: TimelineClip[]) {
  const timeline = {
    id: 'timeline-1',
    name: 'Timeline 1',
    tracks: [
      { id: 'track-0', name: 'V1', kind: 'video', locked: false, muted: false, hidden: false, height: 60 },
      { id: 'track-1', name: 'A1', kind: 'audio', locked: false, muted: false, hidden: false, height: 60 },
    ],
    clips,
    subtitles: [],
  } as unknown as Timeline

  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

describe('setClipAudioLevel', () => {
  it('boosts a video clip that carries its own audio', () => {
    const next = setClipAudioLevel(stateWith([clip()]), 'clip-1', 2)
    expect(selectClipById(next, 'clip-1')!.volume).toBe(2)
  })

  it('stops at the slider ceiling rather than at unity', () => {
    const next = setClipAudioLevel(stateWith([clip()]), 'clip-1', 99)
    expect(selectClipById(next, 'clip-1')!.volume).toBe(MAX_CLIP_VOLUME)
  })

  it('still refuses a negative level', () => {
    const next = setClipAudioLevel(stateWith([clip()]), 'clip-1', -3)
    expect(selectClipById(next, 'clip-1')!.volume).toBe(0)
  })

  it('boosts the linked audio clip when the video has one, not the video', () => {
    const video = clip({ linkedClipIds: ['clip-audio'] })
    const audio = clip({ id: 'clip-audio', type: 'audio', trackIndex: 1 })
    const next = setClipAudioLevel(stateWith([video, audio]), 'clip-1', 2.5)

    expect(selectClipById(next, 'clip-audio')!.volume).toBe(2.5)
    expect(selectClipById(next, 'clip-1')!.volume).toBe(1)
  })

  it('unmutes whatever it sets, so raising the level is audible', () => {
    const next = setClipAudioLevel(stateWith([clip({ muted: true })]), 'clip-1', 1.5)
    expect(selectClipById(next, 'clip-1')!.muted).toBe(false)
  })
})
