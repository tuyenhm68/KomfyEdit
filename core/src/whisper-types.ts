import type { ChunkOptions, SrtCue, WordTimestamp } from './srt'
import { chunkSrtCues, chunkWordTimestamps } from './srt'
import type { TimelineClip } from './project-model'

/**
 * Which clips a caption run should transcribe, in the order they play.
 *
 * A clip, not a file. Once a video has been cut, the timeline holds several
 * clips of the same recording, each with its own trim — captioning "the video"
 * by picking the first of them covered the first cut and left the rest of the
 * timeline silent. Nothing selected means the whole timeline.
 *
 * A video that has a linked audio clip is silent on its own: the audio clip is
 * what carries the speech, so taking both would caption the same words twice.
 */
export function selectCaptionSourceClips(
  clips: TimelineClip[],
  selectedClipIds: ReadonlySet<string>,
): TimelineClip[] {
  const eligible = clips.filter(clip => {
    if (clip.type !== 'video' && clip.type !== 'audio') return false
    if (!clip.asset?.path) return false
    if (clip.type === 'audio') return true
    return !(clip.linkedClipIds ?? []).some(
      linkedId => clips.find(candidate => candidate.id === linkedId)?.type === 'audio',
    )
  })

  const selected = eligible.filter(clip => selectedClipIds.has(clip.id))
  return (selected.length > 0 ? selected : eligible)
    .slice()
    .sort((left, right) => left.startTime - right.startTime)
}

/**
 * Stages a transcription run reports as it goes.
 *
 * A key, not a sentence: the main process has no locale, so it names the step
 * and the renderer looks it up under `captions.progress.*` in the active
 * language. Adding a step here means adding it to every locale file.
 */
export const WHISPER_PROGRESS_STEPS = [
  'extractingAudio',
  'uploadingAudio',
  'transcribing',
  'processingSubtitles',
  'done',
  'cancelled',
  'failed',
] as const

export type WhisperProgressStep = (typeof WHISPER_PROGRESS_STEPS)[number]

export interface WhisperWord {
  word: string
  start: number
  end: number
  probability?: number
}

export interface WhisperSegment {
  id: number
  start: number
  end: number
  text: string
  words?: WhisperWord[]
}

export interface WhisperTranscriptionResult {
  text: string
  language?: string
  duration?: number
  segments: WhisperSegment[]
}

export interface WhisperToSrtOptions extends ChunkOptions {
  /** Whether to automatically chunk long sentences into 3-5 word Smart Captions (default: false) */
  chunk?: boolean
}

/**
 * Converts Whisper verbose_json segments into KomfyEdit SrtCue array.
 * When options.chunk is true, it leverages word_timestamps (if available) or splits sentences into punchy 3-5 word cues.
 * @param segments Array of WhisperSegment
 * @param timeOffset Optional time offset in seconds (e.g. clip.startTime on timeline)
 * @param options Optional chunking and timing settings
 */
export function whisperSegmentsToSrtCues(
  segments: WhisperSegment[],
  timeOffset: number = 0,
  options?: WhisperToSrtOptions,
): SrtCue[] {
  const shouldChunk = options?.chunk ?? false

  if (shouldChunk) {
    // Check if any segment has words
    const allWords: WordTimestamp[] = []
    let hasWordTimestamps = false

    for (const seg of segments) {
      if (seg.words && seg.words.length > 0) {
        hasWordTimestamps = true
        for (const w of seg.words) {
          allWords.push({
            word: w.word,
            start: w.start,
            end: w.end,
            probability: w.probability,
          })
        }
      }
    }

    if (hasWordTimestamps && allWords.length > 0) {
      return chunkWordTimestamps(allWords, {
        ...options,
        timeOffset: (options?.timeOffset ?? 0) + timeOffset,
      })
    }
  }

  // Fallback or un-chunked baseline
  const baseCues = segments
    .filter(seg => seg.text && seg.text.trim().length > 0)
    .map((seg, index) => ({
      index: index + 1,
      startTime: Math.max(0, Number((seg.start + timeOffset).toFixed(3))),
      endTime: Math.max(0, Number((seg.end + timeOffset).toFixed(3))),
      text: seg.text.trim(),
    }))
    .filter(cue => cue.endTime > cue.startTime)

  if (shouldChunk) {
    return chunkSrtCues(baseCues, options)
  }

  return baseCues
}

