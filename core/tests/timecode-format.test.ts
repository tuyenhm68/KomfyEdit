import { describe, it, expect } from 'vitest'
import { formatTime, parseTime, formatRulerTime } from '../src/video-editor-utils'

describe('timecode formatting and parsing (KE-101)', () => {
  it('formats timecode in standard 24fps HH:MM:SS:FF', () => {
    expect(formatTime(0, 24, 'timecode')).toBe('00:00:00:00')
    expect(formatTime(1, 24, 'timecode')).toBe('00:00:01:00')
    expect(formatTime(1.5, 24, 'timecode')).toBe('00:00:01:12')
    expect(formatTime(3661.25, 24, 'timecode')).toBe('01:01:01:06')
  })

  it('formats timecode in 30fps and 60fps', () => {
    expect(formatTime(1.5, 30, 'timecode')).toBe('00:00:01:15')
    expect(formatTime(1.5, 60, 'timecode')).toBe('00:00:01:30')
  })

  it('formats frame count when format is "frames"', () => {
    expect(formatTime(0, 30, 'frames')).toBe('0')
    expect(formatTime(1, 30, 'frames')).toBe('30')
    expect(formatTime(2.5, 24, 'frames')).toBe('60')
    expect(formatTime(1.5, 60, 'frames')).toBe('90')
  })

  it('formats ruler time in timecode format', () => {
    expect(formatRulerTime(0)).toBe('00:00')
    expect(formatRulerTime(65)).toBe('01:05')
    expect(formatRulerTime(3665)).toBe('1:01:05')
    expect(formatRulerTime(1.5, true)).toBe('00:01.5')
  })

  it('formats ruler time in frames format', () => {
    expect(formatRulerTime(0, false, 30, 'frames')).toBe('0')
    expect(formatRulerTime(2, false, 30, 'frames')).toBe('60')
    expect(formatRulerTime(3.5, false, 24, 'frames')).toBe('84')
  })

  it('parses standard timecode strings', () => {
    expect(parseTime('00:00:01:12', 24)).toBeCloseTo(1.5, 4)
    expect(parseTime('01:00:00:00', 30)).toBe(3600)
    expect(parseTime('00:01:00:00', 24)).toBe(60)
    expect(parseTime('01:00', 24)).toBe(60)
    expect(parseTime('15', 24)).toBe(15)
  })

  it('parses frame counts with or without f suffix', () => {
    expect(parseTime('60f', 30)).toBeCloseTo(2.0, 4)
    expect(parseTime('48f', 24)).toBeCloseTo(2.0, 4)
    expect(parseTime('90', 30, 'frames')).toBeCloseTo(3.0, 4)
  })

  it('handles invalid timecode inputs gracefully', () => {
    expect(parseTime('invalid')).toBeNull()
    expect(parseTime('')).toBeNull()
  })
})
