import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import * as childProcess from 'child_process'
import {
  observeSilence,
  observeScenes,
  observeLoudness,
  clearMediaAnalyzerCache,
  _analyzerStats,
} from '../electron/media-analyzer'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const SYNTHETIC_MEDIA = path.join(FIXTURES_DIR, 'synthetic_media.mp4')
const NO_AUDIO_MEDIA = path.join(FIXTURES_DIR, 'no_audio.mp4')

describe('S3-1 · Media Analyzer (observeSilence, observeScenes, observeLoudness)', () => {
  beforeEach(() => {
    clearMediaAnalyzerCache()
    vi.restoreAllMocks()
  })

  it('verifies media fixtures exist and total size is < 2MB', () => {
    expect(fs.existsSync(SYNTHETIC_MEDIA)).toBe(true)
    expect(fs.existsSync(NO_AUDIO_MEDIA)).toBe(true)

    const files = fs.readdirSync(FIXTURES_DIR)
    let totalBytes = 0
    for (const file of files) {
      const stat = fs.statSync(path.join(FIXTURES_DIR, file))
      if (stat.isFile()) {
        totalBytes += stat.size
      }
    }

    // Must be < 2MB (2 * 1024 * 1024 = 2,097,152 bytes)
    expect(totalBytes).toBeLessThan(2 * 1024 * 1024)
    expect(totalBytes).toBeLessThan(100 * 1024) // Extra tight: our fixtures are ~32KB total
  })

  it('detects known silence intervals with error < 0.1s', async () => {
    // Expected: 2 silence intervals:
    // 1) ~1.0s to 3.5s (duration ~2.5s)
    // 2) ~4.5s to 7.0s (duration ~2.5s)
    const silences = await observeSilence(SYNTHETIC_MEDIA, { noiseDb: -30, minDurationSec: 2 })
    expect(silences).toHaveLength(2)

    const [first, second] = silences
    expect(Math.abs(first.start - 1.0)).toBeLessThan(0.1)
    expect(Math.abs(first.end - 3.5)).toBeLessThan(0.1)
    expect(Math.abs(first.duration - 2.5)).toBeLessThan(0.1)

    expect(Math.abs(second.start - 4.5)).toBeLessThan(0.1)
    expect(Math.abs(second.end - 7.0)).toBeLessThan(0.1)
    expect(Math.abs(second.duration - 2.5)).toBeLessThan(0.1)
  })

  it('detects known scene cuts on fixture', async () => {
    // Expected: 2 scene cuts (at t=2.0s and t=4.0s)
    const scenes = await observeScenes(SYNTHETIC_MEDIA, { threshold: 0.3 })
    expect(scenes).toHaveLength(2)

    expect(Math.abs(scenes[0].timestamp - 2.0)).toBeLessThan(0.1)
    expect(Math.abs(scenes[1].timestamp - 4.0)).toBeLessThan(0.1)
    if (scenes[0].score !== undefined) {
      expect(scenes[0].score).toBeGreaterThan(0.3)
    }
  })

  it('measures loudness correctly with EBU R128', async () => {
    const loudness = await observeLoudness(SYNTHETIC_MEDIA)
    expect(loudness).not.toBeNull()
    if (loudness) {
      expect(Math.abs(loudness.integratedLufs - -22.0)).toBeLessThan(1.0)
      expect(Math.abs(loudness.truePeakDb - -16.5)).toBeLessThan(1.0)
      expect(loudness.lra).toBeGreaterThan(0)
    }
  })

  it('returns empty results and does not throw for files without audio', async () => {
    const silences = await observeSilence(NO_AUDIO_MEDIA)
    expect(silences).toEqual([])

    const loudness = await observeLoudness(NO_AUDIO_MEDIA)
    expect(loudness).toBeNull()
  })

  it('caches results by path + mtime + params and avoids redundant ffmpeg spawns', async () => {
    clearMediaAnalyzerCache()
    expect(_analyzerStats.spawnCount).toBe(0)

    // Call 1: should spawn ffmpeg
    const firstRun = await observeSilence(SYNTHETIC_MEDIA, { noiseDb: -30, minDurationSec: 2 })
    const spawnCountAfterFirst = _analyzerStats.spawnCount
    expect(spawnCountAfterFirst).toBeGreaterThan(0)

    // Call 2 with exact same input: should hit cache and NOT spawn
    const secondRun = await observeSilence(SYNTHETIC_MEDIA, { noiseDb: -30, minDurationSec: 2 })
    expect(secondRun).toEqual(firstRun)
    expect(_analyzerStats.spawnCount).toBe(spawnCountAfterFirst)

    // Call with different params (minDurationSec = 4): should miss cache and spawn
    const thirdRun = await observeSilence(SYNTHETIC_MEDIA, { noiseDb: -30, minDurationSec: 4 })
    expect(_analyzerStats.spawnCount).toBe(spawnCountAfterFirst + 1)
    // There are no silences >= 4s in our fixture
    expect(thirdRun).toEqual([])

    // Scene cache test
    const sceneSpawnStart = _analyzerStats.spawnCount
    const scenesFirst = await observeScenes(SYNTHETIC_MEDIA, { threshold: 0.3 })
    expect(_analyzerStats.spawnCount).toBe(sceneSpawnStart + 1)

    const scenesSecond = await observeScenes(SYNTHETIC_MEDIA, { threshold: 0.3 })
    expect(scenesSecond).toEqual(scenesFirst)
    expect(_analyzerStats.spawnCount).toBe(sceneSpawnStart + 1)

    // Loudness cache test
    const loudnessSpawnStart = _analyzerStats.spawnCount
    const loudnessFirst = await observeLoudness(SYNTHETIC_MEDIA)
    expect(_analyzerStats.spawnCount).toBe(loudnessSpawnStart + 1)

    const loudnessSecond = await observeLoudness(SYNTHETIC_MEDIA)
    expect(loudnessSecond).toEqual(loudnessFirst)
    expect(_analyzerStats.spawnCount).toBe(loudnessSpawnStart + 1)
  })
})
