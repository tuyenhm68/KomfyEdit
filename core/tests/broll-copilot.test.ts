import { describe, it, expect } from 'vitest'
import {
  extractKeywords,
  detectBrollOpportunities,
} from '../src/broll-copilot'
import type { SubtitleClip, TimelineClip } from '../src/project-model'

describe('KE-904: B-roll Copilot Core Logic', () => {
  describe('extractKeywords', () => {
    it('extracts top keywords and excludes common Vietnamese and English stop words', () => {
      const text = 'Hôm nay tôi sẽ hướng dẫn các bạn cách thiết kế giao diện ứng dụng di động thật đẹp và chuyên nghiệp'
      const keywords = extractKeywords(text, 5)

      expect(keywords).toContain('thiết')
      expect(keywords).toContain('kế')
      expect(keywords).toContain('giao')
      expect(keywords).toContain('diện')
      expect(keywords).not.toContain('hôm')
      expect(keywords).not.toContain('tôi')
      expect(keywords).not.toContain('sẽ')
      expect(keywords).not.toContain('các')
      expect(keywords).not.toContain('bạn')
    })

    it('handles empty or punctuation-only text gracefully', () => {
      expect(extractKeywords('')).toEqual([])
      expect(extractKeywords('   ')).toEqual([])
      expect(extractKeywords('...,,,!???')).toEqual([])
    })

    it('extracts english keywords correctly', () => {
      const text = 'This tutorial shows how to edit video like a pro using automated tools'
      const keywords = extractKeywords(text, 4)
      expect(keywords).toContain('tutorial')
      expect(keywords).toContain('edit')
      expect(keywords).toContain('video')
      expect(keywords).not.toContain('this')
      expect(keywords).not.toContain('how')
    })
  })

  describe('detectBrollOpportunities', () => {
    it('detects B-roll slots in continuous talking head stretches (>5s)', () => {
      const subtitles: SubtitleClip[] = [
        {
          id: 'sub-1',
          startTime: 0.5,
          endTime: 3.5,
          text: 'Xin chào các bạn đã quay trở lại kênh của mình',
          trackIndex: 1,
        },
        {
          id: 'sub-2',
          startTime: 3.8,
          endTime: 7.0,
          text: 'Hôm nay chúng ta sẽ cùng tìm hiểu về quy trình sản xuất video bằng trí tuệ nhân tạo',
          trackIndex: 1,
        },
        {
          id: 'sub-3',
          startTime: 7.2,
          endTime: 10.5,
          text: 'Giúp các bạn tiết kiệm hàng giờ đồng hồ mỗi ngày',
          trackIndex: 1,
        },
      ]

      const opportunities = detectBrollOpportunities({
        subtitles,
        minDuration: 5.0,
      })

      expect(opportunities.length).toBeGreaterThanOrEqual(1)
      const first = opportunities[0]
      expect(first.startTime).toBeGreaterThanOrEqual(1.0)
      expect(first.duration).toBeGreaterThanOrEqual(3.0)
      expect(first.keywords.length).toBeGreaterThan(0)
      expect(first.suggestedPrompt).toContain('B-roll minh hoạ')
    })

    it('does not suggest B-roll if an overlay clip is already present on track > 0', () => {
      const subtitles: SubtitleClip[] = [
        {
          id: 'sub-1',
          startTime: 0,
          endTime: 4.0,
          text: 'Đoạn nói đầu tiên giới thiệu nội dung',
          trackIndex: 1,
        },
        {
          id: 'sub-2',
          startTime: 4.2,
          endTime: 9.0,
          text: 'Đoạn nói tiếp theo rất dài về sản phẩm công nghệ mới',
          trackIndex: 1,
        },
      ]

      // Existing B-roll clip covering [1.5, 7.5] on track 1 (overlay)
      const existingClips: TimelineClip[] = [
        {
          id: 'clip-existing-broll',
          assetId: 'asset-1',
          type: 'video',
          startTime: 1.5,
          duration: 6.0,
          trimStart: 0,
          trimEnd: 0,
          speed: 1,
          reversed: false,
          muted: true,
          volume: 0,
          trackIndex: 1,
          asset: null,
          flipH: false,
          flipV: false,
          transitionIn: { type: 'none', duration: 0 },
          transitionOut: { type: 'none', duration: 0 },
          colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
          transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
          opacity: 100,
        },
      ]

      const opportunities = detectBrollOpportunities({
        subtitles,
        existingClips,
        minDuration: 5.0,
      })

      // The interval [0, 9] already has B-roll covering [1.5, 7.5], so no new opportunity should be created
      expect(opportunities.length).toBe(0)
    })

    it('returns empty array when subtitles list is empty', () => {
      const opportunities = detectBrollOpportunities({
        subtitles: [],
        minDuration: 5.0,
      })
      expect(opportunities).toEqual([])
    })
  })
})
