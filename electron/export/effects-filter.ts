export interface ExportClipEffect {
  type: string
  enabled: boolean
  params: Record<string, number>
}

/**
 * Map one editor effect onto ffmpeg filters.
 *
 * The editor's effect params are all 0..100 sliders, so each case rescales them
 * into whatever range the underlying filter expects. Returns an empty string for
 * effects with no meaningful strength so a neutral slider costs nothing.
 */
function effectToFilters(effect: ExportClipEffect): string[] {
  const p = effect.params ?? {}
  const amount = p.amount ?? 0
  const intensity = (p.intensity ?? 100) / 100

  switch (effect.type) {
    case 'blur': {
      // `amount` is a radius in editor units; gblur sigma tracks it closely enough.
      if (amount <= 0) return []
      return [`gblur=sigma=${(amount / 2).toFixed(3)}`]
    }
    case 'sharpen': {
      if (amount <= 0) return []
      return [`unsharp=5:5:${(amount / 100 * 1.5).toFixed(3)}`]
    }
    case 'glow': {
      if (amount <= 0) return []
      // Approximate a bloom by lifting the highlights and softening.
      const radius = Math.max(1, p.radius ?? 10)
      return [
        `gblur=sigma=${(radius / 4).toFixed(3)}:steps=1`,
        `eq=brightness=${(amount / 100 * 0.12).toFixed(4)}:saturation=${(1 + amount / 400).toFixed(4)}`,
      ]
    }
    case 'vignette': {
      if (amount <= 0) return []
      // vignette's angle controls falloff; larger angle = stronger darkening.
      const angle = (Math.PI / 5) * (0.4 + (amount / 100) * 0.6)
      return [`vignette=angle=${angle.toFixed(4)}`]
    }
    case 'grain': {
      if (amount <= 0) return []
      return [`noise=alls=${Math.round(amount / 100 * 40)}:allf=t+u`]
    }
    default:
      return []
  }
}

/**
 * Build the comma-prefixed filter chain for a clip's enabled effects, in order.
 * Masks are not supported here — an effect always applies to the whole clip.
 */
export function buildClipEffectChain(effects: ExportClipEffect[] | undefined): string {
  if (!effects || effects.length === 0) return ''
  const filters = effects
    .filter(effect => effect.enabled)
    .flatMap(effectToFilters)
  return filters.length > 0 ? `,${filters.join(',')}` : ''
}
