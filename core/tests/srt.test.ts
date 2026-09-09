import { describe, expect, it } from 'vitest'
import {
  parseSrt,
  exportSrt,
  chunkWordTimestamps,
  splitLongCue,
  chunkSrtCues,
  type WordTimestamp,
  type SrtCue,
} from '../src/srt'

describe('KE-901: SRT Parsing and Export', () => {
  it('parses standard SRT format correctly', () => {
    const srt = `1
00:00:01,000 --> 00:00:03,500
Hello world, this is a test.

2
00:00:04,100 --> 00:00:06,800
Second subtitle cue here.
`
    const cues = parseSrt(srt)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({
      index: 1,
      startTime: 1.0,
      endTime: 3.5,
      text: 'Hello world, this is a test.',
      color: undefined,
    })
    expect(cues[1]).toEqual({
      index: 2,
      startTime: 4.1,
      endTime: 6.8,
      text: 'Second subtitle cue here.',
      color: undefined,
    })
  })

  it('parses Premiere Pro SRT with font color tags', () => {
    const srt = `1
00:00:00,500 --> 00:00:02,000
<font color="#FFE600">Viral highlight text</font>
`
    const cues = parseSrt(srt)
    expect(cues).toHaveLength(1)
    expect(cues[0].text).toBe('Viral highlight text')
    expect(cues[0].color).toBe('#FFE600')
  })

  it('exports cues to well-formed SRT format', () => {
    const cues = [
      { startTime: 1.25, endTime: 3.5, text: 'First line' },
      { startTime: 4.0, endTime: 5.75, text: 'Second line' },
    ]
    const exported = exportSrt(cues)
    expect(exported).toContain('1\n00:00:01,250 --> 00:00:03,500\nFirst line')
    expect(exported).toContain('2\n00:00:04,000 --> 00:00:05,750\nSecond line')
  })
})

describe('KE-901: Smart Captions Chunking Algorithms', () => {
  const sampleWords: WordTimestamp[] = [
    { word: 'Hôm', start: 0.1, end: 0.3 },
    { word: 'nay', start: 0.35, end: 0.55 },
    { word: 'mình', start: 0.6, end: 0.8 },
    { word: 'sẽ', start: 0.85, end: 1.0 },
    { word: 'chia', start: 1.05, end: 1.25 },
    { word: 'sẻ', start: 1.3, end: 1.5 },
    { word: 'bí', start: 1.55, end: 1.75 },
    { word: 'quyết', start: 1.8, end: 2.1 },
    { word: 'làm', start: 2.15, end: 2.35 },
    { word: 'video', start: 2.4, end: 2.8 },
    { word: 'triệu', start: 2.85, end: 3.1 },
    { word: 'view!', start: 3.15, end: 3.6 },
  ]

  it('chunks word timestamps into 3-5 word cues based on maxWords limit', () => {
    const cues = chunkWordTimestamps(sampleWords, {
      minWords: 3,
      maxWords: 4,
      maxChars: 30,
    })

    expect(cues.length).toBeGreaterThanOrEqual(3)
    for (const cue of cues) {
      const wordCount = cue.text.split(' ').length
      expect(wordCount).toBeGreaterThanOrEqual(1)
      expect(wordCount).toBeLessThanOrEqual(4)
      expect(cue.endTime).toBeGreaterThan(cue.startTime)
    }

    expect(cues[0].text).toBe('Hôm nay mình sẽ')
    expect(cues[0].startTime).toBe(0.1)
    expect(cues[0].endTime).toBe(1.0)
  })

  it('splits early when encountering natural punctuation breaks', () => {
    const wordsWithPunct: WordTimestamp[] = [
      { word: 'Chào', start: 0.0, end: 0.3 },
      { word: 'các', start: 0.35, end: 0.55 },
      { word: 'bạn,', start: 0.6, end: 0.85 },
      { word: 'đây', start: 0.9, end: 1.1 },
      { word: 'là', start: 1.15, end: 1.3 },
      { word: 'tính', start: 1.35, end: 1.5 },
      { word: 'năng', start: 1.55, end: 1.75 },
      { word: 'mới.', start: 1.8, end: 2.1 },
    ]

    const cues = chunkWordTimestamps(wordsWithPunct, {
      minWords: 3,
      maxWords: 5,
    })

    expect(cues).toHaveLength(2)
    expect(cues[0].text).toBe('Chào các bạn,')
    expect(cues[0].startTime).toBe(0.0)
    expect(cues[0].endTime).toBe(0.85)

    expect(cues[1].text).toBe('đây là tính năng mới.')
    expect(cues[1].startTime).toBe(0.9)
    expect(cues[1].endTime).toBe(2.1)
  })

  it('splits early when detecting speech silence pauses exceeding pauseThresholdSec', () => {
    const wordsWithPause: WordTimestamp[] = [
      { word: 'Một', start: 0.0, end: 0.3 },
      { word: 'hai', start: 0.35, end: 0.6 },
      { word: 'ba', start: 0.65, end: 0.9 },
      { word: 'bốn', start: 1.6, end: 1.9 },
      { word: 'năm', start: 1.95, end: 2.2 },
      { word: 'sáu', start: 2.25, end: 2.5 },
    ]

    const cues = chunkWordTimestamps(wordsWithPause, {
      minWords: 3,
      maxWords: 5,
      pauseThresholdSec: 0.35,
    })

    expect(cues).toHaveLength(2)
    expect(cues[0].text).toBe('Một hai ba')
    expect(cues[0].endTime).toBe(0.9)
    expect(cues[1].text).toBe('bốn năm sáu')
    expect(cues[1].startTime).toBe(1.6)
  })

  it('splits long SrtCue proportionally using splitLongCue', () => {
    const longCue: SrtCue = {
      index: 1,
      startTime: 10.0,
      endTime: 20.0,
      text: 'Đây là một câu rất dài gồm nhiều từ liên tiếp mà người dùng import từ file phụ đề thông thường.',
    }

    const chunked = splitLongCue(longCue, {
      minWords: 3,
      maxWords: 5,
      maxChars: 25,
    })

    expect(chunked.length).toBeGreaterThan(1)
    expect(chunked[0].startTime).toBe(10.0)
    expect(chunked[chunked.length - 1].endTime).toBe(20.0)

    for (let i = 0; i < chunked.length - 1; i++) {
      expect(chunked[i].endTime).toBeCloseTo(chunked[i + 1].startTime, 2)
    }
  })

  it('chunks array of existing SrtCues using chunkSrtCues', () => {
    const cues: SrtCue[] = [
      {
        index: 1,
        startTime: 0,
        endTime: 4,
        text: 'Ngắn gọn',
      },
      {
        index: 2,
        startTime: 5,
        endTime: 15,
        text: 'Một câu dài hơn bình thường rất nhiều từ cần phải được chia thành các cụm ngắn.',
      },
    ]

    const chunked = chunkSrtCues(cues, {
      minWords: 3,
      maxWords: 4,
    })

    expect(chunked.length).toBeGreaterThan(2)
    expect(chunked[0].text).toBe('Ngắn gọn')
    expect(chunked.map(c => c.index)).toEqual(chunked.map((_, i) => i + 1))
  })
})

