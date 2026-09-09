// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateTimeline,
} from '../src/validator'
import {
  createInitialEditorState,
  replaceActiveTimeline,
  getLastTimelineValidationError,
  clearLastTimelineValidationError,
  type Timeline,
  type TimelineClip,
  type Track,
  type SubtitleClip,
  type EditorState,
  DEFAULT_CLIP_TRANSITION,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_CLIP_TRANSFORM,
} from '../src/index'

describe('S1-3: Timeline validation commit gate (validateTimeline)', () => {
  const createMockClip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
    id: `clip-${Math.random().toString(36).slice(2, 8)}`,
    assetId: 'asset-1',
    type: 'video',
    startTime: 0,
    duration: 5,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: false,
    trackIndex: 0,
    volume: 1,
    asset: null,
    flipH: false,
    flipV: false,
    transitionIn: DEFAULT_CLIP_TRANSITION,
    transitionOut: DEFAULT_CLIP_TRANSITION,
    colorCorrection: DEFAULT_COLOR_CORRECTION,
    transform: DEFAULT_CLIP_TRANSFORM,
    opacity: 100,
    ...overrides,
  })

  const createMockTimeline = (
    clips: TimelineClip[] = [],
    tracks?: Track[],
    subtitles: SubtitleClip[] = [],
  ): Timeline => ({
    id: 'timeline-test',
    name: 'Test Timeline',
    createdAt: Date.now(),
    tracks: tracks ?? [
      { id: 'track-v1', name: 'V1', kind: 'video', muted: false, locked: false },
      { id: 'track-a1', name: 'A1', kind: 'audio', muted: false, locked: false },
    ],
    clips,
    subtitles,
  })

  const createMockState = (clips: TimelineClip[] = [], tracks?: Track[]): EditorState => {
    const timeline = createMockTimeline(clips, tracks)
    return createInitialEditorState({
      bins: {},
      assets: [],
      timelines: [timeline],
      activeTimelineId: timeline.id,
    })
  }

  beforeEach(() => {
    clearLastTimelineValidationError()
  })

  // ── 1. Rule: CLIP_INVALID_TRACK ──────────────────────────────────────────
  describe('Rule: CLIP_INVALID_TRACK', () => {
    it('rejects clip referencing a non-existent track index', () => {
      const clip = createMockClip({ id: 'bad-track-clip', trackIndex: 99 })
      const timeline = createMockTimeline([clip])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'CLIP_INVALID_TRACK',
          entityType: 'clip',
          entityId: 'bad-track-clip',
          trackIndex: 99,
        }),
      )
    })

    it('rejects clip with negative trackIndex', () => {
      const clip = createMockClip({ id: 'neg-track-clip', trackIndex: -1 })
      const timeline = createMockTimeline([clip])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'CLIP_INVALID_TRACK',
          entityId: 'neg-track-clip',
          trackIndex: -1,
        }),
      )
    })
  })

  // ── 2. Rule: SUBTITLE_INVALID_TRACK ──────────────────────────────────────
  describe('Rule: SUBTITLE_INVALID_TRACK', () => {
    it('rejects subtitle referencing a non-existent track index', () => {
      const sub: SubtitleClip = {
        id: 'sub-bad',
        startTime: 0,
        endTime: 3,
        text: 'Hello world',
        trackIndex: 50, // Only 2 tracks exist
      }
      const timeline = createMockTimeline([], undefined, [sub])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'SUBTITLE_INVALID_TRACK',
          entityType: 'subtitle',
          entityId: 'sub-bad',
          trackIndex: 50,
        }),
      )
    })
  })

  // ── 3. Rule: INVALID_TIMING ──────────────────────────────────────────────
  describe('Rule: INVALID_TIMING', () => {
    it('rejects clip with negative startTime', () => {
      const clip = createMockClip({ id: 'neg-start', startTime: -2, duration: 4 })
      const timeline = createMockTimeline([clip])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'INVALID_TIMING',
          entityId: 'neg-start',
        }),
      )
    })

    it('rejects clip with zero or negative duration', () => {
      const clipZero = createMockClip({ id: 'zero-dur', startTime: 0, duration: 0 })
      const timelineZero = createMockTimeline([clipZero])
      expect(validateTimeline(timelineZero).valid).toBe(false)

      const clipNeg = createMockClip({ id: 'neg-dur', startTime: 0, duration: -5 })
      const timelineNeg = createMockTimeline([clipNeg])
      expect(validateTimeline(timelineNeg).valid).toBe(false)
    })

    it('rejects clip with negative trimStart', () => {
      const clip = createMockClip({ id: 'neg-trim', startTime: 0, duration: 4, trimStart: -1 })
      const timeline = createMockTimeline([clip])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'INVALID_TIMING',
          entityId: 'neg-trim',
        }),
      )
    })
  })

  // ── 4. Rule: V1_NOT_SEAMLESS ─────────────────────────────────────────────
  describe('Rule: V1_NOT_SEAMLESS', () => {
    it('rejects V1 timeline when first clip does not start at 0', () => {
      const clip = createMockClip({ id: 'v1-gap-start', trackIndex: 0, startTime: 2, duration: 4 })
      const timeline = createMockTimeline([clip])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'V1_NOT_SEAMLESS',
          entityType: 'track',
          trackIndex: 0,
        }),
      )
    })

    it('rejects V1 timeline with gap between consecutive clips', () => {
      const clip1 = createMockClip({ id: 'v1-1', trackIndex: 0, startTime: 0, duration: 4 })
      const clip2 = createMockClip({ id: 'v1-2', trackIndex: 0, startTime: 6, duration: 4 }) // Gap between 4 and 6
      const timeline = createMockTimeline([clip1, clip2])

      const result = validateTimeline(timeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'V1_NOT_SEAMLESS',
          entityType: 'track',
          trackIndex: 0,
        }),
      )
    })
  })

  // ── 5. Rule: LOCKED_TRACK_MODIFIED ───────────────────────────────────────
  describe('Rule: LOCKED_TRACK_MODIFIED', () => {
    const lockedTracks: Track[] = [
      { id: 'track-v1', name: 'V1', kind: 'video', muted: false, locked: true },
      { id: 'track-a1', name: 'A1', kind: 'audio', muted: false, locked: false },
    ]

    it('rejects modifications to existing clip on locked track', () => {
      const clipOrig = createMockClip({ id: 'locked-clip', trackIndex: 0, startTime: 0, duration: 5 })
      const prevTimeline = createMockTimeline([clipOrig], lockedTracks)

      // Modify duration
      const clipModified = { ...clipOrig, duration: 8 }
      const nextTimeline = createMockTimeline([clipModified], lockedTracks)

      const result = validateTimeline(nextTimeline, prevTimeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'LOCKED_TRACK_MODIFIED',
          entityType: 'track',
          trackIndex: 0,
        }),
      )
    })

    it('rejects adding new clip to locked track', () => {
      const clipOrig = createMockClip({ id: 'c1', trackIndex: 0, startTime: 0, duration: 5 })
      const prevTimeline = createMockTimeline([clipOrig], lockedTracks)

      const newClip = createMockClip({ id: 'c2', trackIndex: 0, startTime: 5, duration: 3 })
      const nextTimeline = createMockTimeline([clipOrig, newClip], lockedTracks)

      const result = validateTimeline(nextTimeline, prevTimeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'LOCKED_TRACK_MODIFIED',
        }),
      )
    })

    it('rejects deleting clip from locked track', () => {
      const clipOrig = createMockClip({ id: 'c1', trackIndex: 0, startTime: 0, duration: 5 })
      const prevTimeline = createMockTimeline([clipOrig], lockedTracks)

      const nextTimeline = createMockTimeline([], lockedTracks)
      const result = validateTimeline(nextTimeline, prevTimeline)
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'LOCKED_TRACK_MODIFIED',
        }),
      )
    })

    it('allows changes on unlocked track when other tracks are locked', () => {
      const v1Clip = createMockClip({ id: 'v1', trackIndex: 0, startTime: 0, duration: 5 })
      const a1Clip1 = createMockClip({ id: 'a1', trackIndex: 1, type: 'audio', startTime: 0, duration: 3 })
      const prevTimeline = createMockTimeline([v1Clip, a1Clip1], lockedTracks)

      // Change only unlocked track 1
      const a1Clip2 = createMockClip({ id: 'a1-new', trackIndex: 1, type: 'audio', startTime: 0, duration: 4 })
      const nextTimeline = createMockTimeline([v1Clip, a1Clip2], lockedTracks)

      const result = validateTimeline(nextTimeline, prevTimeline)
      expect(result.valid).toBe(true)
    })
  })

  // ── 6. State immutability & reference equality upon rejection ────────────
  describe('Gate rejection behavior and state reference equality', () => {
    it('returns exact same state reference (identity unchanged) when mutation is rejected', () => {
      const initialState = createMockState()
      expect(initialState.editorModel.timelines.length).toBeGreaterThan(0)

      // Attempt to commit an invalid clip with non-existent trackIndex: 999
      const invalidClip = createMockClip({ id: 'invalid-clip', trackIndex: 999 })
      const nextState = replaceActiveTimeline(initialState, (timeline: Timeline) => ({
        ...timeline,
        clips: [...timeline.clips, invalidClip],
      }))

      // Must be EXACT same reference
      expect(nextState).toBe(initialState)

      // Structured error must be recorded
      const lastErr = getLastTimelineValidationError()
      expect(lastErr).not.toBeNull()
      expect(lastErr?.valid).toBe(false)
      expect(lastErr?.errors[0].rule).toBe('CLIP_INVALID_TRACK')
      expect(lastErr?.errors[0].entityId).toBe('invalid-clip')
    })

    it('returns exact same state reference when attempting to modify locked track', () => {
      const clip = createMockClip({ id: 'c-locked', trackIndex: 0, startTime: 0, duration: 5 })
      const state = createMockState([clip], [
        { id: 'v1', name: 'V1', kind: 'video', muted: false, locked: true },
      ])

      const stateBeforeInvalidMutation = state
      // Attempt to delete clip on locked track
      const attemptedState = replaceActiveTimeline(state, (timeline: Timeline) => ({
        ...timeline,
        clips: [],
      }))

      expect(attemptedState).toBe(stateBeforeInvalidMutation)
      expect(getLastTimelineValidationError()?.errors[0].rule).toBe('LOCKED_TRACK_MODIFIED')
    })
  })

  // ── 7. Performance benchmark: 500 clips under 5ms ────────────────────────
  describe('Performance benchmark: 500-clip timeline', () => {
    it('validates a 500-clip timeline in less than 5ms', () => {
      const clips: TimelineClip[] = []
      let cursor = 0
      for (let i = 0; i < 500; i++) {
        const dur = 2
        // Distribute across 5 tracks
        const trackIdx = i % 5 === 0 ? 0 : (i % 4) + 1
        const startTime = trackIdx === 0 ? cursor : (i * 0.5)
        if (trackIdx === 0) {
          cursor += dur
        }
        clips.push(
          createMockClip({
            id: `clip-bench-${i}`,
            trackIndex: trackIdx,
            startTime,
            duration: dur,
          }),
        )
      }

      const tracks: Track[] = [
        { id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false },
        { id: 'v2', name: 'V2', kind: 'video', muted: false, locked: false },
        { id: 'v3', name: 'V3', kind: 'video', muted: false, locked: false },
        { id: 'a1', name: 'A1', kind: 'audio', muted: false, locked: false },
        { id: 'a2', name: 'A2', kind: 'audio', muted: false, locked: false },
      ]

      const timeline = createMockTimeline(clips, tracks)

      // Warmup run
      validateTimeline(timeline)

      // Measure
      const start = performance.now()
      const runs = 20
      for (let r = 0; r < runs; r++) {
        const res = validateTimeline(timeline)
        expect(res.valid).toBe(true)
      }
      const totalElapsed = performance.now() - start
      const avgPerRunMs = totalElapsed / runs

      console.log(`[Benchmark] validateTimeline on 500 clips: ${avgPerRunMs.toFixed(3)}ms per run`)
      expect(avgPerRunMs).toBeLessThan(5)
    })
  })
})
