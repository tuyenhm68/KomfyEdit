import { describe, it, expect } from 'vitest'
import {
  computeSpeechIntervalsFromSilence,
  voiceClipSpeechToTimeline,
  applyDuckingKeyframes,
} from '../src/audio-ducking'
import { timelineClipSchema, type TimelineClip } from '../src/project-model'

describe('audio-ducking · Core logic', () => {
  describe('computeSpeechIntervalsFromSilence', () => {
    it('returns the full duration as speech if no silence is detected', () => {
      const speech = computeSpeechIntervalsFromSilence([], 10)
      expect(speech).toEqual([{ start: 0, end: 10 }])
    })

    it('returns empty array if duration <= 0', () => {
      const speech = computeSpeechIntervalsFromSilence([], 0)
      expect(speech).toEqual([])
    })

    it('inverts silence intervals into speech intervals', () => {
      // 10s clip with silence at [3, 7]
      const silences = [{ start: 3, end: 7, duration: 4 }]
      const speech = computeSpeechIntervalsFromSilence(silences, 10)
      expect(speech).toEqual([
        { start: 0, end: 3 },
        { start: 7, end: 10 },
      ])
    })

    it('merges speech segments separated by small gaps to prevent pumping', () => {
      // 15s clip with silence at [4, 4.3] (gap 0.3s <= default bridgeGapThreshold 0.5s)
      const silences = [{ start: 4, end: 4.3, duration: 0.3 }]
      const speech = computeSpeechIntervalsFromSilence(silences, 15)
      // Because gap between [0, 4] and [4.3, 15] is 0.3s, they merge into [0, 15]
      expect(speech).toEqual([{ start: 0, end: 15 }])
    })

    it('discards tiny speech fragments under minSpeechDuration', () => {
      // silence from 0 to 4.9, speech for 0.1s from 4.9 to 5.0, silence from 5.0 to 10.0
      const silences = [
        { start: 0, end: 4.9, duration: 4.9 },
        { start: 5.0, end: 10.0, duration: 5.0 },
      ]
      const speech = computeSpeechIntervalsFromSilence(silences, 10, { minSpeechDuration: 0.2 })
      expect(speech).toEqual([])
    })
  })

  describe('voiceClipSpeechToTimeline', () => {
    it('maps local media speech intervals to timeline coordinates with trim and speed', () => {
      const voiceClip: TimelineClip = timelineClipSchema.parse({
        id: 'voice-1',
        assetId: 'a1',
        type: 'audio',
        startTime: 10, // starts at 10s on timeline
        duration: 5,   // 5s long on timeline
        trimStart: 2,  // starts at 2s in file
        trimEnd: 0,
        speed: 2,      // 2x speed: 10s of media played in 5s
        reversed: false,
        muted: false,
        volume: 1,
        trackIndex: 2,
        asset: null,
      })

      // Local media speech from 4s to 8s (media time)
      const localSpeech = [{ start: 4, end: 8 }]
      const timelineSpeech = voiceClipSpeechToTimeline(voiceClip, localSpeech)

      // Relative to trimStart: (4 - 2) / 2 = 1s; (8 - 2) / 2 = 3s
      // On timeline: 10 + 1 = 11s to 10 + 3 = 13s
      expect(timelineSpeech).toEqual([{ start: 11, end: 13 }])
    })
  })

  describe('applyDuckingKeyframes', () => {
    const musicClip: TimelineClip = timelineClipSchema.parse({
      id: 'music-1',
      assetId: 'm1',
      type: 'audio',
      startTime: 0,
      duration: 20,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      reversed: false,
      muted: false,
      volume: 1,
      trackIndex: 3,
      asset: null,
    })

    it('returns unchanged clip if no speech intervals overlap', () => {
      const speech = [{ start: 25, end: 30 }]
      const result = applyDuckingKeyframes(musicClip, speech)
      expect(result.keyframes).toBeUndefined()
    })

    it('generates volume keyframes with attack, ducked hold, and release ramps', () => {
      // Speech from 5s to 10s on timeline
      const speech = [{ start: 5, end: 10 }]
      const result = applyDuckingKeyframes(musicClip, speech, {
        duckingDb: -12, // 10^(-12/20) ≈ 0.251
        attack: 0.3,
        release: 0.5,
      })

      expect(result.keyframes).toBeDefined()
      const volumeTrack = result.keyframes?.find(k => k.property === 'volume')
      expect(volumeTrack).toBeDefined()

      const points = volumeTrack!.points
      expect(points.length).toBeGreaterThanOrEqual(4)

      // Point at start of ramp down: 5 - 0.3 = 4.7s, volume 1.0
      const pRampDown = points.find(p => Math.abs(p.t - 4.7) < 0.05)
      expect(pRampDown).toBeDefined()
      expect(pRampDown!.value).toBeCloseTo(1.0, 2)

      // Point at full duck: 5.0s, volume ~0.251
      const pDuckStart = points.find(p => Math.abs(p.t - 5.0) < 0.05)
      expect(pDuckStart).toBeDefined()
      expect(pDuckStart!.value).toBeCloseTo(0.251, 2)

      // Point at end of duck: 10.0s, volume ~0.251
      const pDuckEnd = points.find(p => Math.abs(p.t - 10.0) < 0.05)
      expect(pDuckEnd).toBeDefined()
      expect(pDuckEnd!.value).toBeCloseTo(0.251, 2)

      // Point at release completion: 10.0 + 0.5 = 10.5s, volume 1.0
      const pRampUp = points.find(p => Math.abs(p.t - 10.5) < 0.05)
      expect(pRampUp).toBeDefined()
      expect(pRampUp!.value).toBeCloseTo(1.0, 2)

      // Anchors at t=0 and t=20
      expect(points[0].t).toBe(0)
      expect(points[0].value).toBeCloseTo(1.0, 2)
      expect(points[points.length - 1].t).toBe(20)
      expect(points[points.length - 1].value).toBeCloseTo(1.0, 2)
    })

    it('merges adjacent speech intervals to avoid pumping between short pauses', () => {
      // Speech 1: 4s to 6s, Speech 2: 6.4s to 8s (gap 0.4s < attack(0.3) + release(0.5) = 0.8s)
      const speech = [
        { start: 4, end: 6 },
        { start: 6.4, end: 8 },
      ]
      const result = applyDuckingKeyframes(musicClip, speech, {
        duckingDb: -12,
        attack: 0.3,
        release: 0.5,
      })

      const volumeTrack = result.keyframes?.find(k => k.property === 'volume')!
      // Between 6.0 and 6.4, volume should remain ducked (~0.251), not ramp up to 1.0
      const interiorPoints = volumeTrack.points.filter(p => p.t >= 4.0 && p.t <= 8.0)
      for (const p of interiorPoints) {
        expect(p.value).toBeCloseTo(0.251, 2)
      }
    })
  })
})
