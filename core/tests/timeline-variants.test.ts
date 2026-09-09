import { describe, expect, it } from 'vitest'
import {
  createInitialEditorState,
  duplicateTimeline,
  deleteTimeline,
  switchActiveTimeline,
  setTimelineVariantInfo,
  validateEditPatch,
  describePatch,
  applyPatch,
  undo,
  selectTimelines,
  selectActiveTimeline,
  type Timeline,
  type TimelineClip,
  type Track,
  type EditPatch,
} from '../src'

const createMockClip = (id: string, overrides: Partial<TimelineClip> = {}): TimelineClip => ({
  id,
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
  transitionIn: { type: 'none', duration: 0 },
  transitionOut: { type: 'none', duration: 0 },
  colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
  transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
  opacity: 100,
  ...overrides,
})

const createMockTimeline = (
  id: string,
  name: string,
  clips: TimelineClip[] = [],
  tracks?: Track[],
): Timeline => ({
  id,
  name,
  createdAt: Date.now(),
  tracks: tracks ?? [
    { id: 'v1', kind: 'video', name: 'V1', locked: false, muted: false },
    { id: 'a1', kind: 'audio', name: 'A1', locked: false, muted: false },
  ],
  clips,
  subtitles: [],
  transitions: [],
})

function makeTestState(timelines: Timeline[], activeTimelineId?: string) {
  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines,
    activeTimelineId: activeTimelineId ?? timelines[0]?.id ?? null,
  })
}

describe('Timeline Variants & Sequences (KE-905)', () => {
  it('duplicates timeline with remapped clip IDs, linkedClipIds, and transitions', () => {
    const videoClip = createMockClip('c-vid', {
      type: 'video',
      startTime: 0,
      duration: 5,
      linkedClipIds: ['c-aud'],
    })
    const audioClip = createMockClip('c-aud', {
      type: 'audio',
      startTime: 0,
      duration: 5,
      trackIndex: 1,
      linkedClipIds: ['c-vid'],
    })
    const clip2 = createMockClip('c-vid2', {
      type: 'video',
      startTime: 5,
      duration: 5,
    })

    const initialTl = createMockTimeline('tl-orig', 'Original Variant', [videoClip, audioClip, clip2])
    initialTl.transitions = [
      {
        id: 'tr-1',
        trackIndex: 0,
        leftClipId: 'c-vid',
        rightClipId: 'c-vid2',
        type: 'crossfade',
        duration: 1.0,
      },
    ]

    let state = makeTestState([initialTl], 'tl-orig')

    // Duplicate
    state = duplicateTimeline(state, 'tl-orig', 'Variant B - Hook A/B', 'hook-ab')

    const timelines = selectTimelines(state)
    expect(timelines.length).toBe(2)

    const activeTl = selectActiveTimeline(state)
    expect(activeTl).toBeDefined()
    expect(activeTl?.name).toBe('Variant B - Hook A/B')
    expect(activeTl?.variantTag).toBe('hook-ab')
    expect(activeTl?.id).not.toBe('tl-orig')

    // Clips should be cloned with new IDs
    expect(activeTl?.clips.length).toBe(3)
    const newVid = activeTl?.clips.find(c => c.type === 'video' && c.startTime === 0)
    const newAud = activeTl?.clips.find(c => c.type === 'audio' && c.startTime === 0)
    const newVid2 = activeTl?.clips.find(c => c.type === 'video' && c.startTime === 5)

    expect(newVid?.id).not.toBe('c-vid')
    expect(newAud?.id).not.toBe('c-aud')
    expect(newVid2?.id).not.toBe('c-vid2')

    // Check linkedClipIds remapping
    expect(newVid?.linkedClipIds).toEqual([newAud?.id])
    expect(newAud?.linkedClipIds).toEqual([newVid?.id])

    // Check transitions remapping
    expect(activeTl?.transitions?.length).toBe(1)
    const newTr = activeTl?.transitions?.[0]
    expect(newTr?.leftClipId).toBe(newVid?.id)
    expect(newTr?.rightClipId).toBe(newVid2?.id)
    expect(newTr?.id).not.toBe('tr-1')
  })

  it('switches active timeline and updates session', () => {
    const tl1 = createMockTimeline('tl-1', 'Timeline 1')
    const tl2 = createMockTimeline('tl-2', 'Timeline 2')

    let state = makeTestState([tl1, tl2], 'tl-1')

    expect(selectActiveTimeline(state)?.id).toBe('tl-1')

    state = switchActiveTimeline(state, 'tl-2')
    expect(selectActiveTimeline(state)?.id).toBe('tl-2')
    expect(state.editorModel.activeTimelineId).toBe('tl-2')
  })

  it('deletes timeline safely and falls back to another timeline', () => {
    const tl1 = createMockTimeline('tl-1', 'Timeline 1')
    const tl2 = createMockTimeline('tl-2', 'Timeline 2')

    let state = makeTestState([tl1, tl2], 'tl-1')

    state = deleteTimeline(state, 'tl-1')
    expect(selectTimelines(state).length).toBe(1)
    expect(selectActiveTimeline(state)?.id).toBe('tl-2')
  })

  it('sets timeline variant tag and description', () => {
    const tl1 = createMockTimeline('tl-1', 'Timeline 1')
    let state = makeTestState([tl1], 'tl-1')

    state = setTimelineVariantInfo(state, 'tl-1', {
      name: 'Variant 9:16 Shorts',
      variantTag: 'shorts-916',
      description: 'Optimized vertical cut for TikTok/Reels',
    })

    const tl = selectActiveTimeline(state)
    expect(tl?.name).toBe('Variant 9:16 Shorts')
    expect(tl?.variantTag).toBe('shorts-916')
    expect(tl?.description).toBe('Optimized vertical cut for TikTok/Reels')
  })

  it('handles duplicate_timeline, switch_timeline, and delete_timeline via EditPatch', () => {
    const tl1 = createMockTimeline('tl-1', 'Master Timeline', [createMockClip('c1')])
    let state = makeTestState([tl1], 'tl-1')

    // 1. Validate & describe duplicate_timeline
    const dupPatch: EditPatch = {
      version: 1,
      operations: [
        {
          op: 'duplicate_timeline',
          timelineId: 'tl-1',
          name: 'Variant B - Viral Hook',
          variantTag: 'hook-test',
        },
      ],
    }

    const val1 = validateEditPatch(state, dupPatch)
    expect(val1.valid).toBe(true)

    const desc1 = describePatch(state, dupPatch)
    expect(desc1).toContain('duplicate timeline variant "Variant B - Viral Hook" [hook-test]')

    const apply1 = applyPatch(state, dupPatch)
    expect(apply1.success).toBe(true)
    if (!apply1.success) throw new Error(apply1.error)

    expect(selectTimelines(apply1.state).length).toBe(2)
    const dupTl = selectActiveTimeline(apply1.state)
    expect(dupTl?.name).toBe('Variant B - Viral Hook')
    expect(dupTl?.variantTag).toBe('hook-test')

    // 2. Switch back to tl-1
    const switchPatch: EditPatch = {
      version: 1,
      operations: [{ op: 'switch_timeline', timelineId: 'tl-1' }],
    }
    const apply2 = applyPatch(apply1.state, switchPatch)
    expect(apply2.success).toBe(true)
    if (!apply2.success) throw new Error(apply2.error)
    expect(selectActiveTimeline(apply2.state)?.id).toBe('tl-1')

    // 3. Delete duplicated timeline
    const deletePatch: EditPatch = {
      version: 1,
      operations: [{ op: 'delete_timeline', timelineId: dupTl!.id }],
    }
    const apply3 = applyPatch(apply2.state, deletePatch)
    expect(apply3.success).toBe(true)
    if (!apply3.success) throw new Error(apply3.error)
    expect(selectTimelines(apply3.state).length).toBe(1)

    // 4. Cannot delete the last remaining timeline
    const failDeletePatch: EditPatch = {
      version: 1,
      operations: [{ op: 'delete_timeline', timelineId: 'tl-1' }],
    }
    const valFail = validateEditPatch(apply3.state, failDeletePatch)
    expect(valFail.valid).toBe(false)
    if (!valFail.valid) {
      expect(valFail.error).toContain('Cannot delete the only timeline')
    }

    // 5. Undo support
    const undone = undo(apply3.state)
    expect(selectTimelines(undone).length).toBe(2)
  })
})