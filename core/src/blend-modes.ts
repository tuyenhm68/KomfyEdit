import { z } from 'zod'

export const clipBlendModeSchema = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'add',
  'difference',
])

export type ClipBlendMode = z.infer<typeof clipBlendModeSchema>

export interface BlendModeDefinition {
  id: ClipBlendMode
  label: string
  cssMixBlendMode: string
  ffmpegBlendMode: string
}

export const BLEND_MODE_DEFINITIONS: Record<ClipBlendMode, BlendModeDefinition> = {
  normal: {
    id: 'normal',
    label: 'Normal (Bình thường)',
    cssMixBlendMode: 'normal',
    ffmpegBlendMode: 'normal',
  },
  multiply: {
    id: 'multiply',
    label: 'Multiply (Nhân)',
    cssMixBlendMode: 'multiply',
    ffmpegBlendMode: 'multiply',
  },
  screen: {
    id: 'screen',
    label: 'Screen (Lọc sáng)',
    cssMixBlendMode: 'screen',
    ffmpegBlendMode: 'screen',
  },
  overlay: {
    id: 'overlay',
    label: 'Overlay (Chồng phủ)',
    cssMixBlendMode: 'overlay',
    ffmpegBlendMode: 'overlay',
  },
  add: {
    id: 'add',
    label: 'Add (Cộng sáng)',
    cssMixBlendMode: 'plus-lighter',
    ffmpegBlendMode: 'addition',
  },
  difference: {
    id: 'difference',
    label: 'Difference (Khác biệt)',
    cssMixBlendMode: 'difference',
    ffmpegBlendMode: 'difference',
  },
}

export const BLEND_MODES: BlendModeDefinition[] = Object.values(BLEND_MODE_DEFINITIONS)

export function getBlendModeDefinition(mode: string | undefined | null): BlendModeDefinition {
  if (!mode || !(mode in BLEND_MODE_DEFINITIONS)) {
    return BLEND_MODE_DEFINITIONS.normal
  }
  return BLEND_MODE_DEFINITIONS[mode as ClipBlendMode]
}

export function ffmpegBlendModeFor(mode: string | undefined | null): string {
  return getBlendModeDefinition(mode).ffmpegBlendMode
}

export function cssMixBlendModeFor(mode: string | undefined | null): string {
  return getBlendModeDefinition(mode).cssMixBlendMode
}
