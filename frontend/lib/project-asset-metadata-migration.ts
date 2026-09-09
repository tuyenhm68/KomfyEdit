import type { ElectronAPI } from '../../shared/electron-api-schema'
import type { Asset } from '../types/project-model'
import { logger } from './logger'

interface VisualAssetMetadataMigrationJob {
  path: string
  type: 'video' | 'image'
  needsThumbnails: boolean
  needsDimensions: boolean
}

interface ThumbnailPaths {
  bigThumbnailPath: string
  smallThumbnailPath: string
}

interface VisualAssetDimensions {
  width: number
  height: number
}

interface VisualAssetMigrationResult extends Partial<ThumbnailPaths>, Partial<VisualAssetDimensions> {}

export interface VisualAssetMetadataMigrationUpdate {
  assetId: string
  updates: Partial<Asset>
}

export type VisualAssetMetadataMigrationEvent =
  | {
      kind: 'progress'
      total: number
      completed: number
    }
  | {
      kind: 'complete'
      total: number
      completed: number
      updates: VisualAssetMetadataMigrationUpdate[]
    }

function isVisualAsset(asset: Asset): asset is Asset & { type: 'video' | 'image' } {
  return asset.type === 'video' || asset.type === 'image'
}

function isMissingThumbnailPair(item: { bigThumbnailPath?: string; smallThumbnailPath?: string }): boolean {
  return !item.bigThumbnailPath || !item.smallThumbnailPath
}

function isMissingDimensions(item: { width?: number; height?: number }): boolean {
  return !item.width || !item.height
}

/**
 * A video measured before the display matrix was taken into account.
 *
 * Import used to record the stream size, so a phone clip filmed upright was
 * stored as landscape — the project opened in the wrong shape and the
 * transform handles boxed the wrong rectangle. Such an asset has dimensions,
 * they are simply the wrong ones, so it needs re-measuring exactly once; the
 * flag the pass writes back keeps it from happening again.
 */
function needsRotationRecheck(asset: Asset): boolean {
  return asset.type === 'video' && !asset.rotationChecked
}

/**
 * The main process only accepts absolute paths, so anything relative can never
 * be migrated — no amount of retrying will resolve it. Treating such an asset
 * as migratable keeps the "needs migration" flag stuck on forever, which puts
 * the project screen into a loop it cannot leave.
 *
 * Looking for a separator was not enough. A sticker is stored as
 * `stickers/fire.png`: relative, but it has a separator, so adding one hung the
 * app on the "preparing project assets" screen. Require a genuinely absolute
 * path instead — a POSIX leading slash, a Windows drive letter, or a UNC share.
 */
function isMigratablePath(assetPath: string): boolean {
  return assetPath.startsWith('/')
    || /^[a-zA-Z]:[\\/]/.test(assetPath)
    || assetPath.startsWith('\\\\')
}

function collectVisualAssetMetadataMigrationJobs(assets: Asset[]): VisualAssetMetadataMigrationJob[] {
  const jobs = new Map<string, VisualAssetMetadataMigrationJob>()

  for (const asset of assets) {
    if (!isVisualAsset(asset)) continue

    const needsDimensions = isMissingDimensions(asset) || needsRotationRecheck(asset)
    if (asset.path && isMigratablePath(asset.path) && (isMissingThumbnailPair(asset) || needsDimensions)) {
      const existingJob = jobs.get(asset.path)
      jobs.set(asset.path, {
        path: asset.path,
        type: asset.type,
        needsThumbnails: (existingJob?.needsThumbnails || false) || isMissingThumbnailPair(asset),
        needsDimensions: (existingJob?.needsDimensions || false) || needsDimensions,
      })
    }
  }

  return Array.from(jobs.values())
}

function buildVisualAssetMetadataMigrationPatch(
  asset: Asset,
  migrationResults: Map<string, VisualAssetMigrationResult>,
): Partial<Asset> | null {
  if (!isVisualAsset(asset)) {
    return null
  }

  const updates: Partial<Asset> = {}
  const assetMetadata = migrationResults.get(asset.path)

  if (assetMetadata?.bigThumbnailPath && asset.bigThumbnailPath !== assetMetadata.bigThumbnailPath) {
    updates.bigThumbnailPath = assetMetadata.bigThumbnailPath
  }
  if (assetMetadata?.smallThumbnailPath && asset.smallThumbnailPath !== assetMetadata.smallThumbnailPath) {
    updates.smallThumbnailPath = assetMetadata.smallThumbnailPath
  }
  if (assetMetadata?.width && asset.width !== assetMetadata.width) {
    updates.width = assetMetadata.width
  }
  if (assetMetadata?.height && asset.height !== assetMetadata.height) {
    updates.height = assetMetadata.height
  }
  // Measured with the display matrix applied, whether or not that changed the
  // numbers — so this video is never re-measured again.
  if (asset.type === 'video' && assetMetadata?.width && assetMetadata?.height && !asset.rotationChecked) {
    updates.rotationChecked = true
  }

  return Object.keys(updates).length > 0 ? updates : null
}

export function hasVisualAssetMetadataForMigration(assets: Asset[]): boolean {
  return assets.some(asset => {
    if (!isVisualAsset(asset)) return false
    if (!asset.path || !isMigratablePath(asset.path)) return false
    return isMissingThumbnailPair(asset) || isMissingDimensions(asset) || needsRotationRecheck(asset)
  })
}

export async function* runVisualAssetMetadataMigration(
  assets: Asset[],
  electronAPI: Pick<ElectronAPI, 'makeThumbnailsForProjectAsset' | 'makeDimensionsForProjectAsset'>,
): AsyncGenerator<VisualAssetMetadataMigrationEvent> {
  const jobs = collectVisualAssetMetadataMigrationJobs(assets)

  if (jobs.length === 0) {
    yield {
      kind: 'complete',
      total: 0,
      completed: 0,
      updates: [],
    }
    return
  }

  yield {
    kind: 'progress',
    total: jobs.length,
    completed: 0,
  }

  const migrationResults = new Map<string, VisualAssetMigrationResult>()
  let completed = 0

  for (const job of jobs) {
    try {
      const nextResult: VisualAssetMigrationResult = {}

      if (job.needsThumbnails) {
        const thumbnailResult = await electronAPI.makeThumbnailsForProjectAsset({
          path: job.path,
          type: job.type,
        })
        if (thumbnailResult.success) {
          nextResult.bigThumbnailPath = thumbnailResult.bigThumbnailPath
          nextResult.smallThumbnailPath = thumbnailResult.smallThumbnailPath
        } else {
          logger.warn(`Thumbnail migration skipped for ${job.path}: ${thumbnailResult.error}`)
        }
      }

      if (job.needsDimensions) {
        const dimensionsResult = await electronAPI.makeDimensionsForProjectAsset({
          path: job.path,
          type: job.type,
        })
        if (dimensionsResult.success) {
          nextResult.width = dimensionsResult.width
          nextResult.height = dimensionsResult.height
        } else {
          logger.warn(`Dimensions migration skipped for ${job.path}: ${dimensionsResult.error}`)
        }
      }

      if (Object.keys(nextResult).length > 0) {
        migrationResults.set(job.path, nextResult)
      }
    } catch (error) {
      logger.warn(`Asset metadata migration skipped for ${job.path}: ${error}`)
    }

    completed += 1
    yield {
      kind: 'progress',
      total: jobs.length,
      completed,
    }
  }

  const updates: VisualAssetMetadataMigrationUpdate[] = []
  for (const asset of assets) {
    const assetUpdates = buildVisualAssetMetadataMigrationPatch(asset, migrationResults)
    if (assetUpdates) {
      updates.push({
        assetId: asset.id,
        updates: assetUpdates,
      })
    }
  }

  yield {
    kind: 'complete',
    total: jobs.length,
    completed,
    updates,
  }
}
