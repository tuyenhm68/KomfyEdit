import { makeId } from './id-generator'
import type { SubtitleClip, TimelineClip } from './project-model'

export interface BrollOpportunity {
  id: string
  startTime: number
  endTime: number
  duration: number
  contextText: string
  keywords: string[]
  suggestedPrompt: string
}

export interface DetectBrollParams {
  subtitles?: SubtitleClip[]
  existingClips?: TimelineClip[]
  timelineDuration?: number
  minDuration?: number // default 5.0 seconds
  maxDuration?: number // default 8.0 seconds
  sceneCutPoints?: number[] // known scene change timestamps
}

// Common stop words in Vietnamese and English to filter out from keyword extraction
const STOP_WORDS = new Set([
  // Vietnamese stop words
  'là', 'và', 'của', 'có', 'trong', 'được', 'cho', 'với', 'không', 'các', 'những',
  'đã', 'này', 'khi', 'đó', 'thì', 'ở', 'để', 'một', 'người', 'nhưng', 'về', 'nhiều',
  'lại', 'ra', 'vào', 'lên', 'xuống', 'từ', 'rồi', 'sẽ', 'cũng', 'như', 'bị', 'bởi',
  'rất', 'quá', 'hơn', 'đến', 'nếu', 'ai', 'gì', 'sao', 'nào', 'đâu', 'thế',
  'tôi', 'bạn', 'mình', 'chúng', 'ta', 'em', 'anh', 'chị', 'họ', 'nó', 'việc', 'cái',
  'điều', 'sự', 'lúc', 'ngày', 'giờ', 'năm', 'thấy', 'biết', 'nghĩ', 'nói', 'làm',
  'hôm', 'nay', 'cách', 'thật', 'qua', 'hay', 'hãy', 'cùng', 'kênh', 'xin', 'chào', 'hướng', 'dẫn',
  // English stop words
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not',
  'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from',
  'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would',
  'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which',
  'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
  'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see',
  'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
  'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
  'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
])

function getSubEnd(s: SubtitleClip): number {
  if (typeof s.endTime === 'number') return s.endTime
  if (typeof (s as any).duration === 'number') return s.startTime + (s as any).duration
  return s.startTime
}

/**
 * Extracts key noun/topic keywords from speech text by removing punctuation,
 * numbers, and common stop words.
 */
export function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  if (!text || !text.trim()) return []

  const words = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’“”]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))

  // Frequency counting
  const freq = new Map<string, number>()
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1)
  }

  // Sort by frequency descending, then preserve unique
  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)

  return sorted.slice(0, maxKeywords)
}

/**
 * Detects opportunities where B-roll should be inserted to break visual monotony.
 *
 * Scans continuous talking intervals (> 5s by default) that don't already have
 * an overlay clip or a scene change.
 */
export function detectBrollOpportunities(params: DetectBrollParams): BrollOpportunity[] {
  const {
    subtitles = [],
    existingClips = [],
    minDuration = 5.0,
    maxDuration = 8.0,
    sceneCutPoints = [],
  } = params

  if (!subtitles || subtitles.length === 0) {
    return []
  }

  // Sorted subtitles
  const sortedSubs = [...subtitles].sort((a, b) => a.startTime - b.startTime)

  // Identify existing B-roll / overlay intervals (clips on trackIndex > 0)
  const overlayIntervals: Array<{ start: number; end: number }> = existingClips
    .filter(c => c.trackIndex > 0)
    .map(c => ({ start: c.startTime, end: c.startTime + c.duration }))

  // Check if a range overlaps with existing B-roll
  const overlapsExistingBroll = (start: number, end: number): boolean => {
    return overlayIntervals.some(
      interval => Math.max(start, interval.start) < Math.min(end, interval.end),
    )
  }

  // Check if a range crosses a known scene cut point
  const crossesSceneCut = (start: number, end: number): boolean => {
    return sceneCutPoints.some(cut => cut > start + 0.5 && cut < end - 0.5)
  }

  const opportunities: BrollOpportunity[] = []

  // Group consecutive subtitle cues that form talking blocks with gaps < 1.0s
  let currentBlock: SubtitleClip[] = []
  const blocks: SubtitleClip[][] = []

  for (let i = 0; i < sortedSubs.length; i++) {
    const sub = sortedSubs[i]
    if (currentBlock.length === 0) {
      currentBlock.push(sub)
    } else {
      const prev = currentBlock[currentBlock.length - 1]
      const gap = sub.startTime - getSubEnd(prev)
      if (gap <= 1.0) {
        currentBlock.push(sub)
      } else {
        blocks.push(currentBlock)
        currentBlock = [sub]
      }
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  // Inspect each speech block for long stretches (> minDuration)
  for (const block of blocks) {
    const blockStart = block[0].startTime
    const blockEnd = getSubEnd(block[block.length - 1])
    const totalBlockDuration = blockEnd - blockStart

    if (totalBlockDuration < minDuration) {
      continue
    }

    // A block can yield one or more B-roll slots
    let cursor = blockStart + 1.0 // Start 1.0s into the speech so speaker is introduced

    while (cursor + 3.0 <= blockEnd - 0.5) {
      const slotDuration = Math.min(maxDuration, Math.max(3.0, Math.min(4.5, blockEnd - cursor - 0.5)))
      const slotStart = Number(cursor.toFixed(2))
      const slotEnd = Number((slotStart + slotDuration).toFixed(2))

      // Check if this slot already has B-roll or crosses a scene cut
      if (!overlapsExistingBroll(slotStart, slotEnd) && !crossesSceneCut(slotStart, slotEnd)) {
        // Collect spoken text inside this slot
        const relevantSubs = block.filter(
          s => s.startTime < slotEnd && getSubEnd(s) > slotStart,
        )
        const contextText = relevantSubs.map(s => s.text).join(' ').trim()
        const keywords = extractKeywords(contextText)

        const suggestedPrompt = keywords.length > 0
          ? `B-roll minh hoạ: ${keywords.join(', ')}`
          : 'B-roll minh hoạ chuyển cảnh'

        opportunities.push({
          id: makeId('broll-opp'),
          startTime: slotStart,
          endTime: slotEnd,
          duration: Number(slotDuration.toFixed(2)),
          contextText,
          keywords,
          suggestedPrompt,
        })

        // Advance cursor past this B-roll + buffer of 3s of talking head
        cursor = slotEnd + 3.0
      } else {
        cursor += 2.0
      }
    }
  }

  return opportunities
}
