import { describe, it, expect } from 'vitest'
import { buildVideoFilterGraph, computePreInputSeek } from '../video-filter'
import { buildAudioPcmArgs } from '../audio-mix'
import type { ExportClip } from '../timeline'


/**
 * A complete ExportClip. The tests only care about the trim fields, but the
 * type is the contract the export pipeline actually receives, so build a whole
 * one rather than casting the gaps away.
 */
function makeClip(overrides: Partial<ExportClip> = {}): ExportClip {
  return {
    id: 'clip-1',
    type: 'video',
    path: '/dummy/source.mp4',
    startTime: 0,
    duration: 5,
    trimStart: 0,
    speed: 1,
    volume: 1,
    reversed: false,
    flipH: false,
    flipV: false,
    opacity: 100,
    trackIndex: 0,
    muted: false,
    ...overrides,
  }
}

describe('S0-2: Pre-input seek optimization for video and audio', () => {
  describe('computePreInputSeek', () => {
    it('calculates seek and compensation when trimStart > handle', () => {
      const result = computePreInputSeek(90, 2)
      expect(result.seekSec).toBe(88)
      expect(result.seekArg).toBe('88')
      expect(result.adjustedTrimStart).toBe(2)
    })

    it('clamps seek to 0 when trimStart <= handle', () => {
      const result = computePreInputSeek(1, 2)
      expect(result.seekSec).toBe(0)
      expect(result.seekArg).toBe('0')
      expect(result.adjustedTrimStart).toBe(1)
    })
  })

  describe('buildVideoFilterGraph pre-input seek', () => {
    it('places -ss 88 before -i when trimStart=90', () => {
      const clip = makeClip({ trimStart: 90 })

      const { inputs, filterScript } = buildVideoFilterGraph([clip], {
        width: 1920,
        height: 1080,
        fps: 30,
        totalDuration: 5,
      })

      // Find index of the input file
      const fileIdx = inputs.indexOf('/dummy/source.mp4')
      expect(fileIdx).toBeGreaterThan(0)
      expect(inputs[fileIdx - 1]).toBe('-i')
      expect(inputs[fileIdx - 2]).toBe('88')
      expect(inputs[fileIdx - 3]).toBe('-ss')

      // Check trim filter compensates for the 88s seek (trimStart: 90 - 88 = 2, trimEnd: 2 + 5 = 7)
      expect(filterScript).toContain('trim=start=2.000000:end=7.000000')
    })

    it('places -ss 0 before -i and adjusts trim properly when trimStart=1 (< handle)', () => {
      const clip = makeClip({ id: 'clip-2', duration: 3, trimStart: 1 })

      const { inputs, filterScript } = buildVideoFilterGraph([clip], {
        width: 1920,
        height: 1080,
        fps: 30,
        totalDuration: 3,
      })

      const fileIdx = inputs.indexOf('/dummy/source.mp4')
      expect(fileIdx).toBeGreaterThan(0)
      expect(inputs[fileIdx - 1]).toBe('-i')
      expect(inputs[fileIdx - 2]).toBe('0')
      expect(inputs[fileIdx - 3]).toBe('-ss')

      // Check trim filter compensates for the 0s seek (trimStart: 1 - 0 = 1, trimEnd: 1 + 3 = 4)
      expect(filterScript).toContain('trim=start=1.000000:end=4.000000')
    })
  })

  describe('buildAudioPcmArgs pre-input seek', () => {
    it('places -ss 88 before -i and adjusts atrim when trimStart=90', () => {
      const { args, adjustedTrimStart, adjustedTrimEnd, seekSec } = buildAudioPcmArgs(
        '/dummy/audio.mp3',
        90, // trimStart
        95, // trimEnd
        1,  // speed
        false, // reversed
        2,  // channels
      )

      expect(seekSec).toBe(88)
      expect(adjustedTrimStart).toBe(2)
      expect(adjustedTrimEnd).toBe(7)

      const fileIdx = args.indexOf('/dummy/audio.mp3')
      expect(fileIdx).toBeGreaterThan(0)
      expect(args[fileIdx - 1]).toBe('-i')
      expect(args[fileIdx - 2]).toBe('88')
      expect(args[fileIdx - 3]).toBe('-ss')

      const afIdx = args.indexOf('-af')
      expect(afIdx).toBeGreaterThan(-1)
      const afFilter = args[afIdx + 1]
      expect(afFilter).toContain('atrim=start=2.000000:end=7.000000')
    })

    it('places -ss 0 before -i and adjusts atrim properly when trimStart=1 (< handle)', () => {
      const { args, adjustedTrimStart, adjustedTrimEnd, seekSec } = buildAudioPcmArgs(
        '/dummy/audio.mp3',
        1, // trimStart
        4, // trimEnd
        1, // speed
        false, // reversed
        2, // channels
      )

      expect(seekSec).toBe(0)
      expect(adjustedTrimStart).toBe(1)
      expect(adjustedTrimEnd).toBe(4)

      const fileIdx = args.indexOf('/dummy/audio.mp3')
      expect(fileIdx).toBeGreaterThan(0)
      expect(args[fileIdx - 1]).toBe('-i')
      expect(args[fileIdx - 2]).toBe('0')
      expect(args[fileIdx - 3]).toBe('-ss')

      const afIdx = args.indexOf('-af')
      expect(afIdx).toBeGreaterThan(-1)
      const afFilter = args[afIdx + 1]
      expect(afFilter).toContain('atrim=start=1.000000:end=4.000000')
    })
  })
})
