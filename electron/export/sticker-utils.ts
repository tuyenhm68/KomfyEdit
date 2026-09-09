import path from 'path'
import fs from 'fs'
import { getStickerDefinition } from '../../core/src/stickers'

/**
 * Resolves the absolute path to a sticker image file.
 * Handles:
 * 1. Existing absolute or relative paths (user-imported stickers)
 * 2. Packaged process.resourcesPath/stickers
 * 3. Dev resources/stickers
 * 4. Dev public/stickers
 */
export function resolveStickerPath(stickerIdOrPath: string): string {
  if (fs.existsSync(stickerIdOrPath)) {
    return stickerIdOrPath
  }

  const def = getStickerDefinition(stickerIdOrPath)
  // Take the basename: a stored sticker path is `stickers/fire.png`, and
  // joining that onto the stickers directory would look for
  // `.../stickers/stickers/fire.png`.
  const bare = stickerIdOrPath.replace(/\\/g, '/').split('/').pop() || stickerIdOrPath
  const filename = def
    ? def.filename
    : bare.endsWith('.png') || bare.endsWith('.webp')
      ? bare
      : `${bare}.png`

  // 1. Packaged electron resources
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'stickers', filename)
    if (fs.existsSync(packagedPath)) return packagedPath
  }

  // 2. Dev resources/stickers
  const devResourcesPath = path.resolve(process.cwd(), 'resources', 'stickers', filename)
  if (fs.existsSync(devResourcesPath)) return devResourcesPath

  // 3. Dev public/stickers
  const publicPath = path.resolve(process.cwd(), 'public', 'stickers', filename)
  if (fs.existsSync(publicPath)) return publicPath

  return devResourcesPath
}
