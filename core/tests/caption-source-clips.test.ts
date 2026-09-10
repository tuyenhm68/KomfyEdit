import { describe, it, expect } from 'vitest'
import { selectCaptionSourceClips } from '../src/whisper-types'
import type { TimelineClip } from '../src/project-model'

/**
 * Which clips a caption run transcribes.
 *
 * The bug this covers: after cutting a video, the timeline holds several clips
 * of the same recording and the panel transcribed only the first of them, so
 * captions stopped at the first cut and the rest of the video played silent.
 */

function clip(id: string, startTime: number, extra: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id,
    type: 'video',
    startTime,
    duration: 5,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: false,
    volume: 1,
    trackIndex: 0,
    asset: { id: `asset-${id}`, type: 'video', path: 'C:\\clips\\take.mp4', prompt: '', resolution: '', createdAt: 0 },
    flipH: false,
    flipV: false,
    transitionIn: { type: 'none', duration: 0 },
    transitionOut: { type: 'none', duration: 0 },
    ...extra,
  } as unknown as TimelineClip
}

const none: ReadonlySet<string> = new Set()

describe('selectCaptionSourceClips', () => {
  it('covers every cut of the video, not just the first', () => {
    const clips = [clip('c1', 0), clip('c2', 5), clip('c3', 10)]
    expect(selectCaptionSourceClips(clips, none).map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('returns them in playing order however the list is stored', () => {
    const clips = [clip('c3', 10), clip('c1', 0), clip('c2', 5)]
    expect(selectCaptionSourceClips(clips, none).map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('narrows to the selection when the user made one', () => {
    const clips = [clip('c1', 0), clip('c2', 5), clip('c3', 10)]
    expect(selectCaptionSourceClips(clips, new Set(['c2', 'c3'])).map(c => c.id)).toEqual(['c2', 'c3'])
  })

  it('takes the linked audio clip and not the video it was split from', () => {
    const video = clip('v1', 0, { linkedClipIds: ['a1'] })
    const audio = clip('a1', 0, { type: 'audio', trackIndex: 1 })
    expect(selectCaptionSourceClips([video, audio], none).map(c => c.id)).toEqual(['a1'])
  })

  it('keeps a video that carries its own audio', () => {
    const video = clip('v1', 0)
    const music = clip('m1', 0, { type: 'audio', trackIndex: 1 })
    expect(selectCaptionSourceClips([video, music], none).map(c => c.id)).toEqual(['v1', 'm1'])
  })

  it('skips text, stickers and anything with no file behind it', () => {
    const text = clip('t1', 0, { type: 'text', asset: null })
    const pathless = clip('p1', 1, { asset: null })
    expect(selectCaptionSourceClips([text, pathless], none)).toEqual([])
  })
})
