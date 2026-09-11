import { makeId } from './id-generator'
import type { EditPatch } from './edit-patch'
import type { TimelineClip } from './project-model'

export interface HighlightCandidate {
  id: string
  title: string
  startTime: number
  endTime: number
  duration: number
  hookText: string
  hookPreset?: string
  viralScore: number // 1 - 100
  reason: string
  quoteSnippet: string
  coldOpenRange?: { startTime: number; endTime: number }
}

export const HIGHLIGHT_SYSTEM_INSTRUCTION = `Bạn là chuyên gia biên tập video ngắn viral (Shorts, TikTok, Reels) từ các video dài (podcast, phỏng vấn, vlog, bài giảng).
Nhiệm vụ của bạn là phân tích transcript kèm mốc thời gian và tìm ra từ 3 đến 5 đoạn highlight tiềm năng nhất (thời lượng 30s đến 60s).

Tiêu chí đánh giá đoạn Highlight có tính Viral cao:
1. Câu mở đầu (Hook) gây tò mò, giật mình hoặc thách thức quan niệm thông thường.
2. Ý kiến trái chiều, tranh luận gay gắt hoặc chia sẻ bài học đắt giá.
3. Chứa con số, số liệu hoặc kết quả bất ngờ.
4. Phát ngôn sắc bén, súc tích, dễ trích dẫn (quotable).
5. Trọn vẹn về mặt ngữ nghĩa (không bị đứt mạch câu ở đầu hoặc cuối).

Tối ưu Hook 3 giây đầu:
- Đặt ra một câu Hook ngắn (dưới 10 từ) để làm Title Card đè lên 3 giây đầu video.
- Đề xuất preset chữ phù hợp (ví dụ: 'headline-alert', 'bold-punch', 'tiktok-classic').`

/** One spoken line with the timeline seconds it occupies. */
export interface HighlightTranscriptCue {
  startTime: number
  endTime: number
  text: string
}

/**
 * Renders cues as the timestamped transcript the highlight prompt expects.
 *
 * The timestamps are the only thing tying the model's answer to the recording:
 * every range it returns is read straight back as timeline seconds, so a cue
 * list that is out of order or carries blank lines produces ranges that point
 * at the wrong part of the video. Callers pass timeline seconds — a clip
 * transcribed on its own yields media seconds and has to be mapped first.
 */
export function formatTranscriptForHighlights(cues: HighlightTranscriptCue[]): string {
  return cues
    .filter(cue => cue.text.trim().length > 0)
    .slice()
    .sort((left, right) => left.startTime - right.startTime)
    .map(cue => `[${cue.startTime.toFixed(1)}s - ${cue.endTime.toFixed(1)}s]: ${cue.text.trim()}`)
    .join('\n')
}

export function buildHighlightExtractionPrompt(transcriptText: string, maxItems: number = 4): string {
  return `Dưới đây là nội dung transcript của video kèm thời gian. Hãy tìm tối đa ${maxItems} đoạn highlight viral nhất (thời lượng mỗi đoạn lý tưởng từ 25s đến 60s).

Bắt buộc trả về kết quả dưới định dạng JSON hợp lệ duy nhất, theo cấu trúc sau (không kèm markdown ngoài khối json):
{
  "highlights": [
    {
      "title": "Tiêu đề ngắn gọn về nội dung highlight",
      "startTime": 12.5,
      "endTime": 48.0,
      "hookText": "Câu tít hook ngắn dưới 10 từ",
      "hookPreset": "headline-alert",
      "viralScore": 92,
      "reason": "Lý do vì sao đoạn này giữ chân người xem cao",
      "quoteSnippet": "Trích dẫn 1-2 câu tiêu biểu trong đoạn"
    }
  ]
}

Nội dung Transcript:
${transcriptText}
`
}

/**
 * Parses raw JSON string returned by LLM (handles optional markdown fences).
 */
/**
 * Digs the JSON object out of a reply that may be wrapped in anything.
 *
 * An API call asked for `json_object` gets bare JSON; a CLI asked the same
 * question answers like a person — a line of preamble, a fenced block, maybe a
 * closing remark. Both have to parse, so this takes the fence when there is
 * one and otherwise scans for the first balanced `{…}`, tracking strings so a
 * brace inside a quote does not end the object early.
 */
export function extractJsonObject(rawText: string): string {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const text = fenced ? fenced[1] : rawText

  const start = text.indexOf('{')
  if (start === -1) return text.trim()

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (char === '"') { inString = !inString; continue }
    if (inString) continue
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start).trim()
}

export function parseHighlightResponse(rawText: string): HighlightCandidate[] {
  try {
    const clean = extractJsonObject(rawText)
    const data = JSON.parse(clean)
    const list = Array.isArray(data) ? data : data?.highlights
    if (!Array.isArray(list)) return []

    return list.map((item: any, idx: number): HighlightCandidate => {
      const start = typeof item.startTime === 'number' ? Math.max(0, item.startTime) : 0
      const end = typeof item.endTime === 'number' ? Math.max(start + 1, item.endTime) : start + 30
      const duration = Number((end - start).toFixed(2))

      return {
        id: item.id || makeId('hl'),
        title: String(item.title || `Highlight #${idx + 1}`),
        startTime: start,
        endTime: end,
        duration,
        hookText: String(item.hookText || item.title || 'Khoảnh khắc đáng chú ý!'),
        hookPreset: item.hookPreset || 'headline-alert',
        viralScore: typeof item.viralScore === 'number' ? Math.min(100, Math.max(1, item.viralScore)) : 85,
        reason: String(item.reason || 'Đoạn nói chuyện có nhịp cao trào'),
        quoteSnippet: String(item.quoteSnippet || ''),
        ...(item.coldOpenRange ? { coldOpenRange: item.coldOpenRange } : {}),
      }
    })
  } catch (err) {
    return []
  }
}

/**
 * Builds an EditPatch to isolate a highlight interval into a punchy short,
 * placing a 3-second Hook title card at the beginning.
 */
export function buildHighlightEditPatch(
  candidate: HighlightCandidate,
  sourceClip: TimelineClip,
  options?: {
    hookDuration?: number
    targetDimensions?: { width: number; height: number }
  },
): EditPatch {
  const hookDuration = options?.hookDuration ?? 3.0
  const dims = options?.targetDimensions ?? { width: 1080, height: 1920 } // 9:16 vertical standard

  return {
    version: 1,
    description: `Tạo đoạn Short 9:16 cho highlight "${candidate.title}" kèm Hook 3s`,
    operations: [
      {
        op: 'create_highlight_short',
        sourceClipId: sourceClip.id,
        startTime: candidate.startTime,
        endTime: candidate.endTime,
        hookText: candidate.hookText,
        hookPreset: candidate.hookPreset || 'headline-alert',
        hookDuration,
        targetDimensions: dims,
      },
    ],
  }
}
