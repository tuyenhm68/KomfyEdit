// Resolution tier options for local retake/extend. Offers the source resolution plus
// standard lower tiers (named by short edge: 1080p / 720p / 540p). Grid sizes such as
// 576/704/1088 map to the nearest named tier. The backend snaps the chosen size to a
// valid (÷32, not-upscaled) resolution. Local only — the cloud preserves source resolution.

export interface ResolutionOption {
  key: string
  label: string
  // null = "Original" (backend uses the source resolution, still ÷32-corrected).
  width: number | null
  height: number | null
}

const STANDARD_TIERS = [1080, 720, 540]
const NAMED_TIERS = [2160, 1440, 1080, 720, 540] as const

/** Map a pixel short-edge (incl. /64 grid sizes like 576, 704, 1088) to the picker tier name. */
export function namedResolutionTier(shortEdge: number): (typeof NAMED_TIERS)[number] {
  return NAMED_TIERS.reduce((best, tier) =>
    Math.abs(tier - shortEdge) < Math.abs(best - shortEdge) ? tier : best,
  )
}

export function namedResolutionDisplayName(tier: number): string {
  return tier >= 2160 ? '4K' : `${tier}p`
}

export function resolutionOptions(width: number, height: number): ResolutionOption[] {
  if (!width || !height) return []
  const shortEdge = Math.min(width, height)
  const longEdge = Math.max(width, height)
  const portrait = height > width

  const originalTier = namedResolutionTier(shortEdge)

  const options: ResolutionOption[] = [
    { key: 'original', label: `${originalTier}p (Original)`, width: null, height: null },
  ]
  for (const tier of STANDARD_TIERS) {
    // Only smaller tiers, and drop the one that already maps to Original.
    if (tier >= shortEdge || tier === originalTier) continue
    const long = Math.round((longEdge * tier) / shortEdge)
    options.push({
      key: String(tier),
      label: `${tier}p`,
      width: portrait ? tier : long,
      height: portrait ? long : tier,
    })
  }
  return options
}

export interface TimelinePreset {
  id: string
  name: string
  aspectRatioLabel: string
  width: number
  height: number
  description?: string
}

export const TIMELINE_PRESETS: TimelinePreset[] = [
  { id: '16-9-1080p', name: '16:9 Landscape (1080p)', aspectRatioLabel: '16:9', width: 1920, height: 1080, description: 'YouTube, TV, Web (FHD)' },
  { id: '9-16-1080p', name: '9:16 Vertical (1080p)', aspectRatioLabel: '9:16', width: 1080, height: 1920, description: 'TikTok, Reels, Shorts' },
  { id: '1-1-1080p', name: '1:1 Square', aspectRatioLabel: '1:1', width: 1080, height: 1080, description: 'Instagram, Square Posts' },
  { id: '4-5-1080p', name: '4:5 Portrait', aspectRatioLabel: '4:5', width: 1080, height: 1350, description: 'Instagram Feed' },
  { id: '16-9-4k', name: '16:9 4K UHD', aspectRatioLabel: '16:9', width: 3840, height: 2160, description: 'Ultra HD' },
  { id: '16-9-720p', name: '16:9 720p HD', aspectRatioLabel: '16:9', width: 1280, height: 720, description: 'HD' },
  { id: '9-16-720p', name: '9:16 Vertical 720p', aspectRatioLabel: '9:16', width: 720, height: 1280, description: 'Vertical HD' },
]

export interface TimelineDimensions {
  width: number
  height: number
  fps: number
  aspectRatio: number
  aspectRatioLabel: string
  isDefault: boolean
}

export function formatAspectRatio(width: number, height: number): string {
  if (!width || !height) return '16:9'
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height)
  const rw = width / divisor
  const rh = height / divisor

  // Match standard common ratios
  const ratio = width / height
  if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9'
  if (Math.abs(ratio - 9 / 16) < 0.01) return '9:16'
  if (Math.abs(ratio - 1) < 0.01) return '1:1'
  if (Math.abs(ratio - 4 / 5) < 0.01) return '4:5'
  if (Math.abs(ratio - 21 / 9) < 0.05 || Math.abs(ratio - 64 / 27) < 0.01) return '21:9'
  if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3'

  return `${rw}:${rh}`
}

export function getEffectiveTimelineDimensions(
  timeline?: { width?: number; height?: number; fps?: number; [key: string]: unknown } | null,
  assets?: { width?: number; height?: number; [key: string]: unknown }[] | null,
  defaultFps = 30,
): TimelineDimensions {
  const fps = timeline?.fps ?? defaultFps

  if (timeline?.width && timeline?.height) {
    return {
      width: timeline.width,
      height: timeline.height,
      fps,
      aspectRatio: timeline.width / timeline.height,
      aspectRatioLabel: formatAspectRatio(timeline.width, timeline.height),
      isDefault: false,
    }
  }

  // Fallback for legacy projects without width/height: derive from largest media asset
  const sized = (assets || []).filter(a => a.width && a.height && a.width > 0 && a.height > 0)
  if (sized.length > 0) {
    const largest = sized.reduce((best, a) => (a.width! * a.height! > best.width! * best.height! ? a : best))
    return {
      width: largest.width!,
      height: largest.height!,
      fps,
      aspectRatio: largest.width! / largest.height!,
      aspectRatioLabel: formatAspectRatio(largest.width!, largest.height!),
      isDefault: true,
    }
  }

  // Default 1080p 16:9
  return {
    width: 1920,
    height: 1080,
    fps,
    aspectRatio: 16 / 9,
    aspectRatioLabel: '16:9',
    isDefault: true,
  }
}

