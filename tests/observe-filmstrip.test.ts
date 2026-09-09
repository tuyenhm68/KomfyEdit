import { describe, it, expect, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import { observeFilmstrip } from '../electron/observe-filmstrip'

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures')
const SYNTHETIC_MEDIA = path.join(FIXTURES_DIR, 'synthetic_media.mp4')

const generatedFiles: string[] = []

describe('S3-2 · observe.filmstrip', { timeout: 20000 }, () => {
  afterEach(() => {
    for (const f of generatedFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f)
      } catch {
        // ignore
      }
    }
    generatedFiles.length = 0
  })

  it('generates a valid PNG filmstrip with requested columns and size < 500KB', async () => {
    const res = await observeFilmstrip({
      mediaPath: SYNTHETIC_MEDIA,
      columns: 12,
    })
    generatedFiles.push(res.outputPath)

    expect(fs.existsSync(res.outputPath)).toBe(true)
    expect(res.columns).toBe(12)

    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const buf = fs.readFileSync(res.outputPath)
    expect(buf[0]).toBe(0x89)
    expect(buf[1]).toBe(0x50) // 'P'
    expect(buf[2]).toBe(0x4e) // 'N'
    expect(buf[3]).toBe(0x47) // 'G'

    // File size must be under 500KB (500 * 1024 = 512,000 bytes)
    expect(res.fileSizeBytes).toBeLessThan(500 * 1024)
    expect(res.fileSizeBytes).toBeGreaterThan(1000)

    // Save a copy as sample artifact
    const artifactPath = 'C:/Users/tuyenhm/.gemini/antigravity-ide/brain/52c34bee-3d2d-4b78-9929-5a74af6dc7d9/filmstrip_sample.png'
    try {
      fs.copyFileSync(res.outputPath, artifactPath)
    } catch {
      // ignore if dir not present
    }
  })

  it('supports custom column counts and dimensions', async () => {
    const res = await observeFilmstrip({
      mediaPath: SYNTHETIC_MEDIA,
      columns: 6,
      maxWidth: 960,
    })
    generatedFiles.push(res.outputPath)

    expect(fs.existsSync(res.outputPath)).toBe(true)
    expect(res.columns).toBe(6)
    expect(res.width).toBeLessThanOrEqual(960)
  })

  it('clamps out-of-range timestamps without throwing errors', async () => {
    // Negative start time and beyond-timeline end time
    const resOver = await observeFilmstrip({
      mediaPath: SYNTHETIC_MEDIA,
      startTime: -10,
      endTime: 999,
      columns: 8,
    })
    generatedFiles.push(resOver.outputPath)

    expect(fs.existsSync(resOver.outputPath)).toBe(true)
    expect(resOver.startTime).toBe(0)
    expect(resOver.endTime).toBeLessThanOrEqual(7.5)

    // Inverted range (startTime > endTime)
    const resInverted = await observeFilmstrip({
      mediaPath: SYNTHETIC_MEDIA,
      startTime: 50,
      endTime: 5,
      columns: 8,
    })
    generatedFiles.push(resInverted.outputPath)

    expect(fs.existsSync(resInverted.outputPath)).toBe(true)
    expect(resInverted.startTime).toBeLessThan(resInverted.endTime)
  })

  it('generates filmstrip from timeline state representation', async () => {
    const mockTimeline = {
      tracks: [
        {
          id: 'v1',
          name: 'Video Track',
          type: 'video' as const,
          clips: [
            {
              id: 'c1',
              name: 'Cut 1',
              mediaPath: SYNTHETIC_MEDIA,
              timelineStart: 0,
              timelineEnd: 6,
              sourceStart: 0,
            },
          ],
        },
      ],
    }

    const res = await observeFilmstrip({
      timeline: mockTimeline,
      columns: 8,
    })
    generatedFiles.push(res.outputPath)

    expect(fs.existsSync(res.outputPath)).toBe(true)
    expect(res.columns).toBe(8)
    expect(res.duration).toBeGreaterThan(0)
  })
})
