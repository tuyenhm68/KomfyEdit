import type { EffectType } from './project-model'

export interface EffectParamDef {
  min: number
  max: number
  step: number
  label: string
}

export interface EffectDefinition {
  name: string
  category: 'filter' | 'stylize' | 'color-preset'
  icon: string
  defaultParams: Record<string, number>
  paramRanges: Record<string, EffectParamDef>
}

export const EFFECT_DEFINITIONS: Record<EffectType, EffectDefinition> = {
  'blur': {
    name: 'Gaussian Blur',
    category: 'filter',
    icon: 'Droplets',
    defaultParams: { amount: 5 },
    paramRanges: { amount: { min: 0, max: 50, step: 0.5, label: 'Radius' } },
  },
  'sharpen': {
    name: 'Sharpen',
    category: 'filter',
    icon: 'Diamond',
    defaultParams: { amount: 50 },
    paramRanges: { amount: { min: 0, max: 100, step: 1, label: 'Amount' } },
  },
  'glow': {
    name: 'Glow',
    category: 'stylize',
    icon: 'Sun',
    defaultParams: { amount: 30, radius: 10 },
    paramRanges: {
      amount: { min: 0, max: 100, step: 1, label: 'Intensity' },
      radius: { min: 0, max: 50, step: 1, label: 'Radius' },
    },
  },
  'vignette': {
    name: 'Vignette',
    category: 'stylize',
    icon: 'Circle',
    defaultParams: { amount: 50 },
    paramRanges: { amount: { min: 0, max: 100, step: 1, label: 'Amount' } },
  },
  'grain': {
    name: 'Film Grain',
    category: 'stylize',
    icon: 'Scan',
    defaultParams: { amount: 30 },
    paramRanges: { amount: { min: 0, max: 100, step: 1, label: 'Amount' } },
  },
}

export { type TextPreset, TEXT_PRESETS } from './text-presets'
