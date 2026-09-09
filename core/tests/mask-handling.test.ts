import { describe, it, expect } from 'vitest'
import { timelineClipSchema } from '../src/project-model'
import { getClipEffectStyles } from '../src/video-editor-utils'

describe('KE-106: Mask fate resolution & consistency', () => {
  it('parses legacy clip with effect mask without throwing Zod errors', () => {
    const legacyClipJson = {
      id: 'clip-with-mask',
      assetId: 'asset-1',
      asset: null,
      type: 'video',
      startTime: 0,
      duration: 5,
      trimStart: 0,
      trimEnd: 0,
      trackIndex: 0,
      effects: [
        {
          id: 'fx-masked-blur',
          type: 'blur',
          enabled: true,
          params: { amount: 15 },
          mask: {
            enabled: true,
            shape: 'ellipse',
            x: 50,
            y: 50,
            width: 40,
            height: 40,
            feather: 20,
            invert: false,
            rotation: 0,
          },
        },
      ],
    }

    const parsed = timelineClipSchema.parse(legacyClipJson)
    expect(parsed.effects?.length).toBe(1)
    expect(parsed.effects?.[0].mask?.enabled).toBe(true)
  })

  it('renders effect styles in preview even if mask.enabled is true to match export', () => {
    const clipWithMaskedEffect = {
      id: 'clip-masked-effect',
      assetId: 'asset-1',
      asset: null,
      type: 'video',
      startTime: 0,
      duration: 5,
      trimStart: 0,
      trimEnd: 0,
      trackIndex: 0,
      effects: [
        {
          id: 'fx-blur-1',
          type: 'blur' as const,
          enabled: true,
          params: { amount: 12 },
          mask: {
            enabled: true,
            shape: 'ellipse' as const,
            x: 50,
            y: 50,
            width: 30,
            height: 30,
            feather: 10,
            invert: false,
            rotation: 0,
          },
        },
      ],
    }

    const styles = getClipEffectStyles(clipWithMaskedEffect as any)
    // Previously, fx.mask?.enabled caused continue, so blur was missing from preview!
    // Now preview applies the effect to the whole clip, matching export.
    expect(styles.filter).toBeDefined()
    expect(styles.filter).toContain('blur(12px)')
  })
})
