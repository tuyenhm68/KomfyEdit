import { describe, it, expect } from 'vitest'
import {
  hasVisualAssetMetadataForMigration,
  runVisualAssetMetadataMigration,
} from '../project-asset-metadata-migration'
import type { Asset } from '../../types/project-model'

/**
 * Videos imported before the display matrix was honoured carry the stream size
 * rather than the size a player shows, so a phone clip filmed upright reads as
 * landscape. They already have dimensions, so the old "is anything missing"
 * test left them alone. They are re-measured once and flagged, so opening a
 * project does not re-probe every video for ever.
 */

function videoAsset(extra: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-video',
    type: 'video',
    path: 'C:\\Users\\me\\IMG_4665.MOV',
    prompt: '',
    resolution: 'imported',
    width: 1920,
    height: 1080,
    bigThumbnailPath: 'C:\\thumbs\\big.jpg',
    smallThumbnailPath: 'C:\\thumbs\\small.jpg',
    createdAt: 0,
    ...extra,
  } as Asset
}

function fakeElectronAPI(dimensions: { width: number; height: number }) {
  const calls: string[] = []
  return {
    calls,
    api: {
      makeThumbnailsForProjectAsset: async () => ({ success: false as const, error: 'not asked' }),
      makeDimensionsForProjectAsset: async ({ path }: { path: string }) => {
        calls.push(path)
        return { success: true as const, ...dimensions }
      },
    } as any,
  }
}

async function collectUpdates(assets: Asset[], api: any) {
  for await (const event of runVisualAssetMetadataMigration(assets, api)) {
    if (event.kind === 'complete') return event.updates
  }
  return []
}

describe('one-time rotation re-measure', () => {
  it('flags an unchecked video even though it has dimensions and thumbnails', () => {
    expect(hasVisualAssetMetadataForMigration([videoAsset()])).toBe(true)
  })

  it('leaves a checked video alone', () => {
    expect(hasVisualAssetMetadataForMigration([videoAsset({ rotationChecked: true })])).toBe(false)
  })

  it('never re-measures an image, which has no display matrix to miss', () => {
    const image = videoAsset({ id: 'asset-image', type: 'image', path: 'C:\\Users\\me\\shot.png' })
    expect(hasVisualAssetMetadataForMigration([image])).toBe(false)
  })

  it('turns a landscape record into the portrait size the player shows', async () => {
    const { api, calls } = fakeElectronAPI({ width: 1080, height: 1920 })
    const updates = await collectUpdates([videoAsset()], api)

    expect(calls).toHaveLength(1)
    expect(updates).toEqual([
      { assetId: 'asset-video', updates: { width: 1080, height: 1920, rotationChecked: true } },
    ])
  })

  it('flags a video whose size was right all along, so it is measured only once', async () => {
    const { api } = fakeElectronAPI({ width: 1920, height: 1080 })
    const updates = await collectUpdates([videoAsset()], api)

    expect(updates).toEqual([{ assetId: 'asset-video', updates: { rotationChecked: true } }])
  })
})
