import { describe, it, expect } from 'vitest'
import {
  createInitialEditorState,
  getEditorModel,
  projectSchema,
  replaceActiveTimelineDocument,
  setTimelineTransition,
  selectActiveTimeline,
  type EditorState,
  type Project,
} from '../src/index'

/**
 * How a transition record outlives the overlap it describes.
 *
 * A transition IS the overlap. Every path that writes clip geometry without
 * looking at `transitions` can therefore leave one behind describing something
 * that is not happening — which is exactly the record found in the real
 * project file (see 'a transition whose clips no longer overlap' in
 * timeline-transitions.test.ts).
 */

const IMG_ASSET = {
  id: 'asset-img',
  type: 'image' as const,
  path: '/img.png',
  prompt: 'still',
  resolution: '1920x1080',
  duration: 0,
  createdAt: 1000,
}

const still = (id: string, startTime: number, duration: number, trackIndex: number) => ({
  id,
  trackIndex,
  startTime,
  duration,
  trimStart: 0,
  trimEnd: duration,
  type: 'image' as const,
  assetId: IMG_ASSET.id,
  asset: IMG_ASSET,
})

function baseState(): EditorState {
  const project: Project = projectSchema.parse({
    version: 2,
    id: 'proj-overlap-decay',
    name: 'Overlap decay',
    createdAt: 1000,
    updatedAt: 1000,
    assets: [IMG_ASSET],
    bins: { root: 'Default' },
    timelines: [{
      id: 'tl-main',
      name: 'Main',
      createdAt: 1000,
      tracks: [
        { id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false, sourcePatched: true },
        { id: 'v2', name: 'V2', kind: 'video', muted: false, locked: false },
      ],
      // The pair lives on the overlay track (V2), like the real file's track 6.
      clips: [still('img-a', 2.84, 4.28, 1), still('img-b', 7.12, 5, 1)],
      subtitles: [],
    }],
    activeTimelineId: 'tl-main',
  })
  return createInitialEditorState(getEditorModel(project))
}

/** The pair with a 0.72s transition genuinely in force. */
function withTransition(): EditorState {
  const state = setTimelineTransition(baseState(), 'img-a', 'img-b', 'wipe-down', 0.72)
  const timeline = selectActiveTimeline(state)!
  expect(timeline.transitions).toHaveLength(1)
  const a = timeline.clips.find(c => c.id === 'img-a')!
  const b = timeline.clips.find(c => c.id === 'img-b')!
  // Placing it really did create the overlap.
  expect((a.startTime + a.duration) - b.startTime).toBeCloseTo(0.72, 5)
  return state
}

const overlapOf = (state: EditorState) => {
  const timeline = selectActiveTimeline(state)!
  const a = timeline.clips.find(c => c.id === 'img-a')!
  const b = timeline.clips.find(c => c.id === 'img-b')!
  return (a.startTime + a.duration) - b.startTime
}

describe('an edit that breaks the overlap out from under a transition', () => {
  it('the drag commit pulls the right clip clear of the transition', () => {
    const placed = withTransition()
    const timeline = selectActiveTimeline(placed)!

    // Placing the transition centred it: img-a lent 0.36s of tail and img-b
    // moved 0.36s early. Dragging img-b back to img-a's (now longer) end is
    // the real file's state — the two stills meet exactly, overlap 0.
    const leftEnd = (() => {
      const a = timeline.clips.find(c => c.id === 'img-a')!
      return a.startTime + a.duration
    })()

    // What useTimelineDrag's handleMouseUp writes: clip startTimes straight
    // through replaceTimelineDocument, with `transitions` never consulted.
    const dragged = replaceActiveTimelineDocument(placed, {
      tracks: timeline.tracks,
      clips: timeline.clips.map(clip =>
        clip.id === 'img-b' ? { ...clip, startTime: leftEnd } : clip,
      ),
      subtitles: timeline.subtitles,
    })

    // The clips now merely meet — the transition is not happening.
    expect(overlapOf(dragged)).toBeCloseTo(0, 5)

    // ...and the record must not survive describing it.
    expect(selectActiveTimeline(dragged)!.transitions ?? []).toHaveLength(0)
  })

  it('a drag that keeps the pair overlapping keeps the transition', () => {
    const placed = withTransition()
    const timeline = selectActiveTimeline(placed)!

    // Nudge img-b a little later, still well inside img-a's tail.
    const dragged = replaceActiveTimelineDocument(placed, {
      tracks: timeline.tracks,
      clips: timeline.clips.map(clip =>
        clip.id === 'img-b' ? { ...clip, startTime: clip.startTime + 0.2 } : clip,
      ),
      subtitles: timeline.subtitles,
    })

    expect(overlapOf(dragged)).toBeGreaterThan(0)
    expect(selectActiveTimeline(dragged)!.transitions ?? []).toHaveLength(1)
  })

  it('dropping the transition moves nothing else — the drag already placed the clips', () => {
    const placed = withTransition()
    const timeline = selectActiveTimeline(placed)!

    const dragged = replaceActiveTimelineDocument(placed, {
      tracks: timeline.tracks,
      clips: timeline.clips.map(clip =>
        clip.id === 'img-b' ? { ...clip, startTime: 9 } : clip,
      ),
      subtitles: timeline.subtitles,
    })

    const next = selectActiveTimeline(dragged)!
    expect(next.transitions ?? []).toHaveLength(0)
    // Non-rippling: the clips stay exactly where the drag put them.
    expect(next.clips.find(c => c.id === 'img-b')!.startTime).toBeCloseTo(9, 5)
    expect(next.clips.find(c => c.id === 'img-a')!.startTime).toBeCloseTo(2.84, 5)
    expect(next.clips.find(c => c.id === 'img-a')!.duration).toBeCloseTo(4.28 + 0.36, 5)
  })
})

describe('opening a project that already carries a dead transition', () => {
  /** The record straight out of the real file, on the overlay track. */
  const DAMAGED = () => projectSchema.parse({
    version: 2,
    id: 'project-1788476145133-8lvhcoj6m',
    name: 'Damaged',
    createdAt: 1000,
    updatedAt: 1000,
    assets: [IMG_ASSET],
    bins: { root: 'Default' },
    timelines: [{
      id: 'tl-main',
      name: 'Main',
      createdAt: 1000,
      tracks: [
        { id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false, sourcePatched: true },
        { id: 'v2', name: 'V2', kind: 'video', muted: false, locked: false },
      ],
      clips: [still('img-a', 2.84, 4.28, 1), still('img-b', 7.12, 5, 1)],
      subtitles: [],
      transitions: [{
        id: 'transition-1788609241021-uaevqvcot',
        trackIndex: 1,
        leftClipId: 'img-a',
        rightClipId: 'img-b',
        type: 'wipe-down',
        duration: 0.72,
      }],
    }],
    activeTimelineId: 'tl-main',
  }) as Project

  it('drops the record on the way in rather than carrying it forever', () => {
    const model = getEditorModel(DAMAGED())
    expect(model.timelines[0].transitions ?? []).toHaveLength(0)
  })

  it('heals without moving a single clip', () => {
    const timeline = getEditorModel(DAMAGED()).timelines[0]
    expect(timeline.clips.find(c => c.id === 'img-a')!.startTime).toBeCloseTo(2.84, 5)
    expect(timeline.clips.find(c => c.id === 'img-a')!.duration).toBeCloseTo(4.28, 5)
    expect(timeline.clips.find(c => c.id === 'img-b')!.startTime).toBeCloseTo(7.12, 5)
    expect(timeline.clips.find(c => c.id === 'img-b')!.duration).toBeCloseTo(5, 5)
  })

  it('leaves a project whose transition is genuinely in force alone', () => {
    const healthy = selectActiveTimeline(withTransition())!
    const model = getEditorModel({
      ...DAMAGED(),
      timelines: [{ ...DAMAGED().timelines[0], clips: healthy.clips, transitions: healthy.transitions }],
    })
    expect(model.timelines[0].transitions ?? []).toHaveLength(1)
  })
})
