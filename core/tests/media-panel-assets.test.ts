import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { addStickerClip } from '../src/editor-actions'
import { selectAssets, selectVisibleAssets } from '../src/editor-selectors'
import type { Asset, Timeline } from '../src/project-model'

/**
 * The media panel lists what the user imported from their machine, nothing
 * else. Adding a sticker used to leave a blank tile there, because the sticker
 * clip's asset went into the same list as imported files.
 */

const filters = {
  assetFilter: 'all' as const,
  selectedBinId: null,
  assetViewMode: 'grid' as const,
  listSortCol: 'name' as const,
  listSortDir: 'asc' as const,
}

const imported: Asset = {
  id: 'asset-imported',
  type: 'video',
  path: 'C:/Users/me/Downloads/clip.mp4',
  prompt: '',
  resolution: '1920x1080',
  duration: 12,
  createdAt: 0,
}

function stateWith(assets: Asset[]) {
  const timeline = {
    id: 'timeline-1',
    name: 'Timeline 1',
    tracks: [{ id: 'track-0', name: 'V1', kind: 'video', locked: false, muted: false, hidden: false, height: 60 }],
    clips: [],
    subtitles: [],
  } as unknown as Timeline

  return createInitialEditorState({
    assets,
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

describe('media panel asset list', () => {
  it('hides the asset a sticker brings with it', () => {
    const state = addStickerClip(stateWith([imported]), { stickerId: 'fire' })

    // The clip still resolves through the model...
    expect(selectAssets(state).some(a => a.source === 'sticker')).toBe(true)
    // ...but the panel only offers what the user imported.
    expect(selectVisibleAssets(state, filters).map(a => a.id)).toEqual(['asset-imported'])
  })

  it('hides sticker assets saved before the source field existed', () => {
    const legacy: Asset = {
      id: 'asset-sticker-legacy',
      type: 'image',
      path: 'stickers/fire.png',
      prompt: 'Sticker: Fire',
      resolution: '512x512',
      duration: 3,
      createdAt: 0,
    }
    const state = stateWith([imported, legacy])

    expect(selectVisibleAssets(state, filters).map(a => a.id)).toEqual(['asset-imported'])
  })
})
