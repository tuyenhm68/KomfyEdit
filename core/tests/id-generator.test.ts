// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import {
  makeId,
  createSeededIdGenerator,
  setIdGenerator,
  resetIdGenerator,
  setSeededIdGenerator,
} from '../src/id-generator'
import {
  projectSchema,
  createAssetBinId,
  createDefaultTimeline,
  splitClipsAtTime,
  addClipEffect,
  type Project,
  type TimelineClip,
  type EditorState,
  createInitialEditorState,
  DEFAULT_CLIP_TRANSITION,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_CLIP_TRANSFORM,
} from '../src/index'

describe('S1-4: Deterministic and pluggable ID generator', () => {
  afterEach(() => {
    resetIdGenerator()
  })

  // ── 1. Deterministic repeatability with seeded generator ────────────────
  describe('Seed repeatability', () => {
    it('generates identical sequences of IDs when initialized with the same numeric seed', () => {
      const gen1 = createSeededIdGenerator(42)
      const gen2 = createSeededIdGenerator(42)

      const seq1 = [
        gen1('clip'),
        gen1('clip'),
        gen1('asset'),
        gen1('timeline'),
        gen1('fx'),
      ]

      const seq2 = [
        gen2('clip'),
        gen2('clip'),
        gen2('asset'),
        gen2('timeline'),
        gen2('fx'),
      ]

      expect(seq1).toEqual(seq2)
    })

    it('generates identical sequences of IDs when initialized with the same string seed', () => {
      const gen1 = createSeededIdGenerator('agent-session-abc')
      const gen2 = createSeededIdGenerator('agent-session-abc')

      const seq1 = Array.from({ length: 20 }, (_, i) => gen1(`prefix-${i % 3}`))
      const seq2 = Array.from({ length: 20 }, (_, i) => gen2(`prefix-${i % 3}`))

      expect(seq1).toEqual(seq2)
    })

    it('generates distinct sequences when initialized with different seeds', () => {
      const genA = createSeededIdGenerator(100)
      const genB = createSeededIdGenerator(200)

      const idA = genA('clip')
      const idB = genB('clip')

      expect(idA).not.toEqual(idB)
    })

    it('replays identical timeline edit operations with identical new IDs using setSeededIdGenerator', () => {
      const createTestState = (): EditorState => {
        const clip: TimelineClip = {
          id: 'base-clip',
          assetId: 'asset-1',
          type: 'video',
          startTime: 0,
          duration: 10,
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
        }

        return createInitialEditorState({
          bins: {},
          assets: [],
          timelines: [
            {
              id: 't-1',
              name: 'T1',
              createdAt: 1000,
              tracks: [{ id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false }],
              clips: [clip],
              subtitles: [],
            },
          ],
          activeTimelineId: 't-1',
        })
      }

      // Run sequence 1 with seed 12345
      setSeededIdGenerator(12345)
      let state1 = createTestState()
      state1 = splitClipsAtTime(state1, ['base-clip'], 4)
      state1 = addClipEffect(state1, 'base-clip', 'blur')
      const clips1 = state1.editorModel.timelines[0].clips

      // Run sequence 2 with same seed 12345
      setSeededIdGenerator(12345)
      let state2 = createTestState()
      state2 = splitClipsAtTime(state2, ['base-clip'], 4)
      state2 = addClipEffect(state2, 'base-clip', 'blur')
      const clips2 = state2.editorModel.timelines[0].clips

      // Assert identical clip IDs and effect IDs
      expect(clips1.map(c => c.id)).toEqual(clips2.map(c => c.id))
      expect(clips1[0].effects?.[0].id).toBe(clips2[0].effects?.[0].id)
    })
  })

  // ── 2. Compatibility with existing saved projects ───────────────────────
  describe('Backwards compatibility with real saved projects', () => {
    it('correctly reads real legacy project fixtures and preserves existing IDs unchanged', () => {
      const realSavedProjectFixture: Project = {
        version: 2,
        id: 'project-1715000000000-xyz123',
        name: 'My Summer Vacation',
        createdAt: 1715000000000,
        updatedAt: 1715000500000,
        bins: {
          'bin-1715000001000-abc1': 'B-Roll',
          'bin-1715000002000-abc2': 'Interviews',
        },
        assets: [
          {
            id: 'asset-1715000010000-a1',
            type: 'video',
            path: '/path/to/media.mp4',
            prompt: 'sunset over lake',
            resolution: '1920x1080',
            createdAt: 1715000010000,
            binId: 'bin-1715000001000-abc1',
          },
        ],
        timelines: [
          {
            id: 'timeline-1715000020000-tl1',
            name: 'Rough Cut',
            createdAt: 1715000020000,
            tracks: [
              { id: 'track-v1', name: 'V1', kind: 'video', muted: false, locked: false },
            ],
            clips: [
              {
                id: 'clip-1715000030000-c1',
                assetId: 'asset-1715000010000-a1',
                type: 'video',
                startTime: 0,
                duration: 5,
                trimStart: 0,
                trimEnd: 0,
                speed: 1,
                reversed: false,
                muted: false,
                volume: 1,
                trackIndex: 0,
                asset: null,
                flipH: false,
                flipV: false,
                transitionIn: DEFAULT_CLIP_TRANSITION,
                transitionOut: DEFAULT_CLIP_TRANSITION,
                colorCorrection: DEFAULT_COLOR_CORRECTION,
                transform: DEFAULT_CLIP_TRANSFORM,
                opacity: 100,
                effects: [
                  {
                    id: 'fx-1715000040000-fx1',
                    type: 'blur',
                    enabled: true,
                    params: { amount: 5 },
                  },
                ],
              },
            ],
            subtitles: [],
          },
        ],
        activeTimelineId: 'timeline-1715000020000-tl1',
      }

      // Schema validates successfully
      const validated = projectSchema.parse(realSavedProjectFixture)
      expect(validated.id).toBe('project-1715000000000-xyz123')
      expect(validated.timelines[0].id).toBe('timeline-1715000020000-tl1')
      expect(validated.timelines[0].clips[0].id).toBe('clip-1715000030000-c1')
      expect(validated.timelines[0].clips[0].effects?.[0].id).toBe('fx-1715000040000-fx1')
      expect(Object.keys(validated.bins)).toContain('bin-1715000001000-abc1')
    })
  })

  // ── 3. Default path uniqueness ───────────────────────────────────────────
  describe('Default generator uniqueness', () => {
    it('generates unique IDs across 5,000 invocations with default generator', () => {
      resetIdGenerator()
      const ids = new Set<string>()
      const total = 5000

      for (let i = 0; i < total; i++) {
        ids.add(makeId('item'))
      }

      expect(ids.size).toBe(total)
    })

    it('createAssetBinId and createDefaultTimeline use active generator', () => {
      setSeededIdGenerator(999)
      const binId1 = createAssetBinId()
      const timeline1 = createDefaultTimeline()

      setSeededIdGenerator(999)
      const binId2 = createAssetBinId()
      const timeline2 = createDefaultTimeline()

      expect(binId1).toBe(binId2)
      expect(timeline1.id).toBe(timeline2.id)
    })
  })

  // ── 4. Custom pluggable generator ────────────────────────────────────────
  describe('Injectable custom generator', () => {
    it('allows plugging a completely custom ID generator', () => {
      let counter = 0
      setIdGenerator(prefix => `${prefix}-custom-${++counter}`)

      expect(makeId('clip')).toBe('clip-custom-1')
      expect(makeId('clip')).toBe('clip-custom-2')
      expect(makeId('track')).toBe('track-custom-3')

      resetIdGenerator()
      expect(makeId('clip')).toMatch(/^clip-\d+-[a-z0-9]+$/)
    })
  })
})
