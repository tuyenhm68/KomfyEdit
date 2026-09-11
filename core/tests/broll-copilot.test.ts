import { describe, it, expect } from 'vitest'
import {
  extractKeywords,
  detectBrollOpportunities,
  selectBaseFootageTrackIndex,
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

    /*
     * Updated premise: this used to pass the overlay clip alone, relying on
     * "track > 0 means overlay". A real project disproved that — the main
     * video was itself on track 1 — so the timeline now includes the footage
     * the overlay sits above, which is what the panel always passes anyway.
     */
    it('does not suggest B-roll if an overlay clip is already present above the footage', () => {
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

      // The main footage, on track 0, running the whole 9 seconds.
      const mainFootage = {
        id: 'clip-main', type: 'video', startTime: 0, duration: 9,
        trimStart: 0, trimEnd: 0, trackIndex: 0, speed: 1,
      } as TimelineClip

      // Existing B-roll clip covering [1.5, 7.5] on track 1 (overlay)
      const existingClips: TimelineClip[] = [
        mainFootage,
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

/**
 * Both reasons a solid stretch of talking reported "nothing to do".
 *
 * Each was reproduced against the real detector before being fixed: a video
 * with detached audio went from 11 suggestions to 0, and a sentence-level
 * transcript with ordinary breathing pauses did the same.
 */
describe('a talking-head video that the scan used to find nothing in', () => {
  const speech: SubtitleClip[] = Array.from({ length: 16 }, (_, i) => ({
    id: `s${i}`,
    text: `Câu số ${i} nói về chủ đề kinh doanh và tăng trưởng doanh thu.`,
    startTime: i * 5,
    endTime: i * 5 + 4.8,
    trackIndex: 0,
  }))

  const clip = (over: Partial<TimelineClip>): TimelineClip => ({
    id: 'c', type: 'video', startTime: 0, duration: 80,
    trimStart: 0, trimEnd: 0, trackIndex: 0, speed: 1,
    ...over,
  } as TimelineClip)

  const video = clip({})

  /*
   * Reproduced from a real project: a 55.6 s video sitting on track 1, with a
   * subtitle track below it holding index 0. Every candidate slot looked
   * occupied by "an overlay" that was in fact the video being edited, and the
   * scan reported nothing to do on 53 seconds of solid speech.
   */
  it('does not mistake the main video for an overlay when it is not on track 0', () => {
    const onTrackOne = clip({ id: 'main', trackIndex: 1 })
    expect(detectBrollOpportunities({ subtitles: speech, existingClips: [onTrackOne] }).length)
      .toBeGreaterThan(0)
  })

  it('picks the track carrying the most footage as the base, not the lowest index', () => {
    const main = clip({ id: 'main', trackIndex: 3, duration: 80 })
    const shortOverlay = clip({ id: 'ov', trackIndex: 0, startTime: 10, duration: 6 })

    expect(selectBaseFootageTrackIndex([main, shortOverlay])).toBe(3)

    // The main clip does not block anything; the six seconds of overlay do.
    const opps = detectBrollOpportunities({ subtitles: speech, existingClips: [main, shortOverlay] })
    expect(opps.length).toBeGreaterThan(0)
    expect(opps.some(o => o.startTime < 16 && o.endTime > 10)).toBe(false)
  })

  it('does not treat the audio track as footage already covering the picture', () => {
    const audio = clip({ id: 'a1', type: 'audio', trackIndex: 1 })
    const withAudio = detectBrollOpportunities({ subtitles: speech, existingClips: [video, audio] })
    const withoutAudio = detectBrollOpportunities({ subtitles: speech, existingClips: [video] })

    expect(withoutAudio.length).toBeGreaterThan(0)
    expect(withAudio.length).toBe(withoutAudio.length)
  })

  it('still refuses a slot that real B-roll footage already covers', () => {
    const broll = clip({ id: 'b1', type: 'video', trackIndex: 1, startTime: 0, duration: 80 })
    // Main footage is 80 s on track 0, so track 1 is unambiguously the overlay.
    expect(detectBrollOpportunities({ subtitles: speech, existingClips: [video, broll] })).toEqual([])
  })

  it('lets B-roll be suggested under a caption or sticker', () => {
    const text = clip({ id: 't1', type: 'text', trackIndex: 2, startTime: 0, duration: 80 })
    expect(detectBrollOpportunities({ subtitles: speech, existingClips: [video, text] }).length)
      .toBeGreaterThan(0)
  })

  it('keeps a stretch of speech together across the pause between sentences', () => {
    // 1.7s apart: a breath, not a change of subject. Each line alone is 4.8s,
    // under the five-second minimum, so splitting here finds nothing at all.
    const breathing = speech.map((cue, i) => ({
      ...cue, startTime: i * 6.5, endTime: i * 6.5 + 4.8,
    }))
    expect(detectBrollOpportunities({ subtitles: breathing, existingClips: [video] }).length)
      .toBeGreaterThan(0)
  })

  it('still breaks the block on a silence long enough to be a real pause', () => {
    const twoHalves: SubtitleClip[] = [
      { id: 'a', text: 'nửa đầu rất ngắn', startTime: 0, endTime: 3, trackIndex: 0 },
      { id: 'b', text: 'nửa sau cũng ngắn', startTime: 12, endTime: 15, trackIndex: 0 },
    ]
    expect(detectBrollOpportunities({ subtitles: twoHalves, existingClips: [video] })).toEqual([])
  })
})
})
