import { describe, it, expect } from 'vitest'
import {
  buildHighlightExtractionPrompt,
  parseHighlightResponse,
  buildHighlightEditPatch,
  type HighlightCandidate,
} from '../src/auto-highlight'
import type { TimelineClip } from '../src/project-model'

describe('auto-highlight', () => {
  it('builds prompt correctly with maxItems', () => {
    const transcript = '[0.0s - 10.0s] Chào mọi người\n[10.0s - 30.0s] Đây là bí quyết thành công...'
    const prompt = buildHighlightExtractionPrompt(transcript, 3)

    expect(prompt).toContain('tối đa 3 đoạn highlight')
    expect(prompt).toContain(transcript)
    expect(prompt).toContain('"highlights"')
  })

  it('parses valid JSON highlight response', () => {
    const rawJson = JSON.stringify({
      highlights: [
        {
          id: 'hl-1',
          title: 'Bài học đắt giá',
          startTime: 12.5,
          endTime: 45.0,
          hookText: 'Sai lầm 90% người mắc phải!',
          hookPreset: 'headline-alert',
          viralScore: 95,
          reason: 'Nội dung gây sốc và lôi cuốn',
          quoteSnippet: 'Đừng bao giờ làm điều này...',
        },
      ],
    })

    const parsed = parseHighlightResponse(rawJson)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('Bài học đắt giá')
    expect(parsed[0].duration).toBe(32.5)
    expect(parsed[0].viralScore).toBe(95)
    expect(parsed[0].hookText).toBe('Sai lầm 90% người mắc phải!')
  })

  it('parses markdown code-fenced JSON cleanly', () => {
    const fenced = `
\`\`\`json
{
  "highlights": [
    {
      "title": "Khoảnh khắc hài hước",
      "startTime": 5.0,
      "endTime": 35.0,
      "hookText": "Ai ngờ lại xảy ra chuyện này",
      "viralScore": 88
    }
  ]
}
\`\`\`
`
    const parsed = parseHighlightResponse(fenced)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].title).toBe('Khoảnh khắc hài hước')
    expect(parsed[0].startTime).toBe(5.0)
    expect(parsed[0].endTime).toBe(35.0)
    expect(parsed[0].duration).toBe(30.0)
  })

  it('returns empty array on invalid JSON input', () => {
    const invalid = 'Xin lỗi, tôi không thể tìm thấy đoạn nào phù hợp.'
    const parsed = parseHighlightResponse(invalid)
    expect(parsed).toEqual([])
  })

  it('builds highlight edit patch properly', () => {
    const candidate: HighlightCandidate = {
      id: 'hl-test',
      title: 'Đoạn đỉnh cao',
      startTime: 10.0,
      endTime: 40.0,
      duration: 30.0,
      hookText: 'Bí mật được hé lộ!',
      hookPreset: 'bold-punch',
      viralScore: 92,
      reason: 'Thu hút',
      quoteSnippet: 'abc',
    }

    const dummyClip = {
      id: 'clip-v1',
      assetId: 'asset-1',
      startTime: 0,
      duration: 120,
      trimStart: 0,
      trimEnd: 120,
      speed: 1,
      reversed: false,
      muted: false,
      volume: 1,
      trackIndex: 0,
      type: 'video',
      flipH: false,
      flipV: false,
      transitionIn: { type: 'none', duration: 0 },
      transitionOut: { type: 'none', duration: 0 },
      colorCorrection: {},
      transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0 },
      opacity: 100,
    } as unknown as TimelineClip

    const patch = buildHighlightEditPatch(candidate, dummyClip)
    expect(patch.version).toBe(1)
    expect(patch.operations).toHaveLength(1)
    expect(patch.operations[0].op).toBe('create_highlight_short')

    const op = patch.operations[0] as any
    expect(op.sourceClipId).toBe('clip-v1')
    expect(op.startTime).toBe(10.0)
    expect(op.endTime).toBe(40.0)
    expect(op.hookText).toBe('Bí mật được hé lộ!')
    expect(op.hookPreset).toBe('bold-punch')
    expect(op.targetDimensions).toEqual({ width: 1080, height: 1920 })
  })
})
