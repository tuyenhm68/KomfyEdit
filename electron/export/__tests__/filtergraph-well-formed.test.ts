import { describe, it, expect } from 'vitest'
import { buildVideoFilterGraph } from '../video-filter'

/**
 * Structural checks on the generated filtergraph.
 *
 * ffmpeg splits a filterchain on commas and reads each piece as a filter, so a
 * stray comma next to an input label leaves an unnamed filter and kills the
 * whole export with `No such filter: ''` — after the encoder has already
 * started, which is a slow and confusing way to find out. Image clips used to
 * do exactly that: their chain began as a bare `[N:v]` and the first filter was
 * appended with a leading comma, producing `[N:v],scale=...`.
 *
 * These assertions are about shape, not about which filters are chosen; the
 * preview/export parity suite covers the values.
 */

function imageClip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clip-image',
    type: 'image',
    path: '/tmp/sticker.png',
    startTime: 0,
    duration: 3,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: true,
    volume: 1,
    trackIndex: 1,
    flipH: false,
    flipV: false,
    opacity: 100,
    transform: {
      scale: 100, positionX: 0, positionY: 0, rotation: 0,
      cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0,
    },
    transitionIn: { type: 'none', duration: 0 },
    transitionOut: { type: 'none', duration: 0 },
    ...overrides,
  } as never
}

function videoClip(overrides: Record<string, unknown> = {}) {
  return imageClip({ id: 'clip-video', type: 'video', path: '/tmp/take.mp4', trackIndex: 0, muted: false, ...overrides })
}

const opts = { width: 1080, height: 1920, fps: 30, totalDuration: 3 }

/** Every chain, split out of the script exactly as ffmpeg would see them. */
function chainsOf(script: string): string[] {
  return script.split(';').map(part => part.trim()).filter(part => part.length > 0)
}

describe('filtergraph shape', () => {
  it('never leaves an unnamed filter after an input label', () => {
    for (const clips of [[imageClip()], [videoClip()], [videoClip(), imageClip()]]) {
      const { filterScript } = buildVideoFilterGraph(clips, opts)

      for (const chain of chainsOf(filterScript)) {
        // `[1:v],scale=...` — the comma right after a label is the bug.
        expect(chain, `chain starts with a comma: ${chain}`).not.toMatch(/\][\s]*,/)
        // `scale=...,,setsar=1` — a doubled comma is the same mistake mid-chain.
        expect(chain, `chain has an empty filter: ${chain}`).not.toContain(',,')
      }
    }
  })

  it('produces no empty chain between two semicolons', () => {
    const { filterScript } = buildVideoFilterGraph([imageClip()], opts)
    for (const part of filterScript.split(';')) {
      expect(part.trim().length).toBeGreaterThan(0)
    }
  })

  it('gives an image clip a real filter to anchor its chain', () => {
    const { filterScript } = buildVideoFilterGraph([imageClip()], opts)
    const imageChain = chainsOf(filterScript).find(chain => chain.startsWith('[1:v]'))

    expect(imageChain).toBeDefined()
    expect(imageChain!.startsWith('[1:v]null')).toBe(true)
  })

  it('still loops the still image for its full duration', () => {
    const { inputs } = buildVideoFilterGraph([imageClip({ duration: 7 })], opts)
    const loopIndex = inputs.indexOf('-loop')

    expect(loopIndex).toBeGreaterThanOrEqual(0)
    expect(inputs[loopIndex + 1]).toBe('1')
    expect(inputs).toContain('7.000000')
  })
})
