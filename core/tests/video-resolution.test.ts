import { describe, expect, it } from 'vitest'
import {
  TIMELINE_PRESETS,
  formatAspectRatio,
  getEffectiveTimelineDimensions,
} from '../src/video-resolution'

describe('video-resolution utilities', () => {
  describe('TIMELINE_PRESETS', () => {
    it('contains standard landscape, vertical, and square presets', () => {
      const ids = TIMELINE_PRESETS.map(p => p.id)
      expect(ids).toContain('16-9-1080p')
      expect(ids).toContain('9-16-1080p')
      expect(ids).toContain('1-1-1080p')
      expect(ids).toContain('4-5-1080p')

      const vertical1080p = TIMELINE_PRESETS.find(p => p.id === '9-16-1080p')!
      expect(vertical1080p.width).toBe(1080)
      expect(vertical1080p.height).toBe(1920)
      expect(vertical1080p.aspectRatioLabel).toBe('9:16')

      const square = TIMELINE_PRESETS.find(p => p.id === '1-1-1080p')!
      expect(square.width).toBe(1080)
      expect(square.height).toBe(1080)
      expect(square.aspectRatioLabel).toBe('1:1')
    })
  })

  describe('formatAspectRatio', () => {
    it('recognizes 16:9 landscape', () => {
      expect(formatAspectRatio(1920, 1080)).toBe('16:9')
      expect(formatAspectRatio(3840, 2160)).toBe('16:9')
      expect(formatAspectRatio(1280, 720)).toBe('16:9')
    })

    it('recognizes 9:16 vertical', () => {
      expect(formatAspectRatio(1080, 1920)).toBe('9:16')
      expect(formatAspectRatio(720, 1280)).toBe('9:16')
    })

    it('recognizes 1:1 square', () => {
      expect(formatAspectRatio(1080, 1080)).toBe('1:1')
      expect(formatAspectRatio(500, 500)).toBe('1:1')
    })

    it('recognizes 4:5 portrait', () => {
      expect(formatAspectRatio(1080, 1350)).toBe('4:5')
    })

    it('recognizes 21:9 ultrawide and 4:3 classic', () => {
      expect(formatAspectRatio(2560, 1080)).toBe('21:9')
      expect(formatAspectRatio(1440, 1080)).toBe('4:3')
    })

    it('falls back to reduced fraction or 16:9 when invalid', () => {
      expect(formatAspectRatio(800, 1200)).toBe('2:3')
      expect(formatAspectRatio(0, 0)).toBe('16:9')
    })
  })

  describe('getEffectiveTimelineDimensions', () => {
    it('uses timeline width, height, and fps when configured', () => {
      const timeline = { width: 1080, height: 1920, fps: 60 }
      const dims = getEffectiveTimelineDimensions(timeline, [])
      expect(dims.width).toBe(1080)
      expect(dims.height).toBe(1920)
      expect(dims.fps).toBe(60)
      expect(dims.aspectRatioLabel).toBe('9:16')
      expect(dims.aspectRatio).toBeCloseTo(9 / 16, 3)
      expect(dims.isDefault).toBe(false)
    })

    it('falls back to largest media asset for legacy timelines', () => {
      const timeline = { name: 'Old Timeline' }
      const assets = [
        { width: 1280, height: 720 },
        { width: 1080, height: 1920 }, // 2,073,600 px (larger than 921,600)
      ]
      const dims = getEffectiveTimelineDimensions(timeline, assets, 24)
      expect(dims.width).toBe(1080)
      expect(dims.height).toBe(1920)
      expect(dims.fps).toBe(24)
      expect(dims.aspectRatioLabel).toBe('9:16')
      expect(dims.isDefault).toBe(true)
    })

    it('defaults to 1080p 16:9 when no dimensions and no assets exist', () => {
      const dims = getEffectiveTimelineDimensions(null, null, 30)
      expect(dims.width).toBe(1920)
      expect(dims.height).toBe(1080)
      expect(dims.fps).toBe(30)
      expect(dims.aspectRatioLabel).toBe('16:9')
      expect(dims.isDefault).toBe(true)
    })
  })
})
