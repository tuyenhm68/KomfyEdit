import { extractVideoFrameToFile } from '../export/ffmpeg-utils'
import { extractAudioPeaks } from '../export/audio-peaks'
import { observeLoudness, observeSilence } from '../media-analyzer'
import { proxyManager } from '../export/proxy-manager'
import { renderCacheManager } from '../export/render-cache-manager'
import { getAllowedRoots } from '../config'
import { validatePath } from '../path-validation'
import { handle } from './typed-handle'

export function registerVideoProcessingHandlers(): void {
  proxyManager.init()
  renderCacheManager.init()

  handle('getAudioPeaks', async ({ filePath, buckets }) => {
    const normalizedPath = validatePath(filePath, getAllowedRoots())
    return extractAudioPeaks(normalizedPath, buckets)
  })

  handle('measureLoudness', async ({ filePath, startTime, duration }) => {
    const normalizedPath = validatePath(filePath, getAllowedRoots())
    return observeLoudness(normalizedPath, { startTime, duration })
  })

  handle('detectSilence', async ({ filePath, noiseDb, minDurationSec, startTime, duration }) => {
    const normalizedPath = validatePath(filePath, getAllowedRoots())
    return observeSilence(normalizedPath, { noiseDb, minDurationSec, startTime, duration })
  })

  handle('extractVideoFrame', async ({ videoPath, seekTime, width, quality }) => {
    return {
      path: extractVideoFrameToFile({
        videoPath,
        seekTime,
        width,
        quality: quality ?? 2,
        timeoutMs: 10000,
      }),
    }
  })

  handle('generateProxy', async ({ assetId, filePath }) => {
    const normalizedPath = validatePath(filePath, getAllowedRoots())
    const result = await proxyManager.enqueueProxy(assetId, normalizedPath)
    if (result.success) {
      return { success: true, proxyPath: result.proxyPath }
    }
    return { success: false, error: result.error || 'Failed to generate proxy' }
  })

  handle('cancelProxy', async ({ assetId }) => {
    proxyManager.cancelProxy(assetId)
    return { success: true }
  })

  handle('getProxyStatus', async ({ assetId }) => {
    const status = proxyManager.getProxyStatus(assetId)
    return status
  })

  handle('renderCacheCheck', async ({ hashes }) => {
    return renderCacheManager.checkHashes(hashes)
  })

  handle('renderCacheRequest', async (params) => {
    const result = await renderCacheManager.renderSegment(params)
    if (result.success) {
      return { success: true, cachePath: result.cachePath }
    }
    return { success: false, error: result.error || 'Failed to render cache segment' }
  })

  handle('renderCacheClear', async () => {
    const freedBytes = renderCacheManager.clearCache()
    return { success: true, freedBytes }
  })
}
