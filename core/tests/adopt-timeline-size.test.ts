import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { addAssetToEditor, adoptTimelineSizeFromAsset } from '../src/editor-actions'
import { selectActiveTimeline } from '../src/editor-selectors'
import type { Asset, Timeline } from '../src/project-model'

/**
 * A new project takes its shape from the first video imported into it, and
 * keeps it: without this the preview only guessed, from whichever asset in the
 * project happened to be largest, so importing a bigger clip later flipped the
 * canvas from portrait to landscape.
 */

function video(id: string, width: number, height: number): Asset {
  return {
    id,
    type: 'video',
    path: `C:\\Users\\me\\${id}.mp4`,
    prompt: '',
    resolution: 'imported',
    width,
    height,
    duration: 10,
    createdAt: 0,
  }
}

function newProject(assets: Asset[] = [], size?: { width: number; height: number }) {
  const timeline = {
    id: 'timeline-1',
    name: 'Timeline 1',
    tracks: [{ id: 'track-0', name: 'V1', kind: 'video', locked: false, muted: false, hidden: false, height: 60 }],
    clips: [],
    subtitles: [],
    ...(size ?? {}),
  } as unknown as Timeline

  return createInitialEditorState({
    assets,
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

const portrait = video('asset-portrait', 1080, 1920)

describe('adoptTimelineSizeFromAsset', () => {
  it('gives a fresh project the first video\'s size', () => {
    const state = adoptTimelineSizeFromAsset(addAssetToEditor(newProject(), portrait), portrait)
    const timeline = selectActiveTimeline(state)!

    expect(timeline.width).toBe(1080)
    expect(timeline.height).toBe(1920)
  })

  it('leaves a project that already has a size alone', () => {
    const sized = newProject([], { width: 1920, height: 1080 })
    const state = adoptTimelineSizeFromAsset(addAssetToEditor(sized, portrait), portrait)
    const timeline = selectActiveTimeline(state)!

    expect(timeline.width).toBe(1920)
    expect(timeline.height).toBe(1080)
  })

  it('does nothing for the second video, however big it is', () => {
    const uhd = video('asset-uhd', 3840, 2160)
    let state = adoptTimelineSizeFromAsset(addAssetToEditor(newProject(), portrait), portrait)
    state = adoptTimelineSizeFromAsset(addAssetToEditor(state, uhd), uhd)

    expect(selectActiveTimeline(state)!.width).toBe(1080)
    expect(selectActiveTimeline(state)!.height).toBe(1920)
  })

  it('ignores images and audio — only footage sets the canvas', () => {
    const image = { ...portrait, id: 'asset-image', type: 'image' as const }
    const state = adoptTimelineSizeFromAsset(addAssetToEditor(newProject(), image), image)

    expect(selectActiveTimeline(state)!.width).toBeUndefined()
  })

  it('ignores a video whose size was never measured', () => {
    const unmeasured = { ...portrait, width: undefined, height: undefined }
    const state = adoptTimelineSizeFromAsset(addAssetToEditor(newProject(), unmeasured), unmeasured)

    expect(selectActiveTimeline(state)!.width).toBeUndefined()
  })
})
