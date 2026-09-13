import path from 'path'
import fs from 'fs'
import { getSfxDefinition } from '../../core/src/sfx'

/**
 * Resolves the absolute path to an SFX audio file.
 * Handles:
 * 1. Existing absolute or relative paths
 * 2. Packaged process.resourcesPath/sfx
 * 3. Dev resources/sfx
 * 4. Dev public/sfx
 */
export function resolveSfxPath(sfxIdOrPath: string): string {
  if (fs.existsSync(sfxIdOrPath)) {
    return sfxIdOrPath
  }

  const def = getSfxDefinition(sfxIdOrPath)
  const bare = sfxIdOrPath.replace(/\\/g, '/').split('/').pop() || sfxIdOrPath
  const filename = def
    ? def.filename
    : bare.endsWith('.wav') || bare.endsWith('.mp3')
      ? bare
      : `${bare}.wav`

  // 1. Packaged electron resources
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'sfx', filename)
    if (fs.existsSync(packagedPath)) return packagedPath
  }

  // 2. Dev resources/sfx
  const devResourcesPath = path.resolve(process.cwd(), 'resources', 'sfx', filename)
  if (fs.existsSync(devResourcesPath)) return devResourcesPath

  // 3. Dev public/sfx
  const publicPath = path.resolve(process.cwd(), 'public', 'sfx', filename)
  if (fs.existsSync(publicPath)) return publicPath

  return devResourcesPath
}
