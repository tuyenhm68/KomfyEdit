import path from 'path'
import fs from 'fs'

export interface ExportClipFilter {
  id: string
  intensity?: number
}

/**
 * Escapes a file path for ffmpeg filter arguments on Windows and POSIX.
 * On Windows, drive colons (e.g. C:) must be escaped as '\\:' and
 * backslashes replaced with forward slashes.
 */
export function escapeFfmpegLutPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\\\:')
}

/**
 * Resolves the absolute path to a .cube LUT file by filter id.
 * Checks:
 * 1. Packaged process.resourcesPath/luts
 * 2. Dev resources/luts
 * 3. Dev public/luts
 */
export function resolveLutPath(filterId: string): string {
  // If filterId already ends in .cube or is an absolute path that exists
  if (filterId.endsWith('.cube') && fs.existsSync(filterId)) {
    return filterId
  }

  const filename = filterId.endsWith('.cube') ? filterId : `${filterId}.cube`

  // 1. Packaged electron resources
  if (process.resourcesPath) {
    const packagedPath = path.join(process.resourcesPath, 'luts', filename)
    if (fs.existsSync(packagedPath)) return packagedPath
  }

  // 2. Dev resources/luts
  const devResourcesPath = path.resolve(process.cwd(), 'resources', 'luts', filename)
  if (fs.existsSync(devResourcesPath)) return devResourcesPath

  // 3. Dev public/luts
  const publicLutsPath = path.resolve(process.cwd(), 'public', 'luts', filename)
  if (fs.existsSync(publicLutsPath)) return publicLutsPath

  return devResourcesPath
}

/**
 * Builds the ffmpeg filter string for a 3D LUT filter.
 * Returns empty string if filter is absent, neutral, or disabled.
 */
export function buildLutFilter(filter?: ExportClipFilter): string {
  if (!filter || !filter.id) return ''
  const intensity = filter.intensity ?? 100
  if (intensity <= 0) return ''

  const lutPath = resolveLutPath(filter.id)
  const escaped = escapeFfmpegLutPath(lutPath)

  // Standard ffmpeg lut3d with trilinear interpolation
  // (matches core/src/lut.ts and WebGL2 preview shader)
  return `,lut3d=file=${escaped}:interp=trilinear`
}
