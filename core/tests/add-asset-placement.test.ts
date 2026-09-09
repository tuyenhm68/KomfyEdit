import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { insertAssetsToTimeline } from '../src/editor-actions'
import { selectActiveTimeline } from '../src/editor-selectors'
import type { Asset, Timeline } from '../src/project-model'

/**
 * Where the Add button drops an asset.
 *
 * `position: 'start'` is opt-in rather than the default, because the MCP
 * `insert_clip` operation goes through the same action and agents rely on it
 * appending.
 */

function asset(id: string, duration: number): Asset {
  return {
    id,
    type: 'video',
    path: `/tmp/${id}.mp4`,
    prompt: '',
    resolution: '1920x1080',
    duration,
    createdAt: 0,
  }
}

const existing = asset('asset-existing', 10)
const added = asset('asset-added', 4)

function stateWithOneClipOnV1() {
  const timeline = {
    id: 'timeline-1',
    name: 'Timeline 1',
    createdAt: 0,
    tracks: [
      { id: 'track-v1', name: 'V1', muted: false, locked: false, sourcePatched: true, kind: 'video' },
    ],
    clips: [
      {
        id: 'clip-existing',
        assetId: existing.id,
        type: 'video',
        startTime: 0,
        duration: 10,
        trimStart: 0,
        trimEnd: 0,
        speed: 1,
        reversed: false,
        muted: false,
        volume: 1,
        trackIndex: 0,
        asset: existing,
        flipH: false,
        flipV: false,
        opacity: 100,
      },
    ],
    subtitles: [],
  } as unknown as Timeline

  return createInitialEditorState({
    assets: [existing, added],
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

describe('adding an asset to the main video track', () => {
  it("puts it in front of the existing edit with position 'start'", () => {
    const next = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [added],
      trackIndex: 0,
      position: 'start',
    })
    const clips = selectActiveTimeline(next)!.clips.filter(c => c.trackIndex === 0)

    expect(clips).toHaveLength(2)
    const byTime = [...clips].sort((a, b) => a.startTime - b.startTime)
    expect(byTime[0].assetId).toBe(added.id)
    expect(byTime[0].startTime).toBe(0)
  })

  it('pushes the existing clip later instead of trimming it', () => {
    const next = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [added],
      trackIndex: 0,
      position: 'start',
    })
    const clips = selectActiveTimeline(next)!.clips.filter(c => c.trackIndex === 0)
    const existingClip = clips.find(c => c.assetId === existing.id)!

    expect(existingClip.duration).toBe(10)
    expect(existingClip.startTime).toBeGreaterThan(0)
  })

  it('leaves no gap on the magnetic track', () => {
    const next = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [added],
      trackIndex: 0,
      position: 'start',
    })
    const byTime = selectActiveTimeline(next)!.clips
      .filter(c => c.trackIndex === 0)
      .sort((a, b) => a.startTime - b.startTime)

    expect(byTime[0].startTime).toBe(0)
    expect(byTime[1].startTime).toBe(byTime[0].duration)
  })

  it('keeps the existing clip even when the new one is longer than it', () => {
    // The bug this guards: resolveOverlaps drops any clip fully covered by the
    // inserted range, so adding a 12s asset in front of a 10s one deleted the
    // 10s clip instead of pushing it aside. Adding twice looked like the second
    // asset had replaced the first.
    const longer = asset('asset-longer', 12)
    const next = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [longer],
      trackIndex: 0,
      position: 'start',
    })
    const byTime = selectActiveTimeline(next)!.clips
      .filter(c => c.trackIndex === 0)
      .sort((a, b) => a.startTime - b.startTime)

    expect(byTime).toHaveLength(2)
    expect(byTime[0].assetId).toBe(longer.id)
    expect(byTime[1].assetId).toBe(existing.id)
    expect(byTime[1].duration).toBe(10)
  })

  it('keeps every clip when the same asset is added twice in a row', () => {
    // What the user actually did: click Add, click Add again. The second click
    // must land in front of the first, not on top of it.
    const first = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [added], trackIndex: 0, position: 'start',
    })
    const second = insertAssetsToTimeline(first, {
      assets: [added], trackIndex: 0, position: 'start',
    })

    const byTime = selectActiveTimeline(second)!.clips
      .filter(c => c.trackIndex === 0)
      .sort((a, b) => a.startTime - b.startTime)

    expect(byTime).toHaveLength(3)
    expect(byTime.map(c => c.assetId)).toEqual([added.id, added.id, existing.id])
    expect(byTime[0].startTime).toBe(0)
    expect(byTime[1].startTime).toBe(byTime[0].duration)
    expect(byTime[2].startTime).toBe(byTime[0].duration + byTime[1].duration)
  })

  it('still appends by default, which is what MCP insert_clip relies on', () => {
    const next = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [added],
      trackIndex: 0,
    })
    const byTime = selectActiveTimeline(next)!.clips
      .filter(c => c.trackIndex === 0)
      .sort((a, b) => a.startTime - b.startTime)

    expect(byTime[0].assetId).toBe(existing.id)
    expect(byTime[1].assetId).toBe(added.id)
  })

  it('honours an explicit startTime over the position hint', () => {
    const next = insertAssetsToTimeline(stateWithOneClipOnV1(), {
      assets: [added],
      trackIndex: 0,
      startTime: 10,
      position: 'start',
    })
    const byTime = selectActiveTimeline(next)!.clips
      .filter(c => c.trackIndex === 0)
      .sort((a, b) => a.startTime - b.startTime)

    expect(byTime[0].assetId).toBe(existing.id)
  })
})
