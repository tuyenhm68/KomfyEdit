import { describe, it, expect } from 'vitest'
import { insertBrollClip } from '../src/editor-actions'
import { createInitialEditorState } from '../src/editor-state'
import type { EditorModel } from '../src/editor-state'
import type { Timeline, TimelineClip, Track } from '../src/project-model'
import { BROLL_TRACK_NAME } from '../src/broll-copilot'

/*
 * The timeline shape that made "Insert B-roll" do nothing visible.
 *
 * Generating captions calls addSubtitleTrack, which PREPENDS the track and
 * shifts every clip up — so a captioned project has the subtitle track at
 * index 0 and the footage at index 1. The subtitle track also carries
 * `kind: 'video'`, so a naive search for a picture track finds it first, and
 * a video clip parked among the captions is drawn by nothing.
 */
const subtitleTrack: Track = {
  id: 'track-sub', name: 'Subtitles', muted: false, locked: false,
  kind: 'video', type: 'subtitle',
}
const videoTrack: Track = {
  id: 'track-v', name: 'V1', muted: false, locked: false,
  kind: 'video', type: 'default',
}
const audioTrack: Track = {
  id: 'track-a', name: 'A1', muted: false, locked: false,
  kind: 'audio', type: 'default',
}

const footage: TimelineClip = {
  id: 'main', type: 'video', startTime: 0, duration: 55.6,
  trimStart: 0, trimEnd: 0, trackIndex: 1, speed: 1,
  assetId: 'asset-main',
  asset: { id: 'asset-main', type: 'video', path: 'C:/media/trellis.mp4' },
} as unknown as TimelineClip

function stateWithCaptionedTimeline() {
  const timeline: Timeline = {
    id: 'tl-1', name: 'Timeline 1', createdAt: 0,
    tracks: [subtitleTrack, videoTrack, audioTrack],
    clips: [footage],
    subtitles: [],
  }
  const model: EditorModel = {
    assets: [
      { id: 'asset-main', type: 'video', path: 'C:/media/trellis.mp4', createdAt: 0 },
      { id: 'asset-broll', type: 'video', path: 'C:/media/city.mp4', createdAt: 0 },
    ] as EditorModel['assets'],
    bins: {},
    timelines: [timeline],
    activeTimelineId: 'tl-1',
  }
  return createInitialEditorState(model)
}

describe('insertBrollClip on a captioned timeline', () => {
  const inserted = (state = stateWithCaptionedTimeline()) => {
    const next = insertBrollClip(state, {
      assetId: 'asset-broll',
      assetPath: 'C:/media/city.mp4',
      startTime: 1.6,
      duration: 4.5,
      muteAudio: true,
    })
    const tl = next.editorModel.timelines[0]
    return { next, tl, clip: tl.clips.find(c => c.id !== 'main')! }
  }

  it('never parks the B-roll on the subtitle track, where nothing draws it', () => {
    const { tl, clip } = inserted()
    expect(tl.tracks[clip.trackIndex]?.type).not.toBe('subtitle')
  })

  it('does not drop it on the footage it is meant to cut away from', () => {
    const { clip } = inserted()
    expect(clip.trackIndex).not.toBe(footage.trackIndex)
  })

  it('creates a dedicated B-roll track rather than borrowing an existing one', () => {
    const { tl, clip } = inserted()
    const track = tl.tracks[clip.trackIndex]
    expect(track.name).toBe(BROLL_TRACK_NAME)
    expect(track.kind).toBe('video')
    expect(track.type).not.toBe('subtitle')
    // V1 keeps the footage; the B-roll track is new.
    expect(tl.tracks.filter(t => t.name === BROLL_TRACK_NAME)).toHaveLength(1)
  })

  it('reuses that one track for every later insert instead of stacking tracks', () => {
    const first = insertBrollClip(stateWithCaptionedTimeline(), {
      assetId: 'asset-broll', assetPath: 'C:/media/city.mp4', startTime: 1.6, duration: 4.5,
    })
    const second = insertBrollClip(first, {
      assetId: 'asset-broll', assetPath: 'C:/media/city.mp4', startTime: 20, duration: 4.5,
    })
    const tl = second.editorModel.timelines[0]
    expect(tl.tracks.filter(t => t.name === BROLL_TRACK_NAME)).toHaveLength(1)

    const brollIndex = tl.tracks.findIndex(t => t.name === BROLL_TRACK_NAME)
    const brollClips = tl.clips.filter(c => c.id !== 'main')
    expect(brollClips).toHaveLength(2)
    expect(brollClips.every(c => c.trackIndex === brollIndex)).toBe(true)
  })

  it('carries the chosen media, not whatever was first in the project', () => {
    const { clip } = inserted()
    expect(clip.assetId).toBe('asset-broll')
    expect(clip.asset?.path).toBe('C:/media/city.mp4')
  })

  it('keeps the requested placement and mutes it under the speaker', () => {
    const { clip } = inserted()
    expect(clip.startTime).toBe(1.6)
    expect(clip.duration).toBe(4.5)
    expect(clip.muted).toBe(true)
  })
})
