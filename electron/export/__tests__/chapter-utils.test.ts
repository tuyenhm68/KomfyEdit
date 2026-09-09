import { describe, it, expect } from 'vitest'
import { formatSupportsChapters, generateFfmetadataChapters } from '../chapter-utils'

describe('chapter-utils', () => {
  describe('formatSupportsChapters', () => {
    it('returns true for formats that support embedded chapters', () => {
      expect(formatSupportsChapters('/output/video.mp4')).toBe(true)
      expect(formatSupportsChapters('/output/video.mkv')).toBe(true)
      expect(formatSupportsChapters('/output/video.mov')).toBe(true)
      expect(formatSupportsChapters('/output/video.webm')).toBe(true)
      expect(formatSupportsChapters('/output/video.m4v')).toBe(true)
      expect(formatSupportsChapters('C:\\\\Users\\\\test\\\\video.MP4')).toBe(true)
    })

    it('returns false for formats that do not support embedded chapters', () => {
      expect(formatSupportsChapters('/output/video.avi')).toBe(false)
      expect(formatSupportsChapters('/output/video.flv')).toBe(false)
      expect(formatSupportsChapters('/output/audio.mp3')).toBe(false)
      expect(formatSupportsChapters('/output/audio.wav')).toBe(false)
    })
  })

  describe('generateFfmetadataChapters', () => {
    it('returns empty string if markers is empty', () => {
      expect(generateFfmetadataChapters([], 60)).toBe('')
    })

    it('generates intro chapter if first marker starts after 500ms', () => {
      const markers = [
        { id: 'm1', time: 5, label: 'Section 1', color: '#10B981' },
      ]
      const meta = generateFfmetadataChapters(markers, 30)

      expect(meta).toContain(';FFMETADATA1')
      expect(meta).toContain('[CHAPTER]')
      expect(meta).toContain('START=0')
      expect(meta).toContain('END=5000')
      expect(meta).toContain('title=Intro')
      expect(meta).toContain('START=5000')
      expect(meta).toContain('END=30000')
      expect(meta).toContain('title=Section 1')
    })

    it('does not generate intro chapter if first marker starts at 0', () => {
      const markers = [
        { id: 'm1', time: 0, label: 'Start', color: '#3B82F6' },
        { id: 'm2', time: 10, label: 'Middle', color: '#F59E0B' },
      ]
      const meta = generateFfmetadataChapters(markers, 20)

      expect(meta).not.toContain('title=Intro')
      expect(meta).toContain('START=0')
      expect(meta).toContain('END=10000')
      expect(meta).toContain('title=Start')
      expect(meta).toContain('START=10000')
      expect(meta).toContain('END=20000')
      expect(meta).toContain('title=Middle')
    })

    it('escapes special characters in chapter titles', () => {
      const markers = [
        { id: 'm1', time: 0, label: 'Part 1: Intro; Section=A #1 \\ Special', color: '#3B82F6' },
      ]
      const meta = generateFfmetadataChapters(markers, 10)

      expect(meta).toContain('title=Part 1: Intro\\; Section\\=A \\#1 \\\\ Special')
    })

    it('sorts markers chronologically regardless of input order', () => {
      const markers = [
        { id: 'm2', time: 15, label: 'Second' },
        { id: 'm1', time: 5, label: 'First' },
      ]
      const meta = generateFfmetadataChapters(markers, 30)

      const firstIndex = meta.indexOf('title=First')
      const secondIndex = meta.indexOf('title=Second')
      expect(firstIndex).toBeGreaterThan(-1)
      expect(secondIndex).toBeGreaterThan(firstIndex)
    })
  })
})
