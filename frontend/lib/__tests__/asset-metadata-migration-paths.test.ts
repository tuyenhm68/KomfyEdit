import { describe, it, expect } from 'vitest'
import { hasVisualAssetMetadataForMigration } from '../project-asset-metadata-migration'
import type { Asset } from '../../types/project-model'

/**
 * Which assets are allowed to raise the "preparing project assets" screen.
 *
 * The upgrade pass runs in the main process, which only resolves absolute
 * paths. An asset it can never resolve must not be reported as needing
 * migration: the screen is shown whenever something looks unmigrated, so an
 * asset that can never finish leaves it up forever. Adding a sticker did
 * exactly that — `stickers/fire.png` is relative but has a separator, which
 * the old check accepted.
 */

function imageAsset(path: string, extra: Partial<Asset> = {}): Asset {
  return {
    id: `asset-${path}`,
    type: 'image',
    path,
    prompt: '',
    resolution: '512x512',
    createdAt: 0,
    ...extra,
  } as Asset
}

describe('hasVisualAssetMetadataForMigration', () => {
  it('ignores a sticker, whose path is relative and can never be resolved', () => {
    expect(hasVisualAssetMetadataForMigration([imageAsset('stickers/fire.png')])).toBe(false)
    expect(hasVisualAssetMetadataForMigration([imageAsset('stickers\\fire.png')])).toBe(false)
  })

  it('ignores any other relative path', () => {
    expect(hasVisualAssetMetadataForMigration([imageAsset('clip.png')])).toBe(false)
    expect(hasVisualAssetMetadataForMigration([imageAsset('./media/clip.png')])).toBe(false)
    expect(hasVisualAssetMetadataForMigration([imageAsset('../media/clip.png')])).toBe(false)
  })

  it('still picks up absolute paths that are genuinely missing metadata', () => {
    expect(hasVisualAssetMetadataForMigration([imageAsset('C:\\Users\\me\\clip.png')])).toBe(true)
    expect(hasVisualAssetMetadataForMigration([imageAsset('/home/me/clip.png')])).toBe(true)
    expect(hasVisualAssetMetadataForMigration([imageAsset('\\\\server\\share\\clip.png')])).toBe(true)
  })

  it('leaves an absolute asset alone once it has dimensions and thumbnails', () => {
    const complete = imageAsset('/home/me/clip.png', {
      width: 1920,
      height: 1080,
      bigThumbnailPath: '/home/me/.thumbs/big.jpg',
      smallThumbnailPath: '/home/me/.thumbs/small.jpg',
    })
    expect(hasVisualAssetMetadataForMigration([complete])).toBe(false)
  })
})
