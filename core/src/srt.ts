// SRT subtitle format parsing and export utilities

export interface SrtCue {
  index: number
  startTime: number  // in seconds
  endTime: number    // in seconds
  text: string
  color?: string     // extracted from <font color=...> tags if present
}

/**
 * Parse SRT timestamp to seconds
 * Format: HH:MM:SS,mmm (e.g. "00:01:23,456")
 */
function parseTimestamp(ts: string): number {
  const match = ts.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/)
  if (!match) return 0
  const [, h, m, s, ms] = match
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000
}

/**
 * Convert seconds to SRT timestamp
 * Returns format: HH:MM:SS,mmm
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`
}

/**
 * Strip HTML/rich-text tags from SRT text.
 * Handles <font color=...>, <b>, <i>, <u>, and any other HTML tags.
 * Extracts the first color value found (if any).
 */
function stripTags(text: string): { clean: string; color?: string } {
  let color: string | undefined

  // Extract color from <font color=...> (Premiere format: color=#RRGGBBAA or #RRGGBB)
  const colorMatch = text.match(/<font\s+color\s*=\s*["']?([^"'>]+)["']?\s*>/i)
  if (colorMatch) {
    let c = colorMatch[1].trim()
    // Premiere sometimes outputs 8-char hex (#RRGGBBAA) — convert to standard 6-char
    if (/^#[0-9A-Fa-f]{8}$/.test(c)) {
      c = c.slice(0, 7) // drop the alpha suffix
    }
    color = c
  }

  // Strip all HTML tags
  const clean = text
    .replace(/<[^>]+>/g, '')   // remove tags
    .replace(/\n\s*\n/g, '\n') // collapse blank lines left by removed tags
    .trim()

  return { clean, color }
}

// Threshold: cues shorter than this (in seconds) are considered "pre-cues" / fade markers
const PRE_CUE_THRESHOLD = 0.1 // 100ms

/**
 * Parse an SRT file content string into an array of cues.
 *
 * Handles:
 * - Standard SRT format
 * - Premiere Pro SRT with <font color=...> tags
 * - Premiere "pre-cue" pairs (near-zero-duration fade-in marker + real cue)
 *   → merged into a single cue using the pre-cue's start time and the real cue's end time
 */
export function parseSrt(content: string): SrtCue[] {
  const rawCues: SrtCue[] = []
  
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  
  // Split into blocks separated by empty lines
  const blocks = normalized.split(/\n\n+/)
  
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue
    
    // First line: index number
    const index = parseInt(lines[0].trim())
    if (isNaN(index)) continue
    
    // Second line: timestamps (start --> end)
    const timeParts = lines[1].split('-->')
    if (timeParts.length !== 2) continue
    
    const startTime = parseTimestamp(timeParts[0])
    const endTime = parseTimestamp(timeParts[1])
    
    if (endTime <= startTime) continue
    
    // Remaining lines: subtitle text (strip HTML tags)
    const rawText = lines.slice(2).join('\n').trim()
    if (!rawText) continue
    
    const { clean, color } = stripTags(rawText)
    if (!clean) continue
    
    rawCues.push({ index, startTime, endTime, text: clean, color })
  }
  
  // --- Merge Premiere-style pre-cue pairs ---
  // Pattern: a near-zero-duration cue immediately followed by a cue with the same text.
  // The first cue's start time is the real start; the second cue's end time is the real end.
  const merged: SrtCue[] = []
  let i = 0
  while (i < rawCues.length) {
    const cur = rawCues[i]
    const next = rawCues[i + 1]
    
    const curDuration = cur.endTime - cur.startTime
    
    if (
      next &&
      curDuration <= PRE_CUE_THRESHOLD &&
      cur.text === next.text &&
      Math.abs(cur.endTime - next.startTime) < 0.1 // consecutive
    ) {
      // Merge: use pre-cue's start + real cue's end
      merged.push({
        index: cur.index,
        startTime: cur.startTime,
        endTime: next.endTime,
        text: cur.text,
        color: cur.color || next.color,
      })
      i += 2 // skip both
    } else if (curDuration <= PRE_CUE_THRESHOLD) {
      // Standalone near-zero cue with no matching follow-up — skip it (likely orphan pre-cue)
      i++
    } else {
      merged.push(cur)
      i++
    }
  }
  
  // Re-index
  return merged.map((cue, idx) => ({ ...cue, index: idx + 1 }))
}

/**
 * Export an array of cues to SRT format string
 */
export function exportSrt(cues: { startTime: number; endTime: number; text: string }[]): string {
  // Sort by start time
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime)
  
  return sorted.map((cue, i) => {
    return `${i + 1}\n${formatTimestamp(cue.startTime)} --> ${formatTimestamp(cue.endTime)}\n${cue.text}`
  }).join('\n\n') + '\n'
}

/**
 * Individual word with start/end timing (compatible with Whisper word-level timestamps).
 */
export interface WordTimestamp {
  word: string
  start: number
  end: number
  probability?: number
}

/**
 * Configuration options for short-form subtitle chunking.
 */
export interface ChunkOptions {
  /** Minimum number of words per chunk (default: 3) */
  minWords?: number
  /** Maximum number of words per chunk (default: 5) */
  maxWords?: number
  /** Maximum character length for a single cue (default: 28) */
  maxChars?: number
  /** Pause duration between consecutive words in seconds that triggers a split (default: 0.35s) */
  pauseThresholdSec?: number
  /** Offset in seconds to add to all generated cue timestamps (default: 0) */
  timeOffset?: number
}

const PUNCTUATION_BREAK_REGEX = /[.!?…:;,—–]$/

/**
 * Chunk an array of timestamped words into punchy, short-form subtitle cues (3–5 words).
 * Breaks on punctuation, natural speech pauses, word limits, or max character bounds.
 */
export function chunkWordTimestamps(
  words: WordTimestamp[],
  options: ChunkOptions = {},
): SrtCue[] {
  const minWords = Math.max(1, options.minWords ?? 3)
  const maxWords = Math.max(minWords, options.maxWords ?? 5)
  const maxChars = Math.max(10, options.maxChars ?? 28)
  const pauseThreshold = Math.max(0.1, options.pauseThresholdSec ?? 0.35)
  const timeOffset = options.timeOffset ?? 0

  const validWords = words
    .map(w => ({ ...w, word: w.word.trim() }))
    .filter(w => w.word.length > 0 && w.end >= w.start)

  if (validWords.length === 0) return []

  const result: SrtCue[] = []
  let currentGroup: WordTimestamp[] = []

  const flushGroup = () => {
    if (currentGroup.length === 0) return
    const firstWord = currentGroup[0]
    const lastWord = currentGroup[currentGroup.length - 1]
    const text = currentGroup.map(w => w.word).join(' ').trim()

    if (text.length > 0 && lastWord.end > firstWord.start) {
      result.push({
        index: result.length + 1,
        startTime: Math.max(0, Number((firstWord.start + timeOffset).toFixed(3))),
        endTime: Math.max(0, Number((lastWord.end + timeOffset).toFixed(3))),
        text,
      })
    }
    currentGroup = []
  }

  for (let i = 0; i < validWords.length; i++) {
    const currentWord = validWords[i]
    const prevWord = currentGroup[currentGroup.length - 1]

    if (prevWord) {
      const pauseDuration = currentWord.start - prevWord.end
      const currentText = currentGroup.map(w => w.word).join(' ')
      const wouldExceedChars = `${currentText} ${currentWord.word}`.length > maxChars
      const hasHitMaxWords = currentGroup.length >= maxWords
      const hasPauseBreak = pauseDuration >= pauseThreshold && currentGroup.length >= minWords
      const prevEndsWithPunctuation = PUNCTUATION_BREAK_REGEX.test(prevWord.word) && currentGroup.length >= minWords

      if (hasHitMaxWords || wouldExceedChars || hasPauseBreak || prevEndsWithPunctuation) {
        flushGroup()
      }
    }

    currentGroup.push(currentWord)
  }

  flushGroup()
  return result
}

/**
 * Split a single long SrtCue into multiple short cues (3–5 words or ~25–28 chars)
 * by interpolating timestamps across words proportionally.
 */
export function splitLongCue(cue: SrtCue, options: ChunkOptions = {}): SrtCue[] {
  const words = cue.text
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)

  const minWords = Math.max(1, options.minWords ?? 3)
  const maxWords = Math.max(minWords, options.maxWords ?? 5)
  const maxChars = Math.max(10, options.maxChars ?? 28)

  if (words.length <= maxWords && cue.text.length <= maxChars) {
    return [{ ...cue }]
  }

  // Break words into chunks
  const wordChunks: string[][] = []
  let currentChunk: string[] = []

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const currentText = currentChunk.join(' ')
    const wouldExceedChars = `${currentText} ${word}`.trim().length > maxChars
    const hasHitMaxWords = currentChunk.length >= maxWords
    const prevWord = currentChunk[currentChunk.length - 1]
    const prevPunct = prevWord && PUNCTUATION_BREAK_REGEX.test(prevWord) && currentChunk.length >= minWords

    if (currentChunk.length > 0 && (hasHitMaxWords || wouldExceedChars || prevPunct)) {
      wordChunks.push(currentChunk)
      currentChunk = []
    }
    currentChunk.push(word)
  }
  if (currentChunk.length > 0) {
    wordChunks.push(currentChunk)
  }

  // Calculate proportional timestamps based on word character counts
  const totalDuration = cue.endTime - cue.startTime
  const totalLetters = words.reduce((acc, w) => acc + Math.max(1, w.length), 0)

  const result: SrtCue[] = []
  let runningTime = cue.startTime

  for (let i = 0; i < wordChunks.length; i++) {
    const chunkWords = wordChunks[i]
    const chunkLetters = chunkWords.reduce((acc, w) => acc + Math.max(1, w.length), 0)
    const isLast = i === wordChunks.length - 1
    const chunkDuration = isLast
      ? cue.endTime - runningTime
      : (chunkLetters / totalLetters) * totalDuration

    const chunkEndTime = isLast
      ? cue.endTime
      : Number((runningTime + chunkDuration).toFixed(3))

    result.push({
      index: cue.index + i,
      startTime: Number(runningTime.toFixed(3)),
      endTime: Math.max(Number(runningTime.toFixed(3)) + 0.1, chunkEndTime),
      text: chunkWords.join(' '),
      color: cue.color,
    })

    runningTime = chunkEndTime
  }

  return result
}

/**
 * Chunk an array of existing SrtCues into short-form cues (3–5 words).
 */
export function chunkSrtCues(cues: SrtCue[], options: ChunkOptions = {}): SrtCue[] {
  const result: SrtCue[] = []
  for (const cue of cues) {
    const splitCues = splitLongCue(cue, options)
    result.push(...splitCues)
  }
  return result.map((c, idx) => ({ ...c, index: idx + 1 }))
}

