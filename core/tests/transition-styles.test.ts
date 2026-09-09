import { describe, it, expect } from 'vitest'
import { transitionLayerStyles } from '../src/transition-styles'
import { TRANSITION_DEFINITIONS } from '../src/transitions'

describe('every catalogue entry renders', () => {
  it('produces layer styles for all of them, at both ends and the middle', () => {
    for (const definition of TRANSITION_DEFINITIONS) {
      for (const progress of [0, 0.5, 1]) {
        const styles = transitionLayerStyles(definition.id, progress)
        expect(styles.outgoing, definition.id).toBeDefined()
        expect(styles.incoming, definition.id).toBeDefined()
      }
    }
  })

  it('starts with the incoming clip hidden and ends with it shown', () => {
    for (const definition of TRANSITION_DEFINITIONS) {
      const start = transitionLayerStyles(definition.id, 0)
      const end = transitionLayerStyles(definition.id, 1)
      // The incoming clip is invisible at the start either because its own
      // style hides it, or because the outgoing one still covers the frame —
      // circle-close works the second way, by shrinking the picture on top.
      // Three ways a layer can be invisible: transparent, clipped to nothing,
      // or transformed off-frame / scaled to zero.
      const hiddenByItself =
        start.incoming.opacity === '0' ||
        start.incoming.clipPath?.includes('0.000%') ||
        start.incoming.transform?.includes('100%') ||
        start.incoming.transform?.includes('(0.0000)')
      const coveredByOutgoing =
        start.outgoing.clipPath?.includes('100.000%') ||
        (Object.keys(start.outgoing).length === 0 && start.incoming.opacity === '1' &&
          Boolean(start.incoming.clipPath || start.incoming.transform))
      expect(hiddenByItself || coveredByOutgoing, `${definition.id} must not show the incoming clip at 0`).toBeTruthy()

      const shownAtEnd =
        end.incoming.opacity === undefined ||
        end.incoming.opacity === '1' ||
        Number(end.incoming.opacity) > 0.99
      expect(shownAtEnd, `${definition.id} must show the incoming clip at 1`).toBeTruthy()
    }
  })
})

describe('geometry matches the ffmpeg name it is paired with', () => {
  it('wipes in from the opposite edge, the way xfade does', () => {
    // xfade's `wipeleft` sweeps the new picture leftwards, so it is revealed
    // from the right-hand edge: the inset shrinks on the left.
    expect(transitionLayerStyles('wipe-left', 0.25).incoming.clipPath).toBe('inset(0 0 0 75.000%)')
    expect(transitionLayerStyles('wipe-right', 0.25).incoming.clipPath).toBe('inset(0 75.000% 0 0)')
    expect(transitionLayerStyles('wipe-up', 0.25).incoming.clipPath).toBe('inset(75.000% 0 0 0)')
    expect(transitionLayerStyles('wipe-down', 0.25).incoming.clipPath).toBe('inset(0 0 75.000% 0)')
  })

  it('pushes both layers together for a slide', () => {
    const half = transitionLayerStyles('slide-left', 0.5)
    expect(half.incoming.transform).toBe('translateX(50%)')
    expect(half.outgoing.transform).toBe('translateX(-50%)')
  })

  it('opens and closes the circle from the right side', () => {
    expect(transitionLayerStyles('circle-open', 0.5).incoming.clipPath).toContain('circle(50.000%')
    expect(transitionLayerStyles('circle-close', 0.5).outgoing.clipPath).toContain('circle(50.000%')
  })
})

describe('fade through a colour', () => {
  it('reaches full colour at the midpoint and clears by the end', () => {
    expect(transitionLayerStyles('fade-to-black', 0.5).colour).toEqual({ color: '#000000', opacity: '1' })
    expect(transitionLayerStyles('fade-to-white', 0.5).colour?.color).toBe('#ffffff')
    expect(transitionLayerStyles('fade-to-black', 1).colour?.opacity).toBe('0')
    expect(transitionLayerStyles('fade-to-black', 0).colour?.opacity).toBe('0')
  })

  it('never shows the two pictures at once — that is what makes it a dip', () => {
    for (const progress of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const styles = transitionLayerStyles('fade-to-black', progress)
      const both = Number(styles.outgoing.opacity) > 0.01 && Number(styles.incoming.opacity) > 0.01
      expect(both, `overlap at ${progress}`).toBe(false)
    }
  })
})

describe('robustness', () => {
  it('falls back to a dissolve for an unknown id, like the exporter does', () => {
    expect(transitionLayerStyles('radiant-burst', 0.5).incoming.opacity).toBe('0.5')
  })

  it('clamps progress that runs past either end', () => {
    expect(transitionLayerStyles('dissolve', -1).incoming.opacity).toBe('0')
    expect(transitionLayerStyles('dissolve', 2).incoming.opacity).toBe('1')
  })
})
