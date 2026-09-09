import { getTransitionDefinition } from './transitions'

/**
 * How a transition looks, as CSS, at a given moment.
 *
 * The preview stacks the outgoing and incoming clips as two DOM layers, so a
 * transition is just a pair of styles that change with progress. Keeping that
 * as a pure function buys three things: the monitor and the browsable library
 * draw from the same source, so a thumbnail can never advertise an effect the
 * editor renders differently; and the geometry is testable without a DOM.
 *
 * `progress` runs 0 → 1 across the overlap. At 0 the outgoing clip is untouched
 * and the incoming one is invisible; at 1 it is the other way round.
 */

export interface TransitionLayerStyles {
  /** The clip being left behind. */
  outgoing: Record<string, string>
  /** The clip coming in. */
  incoming: Record<string, string>
  /**
   * A flat colour drawn between the two layers, for the fade-through-colour
   * transitions. Absent when the effect needs no such layer.
   */
  colour?: { color: string; opacity: string }
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const pct = (value: number) => `${(value * 100).toFixed(3)}%`

/** Direction encoded in an id like `wipe-left` or `slide-up`. */
function directionOf(id: string): 'left' | 'right' | 'up' | 'down' | null {
  if (id.endsWith('-left')) return 'left'
  if (id.endsWith('-right')) return 'right'
  if (id.endsWith('-up')) return 'up'
  if (id.endsWith('-down')) return 'down'
  return null
}

/**
 * `wipeleft` in ffmpeg means the new picture arrives *from* the right edge and
 * sweeps left. Matching that here is the whole point of the shared catalogue:
 * a preview that wiped the other way would be a different film on export.
 */
function wipeInset(direction: string, progress: number): string {
  const remaining = pct(1 - progress)
  switch (direction) {
    case 'left':  return `inset(0 0 0 ${remaining})`
    case 'right': return `inset(0 ${remaining} 0 0)`
    case 'up':    return `inset(${remaining} 0 0 0)`
    default:      return `inset(0 0 ${remaining} 0)`
  }
}

function slideOffsets(direction: string, progress: number): { incoming: string; outgoing: string } {
  const enter = (1 - progress) * 100
  const leave = progress * 100
  switch (direction) {
    case 'left':
      return { incoming: `translateX(${enter}%)`, outgoing: `translateX(${-leave}%)` }
    case 'right':
      return { incoming: `translateX(${-enter}%)`, outgoing: `translateX(${leave}%)` }
    case 'up':
      return { incoming: `translateY(${enter}%)`, outgoing: `translateY(${-leave}%)` }
    default:
      return { incoming: `translateY(${-enter}%)`, outgoing: `translateY(${leave}%)` }
  }
}

export function transitionLayerStyles(type: string, rawProgress: number): TransitionLayerStyles {
  const progress = clamp01(rawProgress)
  const definition = getTransitionDefinition(type)

  // An unknown id renders as a plain dissolve rather than as nothing: the same
  // fallback the exporter takes, so the two still agree about the frame.
  const kind = definition?.preview ?? 'opacity'
  const direction = directionOf(type) ?? 'left'

  switch (kind) {
    case 'colour': {
      // Out to the colour over the first half, in from it over the second —
      // the picture never cross-fades directly into the other picture.
      const toColour = clamp01(progress * 2)
      const fromColour = clamp01((progress - 0.5) * 2)
      return {
        outgoing: { opacity: String(1 - toColour) },
        incoming: { opacity: String(fromColour) },
        colour: {
          color: type === 'fade-to-white' ? '#ffffff' : '#000000',
          opacity: String(progress < 0.5 ? toColour : 1 - fromColour),
        },
      }
    }

    case 'wipe':
      return {
        outgoing: {},
        incoming: { opacity: '1', clipPath: wipeInset(direction, progress) },
      }

    case 'slide': {
      const offsets = slideOffsets(direction, progress)
      return {
        outgoing: { transform: offsets.outgoing },
        incoming: { opacity: '1', transform: offsets.incoming },
      }
    }

    case 'shape': {
      if (type === 'circle-close') {
        // The outgoing picture shrinks away through a closing circle.
        // Full coverage at the start: at 100% the circle certainly encloses
        // the frame, so nothing of the incoming clip leaks past the corners.
        const radius = pct(1 - progress)
        return {
          outgoing: { clipPath: `circle(${radius} at 50% 50%)` },
          incoming: { opacity: '1' },
        }
      }
      if (type === 'rect-crop') {
        const inset = pct((1 - progress) / 2)
        return {
          outgoing: {},
          incoming: { opacity: '1', clipPath: `inset(${inset} ${inset})` },
        }
      }
      return {
        outgoing: {},
        incoming: { opacity: '1', clipPath: `circle(${pct(progress)} at 50% 50%)` },
      }
    }

    case 'scale':
      return {
        outgoing: { opacity: String(1 - progress) },
        incoming: {
          opacity: String(progress),
          transform: `scale(${(0.4 + progress * 0.6).toFixed(4)})`,
        },
      }

    case 'squeeze': {
      const axis = type === 'squeeze-v' ? 'scaleY' : 'scaleX'
      return {
        outgoing: { transform: `${axis}(${(1 - progress).toFixed(4)})` },
        incoming: { opacity: '1', transform: `${axis}(${progress.toFixed(4)})` },
      }
    }

    case 'blur': {
      // Blur peaks in the middle so the cut is hidden by the softest frame.
      const peak = (1 - Math.abs(progress - 0.5) * 2) * 12
      return {
        outgoing: { opacity: String(1 - progress), filter: `blur(${peak.toFixed(2)}px)` },
        incoming: { opacity: String(progress), filter: `blur(${peak.toFixed(2)}px)` },
      }
    }

    case 'opacity':
    default:
      return {
        outgoing: {},
        incoming: { opacity: String(progress) },
      }
  }
}
