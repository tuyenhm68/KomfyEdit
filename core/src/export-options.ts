export type ExportFormatType = 'video' | 'gif' | 'audio'

export type VideoCodec = 'h264' | 'prores' | 'vp9'
export type AudioCodec = 'wav' | 'mp3' | 'aac'
export type ExportCodec = VideoCodec | 'gif' | AudioCodec

export interface SocialPreset {
  id: string
  name: string
  platform: string
  aspectRatio: string
  width: number
  height: number
  fps: number
  bitrateMbps: number
  description: string
}

export const SOCIAL_PRESETS: SocialPreset[] = [
  {
    id: 'tiktok-reels-shorts',
    name: 'Vertical 9:16 (TikTok / Reels / Shorts)',
    platform: 'TikTok, Instagram Reels, YouTube Shorts',
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    fps: 30,
    bitrateMbps: 8,
    description: '1080×1920, 30 fps, 8 Mbps — Tối ưu cho video ngắn trên di động',
  },
  {
    id: 'instagram-square',
    name: 'Square 1:1 (Instagram Post)',
    platform: 'Instagram Feed, Square Posts',
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    fps: 30,
    bitrateMbps: 6,
    description: '1080×1080, 30 fps, 6 Mbps — Chuẩn vuông cho bài đăng trang cá nhân',
  },
  {
    id: 'youtube-fhd',
    name: 'Landscape 16:9 (YouTube / Web FHD)',
    platform: 'YouTube, Facebook Video, Web',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 10,
    description: '1920×1080, 30 fps, 10 Mbps — Chuẩn Full HD phổ biến nhất',
  },
]

export interface ExportFormatInfo {
  id: ExportCodec
  type: ExportFormatType
  label: string
  ext: string
  description: string
  filterName: string
}

export const EXPORT_FORMATS: Record<ExportCodec, ExportFormatInfo> = {
  h264: {
    id: 'h264',
    type: 'video',
    label: 'H.264 / MP4',
    ext: 'mp4',
    description: 'Most compatible format',
    filterName: 'MP4 Video',
  },
  prores: {
    id: 'prores',
    type: 'video',
    label: 'ProRes / MOV',
    ext: 'mov',
    description: 'Professional editing format',
    filterName: 'QuickTime Movie',
  },
  vp9: {
    id: 'vp9',
    type: 'video',
    label: 'VP9 / WebM',
    ext: 'webm',
    description: 'Web-optimized format',
    filterName: 'WebM Video',
  },
  gif: {
    id: 'gif',
    type: 'gif',
    label: 'GIF Animation',
    ext: 'gif',
    description: 'High-quality animated GIF (palettegen/paletteuse)',
    filterName: 'GIF Animation',
  },
  wav: {
    id: 'wav',
    type: 'audio',
    label: 'WAV Audio (Lossless PCM)',
    ext: 'wav',
    description: 'Uncompressed master 16-bit 48kHz stereo',
    filterName: 'WAV Audio',
  },
  mp3: {
    id: 'mp3',
    type: 'audio',
    label: 'MP3 Audio (320 kbps)',
    ext: 'mp3',
    description: 'Standard compressed MP3 audio',
    filterName: 'MP3 Audio',
  },
  aac: {
    id: 'aac',
    type: 'audio',
    label: 'AAC Audio (256 kbps)',
    ext: 'aac',
    description: 'Modern high-quality AAC audio',
    filterName: 'AAC Audio',
  },
}

export interface EstimateFileSizeParams {
  durationSec: number
  codec: ExportCodec
  width?: number
  height?: number
  fps?: number
  quality?: number // CRF for h264, profile for prores (0-3), mbps for vp9
  customBitrateMbps?: number
}

/**
 * Pure function: Calculate estimated export file size in bytes based on duration, codec, resolution, and bitrate.
 */
export function estimateExportFileSize({
  durationSec,
  codec,
  width = 1920,
  height = 1080,
  fps = 30,
  quality = 18,
  customBitrateMbps,
}: EstimateFileSizeParams): number {
  if (durationSec <= 0) return 0

  // 1. Audio-only formats
  if (codec === 'wav') {
    // 48kHz, 16-bit, 2 channels = 192 KB/s
    const bytesPerSec = 48000 * 2 * 2
    return Math.round(durationSec * bytesPerSec)
  }

  if (codec === 'mp3') {
    // Standard 320 kbps = 40 KB/s
    const bytesPerSec = (320 * 1000) / 8
    return Math.round(durationSec * bytesPerSec)
  }

  if (codec === 'aac') {
    // Standard 256 kbps = 32 KB/s
    const bytesPerSec = (256 * 1000) / 8
    return Math.round(durationSec * bytesPerSec)
  }

  // 2. GIF format
  if (codec === 'gif') {
    // GIF with 256 colors palette typically uses ~0.15 - 0.25 bytes per pixel per frame (with LZW compression)
    const pixelsPerFrame = width * height
    const totalFrames = durationSec * (fps || 15)
    // ~0.2 bytes per pixel per frame on average with palette dithering
    const estimatedBytes = totalFrames * pixelsPerFrame * 0.18
    return Math.round(Math.max(1024, estimatedBytes))
  }

  // 3. ProRes video
  if (codec === 'prores') {
    // ProRes approximate bitrates at 1080p 29.97fps:
    // Profile 0 (Proxy): ~45 Mbps
    // Profile 1 (LT): ~102 Mbps
    // Profile 2 (Standard): ~147 Mbps
    // Profile 3 (HQ): ~220 Mbps
    const proresBaseMbpsMap: Record<number, number> = {
      0: 45,
      1: 102,
      2: 147,
      3: 220,
    }
    const baseProfile = typeof quality === 'number' && quality in proresBaseMbpsMap ? quality : 3
    const baseMbps = proresBaseMbpsMap[baseProfile]
    const pixelRatio = (width * height * fps) / (1920 * 1080 * 30)
    const scaledMbps = Math.max(5, baseMbps * pixelRatio)
    // Audio PCM adds ~1.5 Mbps
    const totalMbps = scaledMbps + 1.5
    return Math.round((totalMbps * 1_000_000 * durationSec) / 8)
  }

  // 4. VP9 video
  if (codec === 'vp9') {
    const videoMbps = customBitrateMbps && customBitrateMbps > 0 ? customBitrateMbps : (quality || 8)
    const audioMbps = 0.128 // 128k opus
    const totalMbps = videoMbps + audioMbps
    return Math.round((totalMbps * 1_000_000 * durationSec) / 8)
  }

  // 5. H.264 video
  if (customBitrateMbps && customBitrateMbps > 0) {
    const audioMbps = 0.192 // 192k aac
    const totalMbps = customBitrateMbps + audioMbps
    return Math.round((totalMbps * 1_000_000 * durationSec) / 8)
  }

  // CRF-based estimation for H.264
  // CRF 18 ≈ 0.15 bpp, CRF 23 ≈ 0.08 bpp, CRF 28 ≈ 0.04 bpp
  const crf = Math.max(15, Math.min(32, quality || 18))
  // Exponential model: bitrate roughly halves every 6 CRF steps
  const baseBppAtCrf18 = 0.15
  const bpp = baseBppAtCrf18 * Math.pow(2, (18 - crf) / 6)
  const videoBitsPerSec = width * height * fps * bpp
  const audioBitsPerSec = 192_000 // 192 kbps AAC
  const totalBytes = ((videoBitsPerSec + audioBitsPerSec) * durationSec) / 8
  return Math.round(totalBytes)
}

/**
 * Format bytes into human-readable string (KB, MB, GB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}
