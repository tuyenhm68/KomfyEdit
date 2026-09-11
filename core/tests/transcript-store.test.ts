import { describe, it, expect } from 'vitest'
import {
  findAssetTranscript,
  subtitlesAsTranscriptCues,
  timelineTranscriptCues,
  toTranscriptSegments,
  transcriptCuesForClip,
  upsertAssetTranscript,
  type AssetTranscript,
} from '../src/transcript-store'
import type { TimelineClip } from '../src/project-model'

const transcript = (over: Partial<AssetTranscript> = {}): AssetTranscript => ({
  assetPath: 'C:/media/talk.mp4',
  language: 'vi',
  createdAt: 1,
  segments: [
    { start: 0, end: 5, text: 'câu một' },
    { start: 5, end: 10, text: 'câu hai' },
    { start: 10, end: 15, text: 'câu ba' },
  ],
  ...over,
})

const clip = (over: Partial<TimelineClip> = {}): TimelineClip => ({
  id: 'clip-1',
  type: 'video',
  startTime: 0,
  duration: 15,
  trimStart: 0,
  trimEnd: 0,
  trackIndex: 0,
  speed: 1,
  asset: { path: 'C:/media/talk.mp4' },
  ...over,
} as TimelineClip)

describe('transcript store', () => {
  describe('toTranscriptSegments', () => {
    it('drops blank and inverted segments and sorts what is left', () => {
      expect(toTranscriptSegments([
        { start: 8, end: 9, text: 'sau' },
        { start: 1, end: 1, text: 'không có độ dài' },
        { start: 2, end: 3, text: '   ' },
        { start: 0, end: 1, text: '  trước  ' },
      ])).toEqual([
        { start: 0, end: 1, text: 'trước' },
        { start: 8, end: 9, text: 'sau' },
      ])
    })
  })

  describe('upsertAssetTranscript', () => {
    it('replaces the transcript of the same audio rather than stacking copies', () => {
      const first = transcript()
      const second = transcript({ createdAt: 2, segments: [{ start: 0, end: 1, text: 'làm lại' }] })
      const list = upsertAssetTranscript(upsertAssetTranscript([], first), second)
      expect(list).toHaveLength(1)
      expect(list[0].createdAt).toBe(2)
    })

    it('keeps transcripts of different media side by side', () => {
      const list = upsertAssetTranscript(
        upsertAssetTranscript([], transcript()),
        transcript({ assetPath: 'C:/media/other.mp4' }),
      )
      expect(list).toHaveLength(2)
      expect(findAssetTranscript(list, 'C:/media/other.mp4')?.assetPath).toBe('C:/media/other.mp4')
    })

    it('does not hand back a transcript of another language when one is asked for', () => {
      const list = upsertAssetTranscript([], transcript({ language: 'vi' }))
      expect(findAssetTranscript(list, 'C:/media/talk.mp4', 'en')).toBeUndefined()
      expect(findAssetTranscript(list, 'C:/media/talk.mp4', 'vi')).toBeDefined()
      // No language asked for means "whatever is stored".
      expect(findAssetTranscript(list, 'C:/media/talk.mp4')).toBeDefined()
    })
  })

  describe('transcriptCuesForClip', () => {
    it('places media seconds on the timeline the clip sits at', () => {
      const cues = transcriptCuesForClip(transcript(), clip({ startTime: 100 }))
      expect(cues[0]).toEqual({ startTime: 100, endTime: 105, text: 'câu một' })
      expect(cues[2]).toEqual({ startTime: 110, endTime: 115, text: 'câu ba' })
    })

    /* The point of storing media seconds: a re-trim is a different window of
       the same transcript, not a reason to call Whisper again. */
    it('serves a re-trimmed clip from the transcript already on disk', () => {
      const cues = transcriptCuesForClip(transcript(), clip({ trimStart: 5, duration: 5, startTime: 0 }))
      expect(cues.map(cue => cue.text)).toEqual(['câu hai'])
      expect(cues[0]).toEqual({ startTime: 0, endTime: 5, text: 'câu hai' })
    })

    it('compresses the cues of a sped-up clip, which covers more recording', () => {
      const cues = transcriptCuesForClip(transcript(), clip({ speed: 2, duration: 7.5 }))
      expect(cues).toHaveLength(3)
      expect(cues[2].endTime).toBeCloseTo(7.5)
    })

    it('clips a sentence that straddles the edge instead of losing it', () => {
      const cues = transcriptCuesForClip(transcript(), clip({ trimStart: 2, duration: 5 }))
      expect(cues[0]).toEqual({ startTime: 0, endTime: 3, text: 'câu một' })
    })

    it('returns nothing when the media was never transcribed', () => {
      expect(transcriptCuesForClip(undefined, clip())).toEqual([])
    })
  })

  describe('timelineTranscriptCues', () => {
    it('walks every clip and returns the whole timeline in order', () => {
      const cues = timelineTranscriptCues(
        [transcript()],
        [
          clip({ id: 'b', startTime: 50, trimStart: 10, duration: 5 }),
          clip({ id: 'a', startTime: 0, trimStart: 0, duration: 5 }),
        ],
      )
      expect(cues.map(cue => cue.text)).toEqual(['câu một', 'câu ba'])
      expect(cues[0].startTime).toBeLessThan(cues[1].startTime)
    })
  })

  it('falls back to caption cues, which are already timeline seconds', () => {
    expect(subtitlesAsTranscriptCues([
      { id: 's1', text: 'ba chữ thôi', startTime: 1, endTime: 2, trackIndex: 0 },
    ])).toEqual([{ startTime: 1, endTime: 2, text: 'ba chữ thôi' }])
  })
})
