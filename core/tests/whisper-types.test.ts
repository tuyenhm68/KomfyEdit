import { describe, it, expect } from 'vitest'
import { whisperSegmentsToSrtCues, type WhisperSegment } from '../src/whisper-types'

describe('whisperSegmentsToSrtCues', () => {
  it('converts segments into SrtCues with 1-based indexing', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 1.2, end: 3.4, text: ' Xin chào các bạn ' },
      { id: 1, start: 3.5, end: 5.1, text: 'Hôm nay chúng ta làm video' },
    ]

    const cues = whisperSegmentsToSrtCues(segments)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({
      index: 1,
      startTime: 1.2,
      endTime: 3.4,
      text: 'Xin chào các bạn',
    })
    expect(cues[1]).toEqual({
      index: 2,
      startTime: 3.5,
      endTime: 5.1,
      text: 'Hôm nay chúng ta làm video',
    })
  })

  it('applies timeOffset correctly for timeline clips', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0.5, end: 2.0, text: 'Phụ đề clip sau' },
    ]

    const cues = whisperSegmentsToSrtCues(segments, 10.0)
    expect(cues).toHaveLength(1)
    expect(cues[0].startTime).toBe(10.5)
    expect(cues[0].endTime).toBe(12.0)
    expect(cues[0].text).toBe('Phụ đề clip sau')
  })

  it('filters out empty text and zero duration cues', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0.0, end: 1.0, text: '   ' },
      { id: 1, start: 2.0, end: 2.0, text: 'Không có thời lượng' },
      { id: 2, start: 2.0, end: 1.0, text: 'Thời lượng âm' },
      { id: 3, start: 3.0, end: 4.5, text: 'Hợp lệ' },
    ]

    const cues = whisperSegmentsToSrtCues(segments)
    expect(cues).toHaveLength(1)
    expect(cues[0].text).toBe('Hợp lệ')
    expect(cues[0].startTime).toBe(3.0)
    expect(cues[0].endTime).toBe(4.5)
  })
})
