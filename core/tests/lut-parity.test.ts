import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import {
  createIdentityCubeLut,
  serializeCubeLut,
  applyLutToRgb,
  type CubeLut,
} from '../src/lut'

describe('Sprint F0-4: Single Source of Truth Parity (applyLutToRgb vs ffmpeg lut3d)', () => {
  it('identity LUT produces identical values across the color volume with 0 error', () => {
    const lut = createIdentityCubeLut(17)
    for (let r = 0; r <= 1.0; r += 0.25) {
      for (let g = 0; g <= 1.0; g += 0.25) {
        for (let b = 0; b <= 1.0; b += 0.25) {
          const [outR, outG, outB] = applyLutToRgb(lut, r, g, b, 1.0)
          expect(Math.abs(outR - r)).toBeLessThan(1e-5)
          expect(Math.abs(outG - g)).toBeLessThan(1e-5)
          expect(Math.abs(outB - b)).toBeLessThan(1e-5)
        }
      }
    }
  })

  it('matches ffmpeg native lut3d with error strictly < 2/255 per RGB channel', () => {
    // Find ffmpeg binary
    const candidates = [
      path.resolve(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
      'ffmpeg',
    ]

    let ffmpegBin: string | null = null
    for (const c of candidates) {
      try {
        execSync(`"${c}" -version`, { stdio: 'ignore' })
        ffmpegBin = c
        break
      } catch {
        // try next
      }
    }

    if (!ffmpegBin) {
      console.warn('Skipping ffmpeg execution: ffmpeg binary not found in test environment.')
      return
    }

    // Build a non-trivial 3D LUT (size 4, color curves with contrast & warm tint)
    const size = 4
    const denom = size - 1
    const rawData = new Float32Array(size * size * size * 3)
    let idx = 0

    for (let b = 0; b < size; b++) {
      const bv = b / denom
      for (let g = 0; g < size; g++) {
        const gv = g / denom
        for (let r = 0; r < size; r++) {
          const rv = r / denom
          const outR = Math.min(1, rv * 1.1 + 0.05)
          const outG = Math.min(1, Math.pow(gv, 1.2))
          const outB = Math.max(0, bv * 0.85)
          rawData[idx++] = outR
          rawData[idx++] = outG
          rawData[idx++] = outB
        }
      }
    }

    const lut: CubeLut = {
      title: 'Parity Verification LUT',
      size,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: rawData,
    }

    // Write temp .cube file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komfyedit-parity-'))
    const cubePath = path.join(tmpDir, 'parity.cube')
    fs.writeFileSync(cubePath, serializeCubeLut(lut), 'utf-8')

    // Escape path for ffmpeg filter: replace \ with / and : with \\:
    const escapedLut = cubePath.replace(/\\/g, '/').replace(/:/g, '\\\\:')

    // 16 test colors spanning different parts of the RGB cube
    const testPalette: [number, number, number][] = [
      [26, 51, 77],
      [128, 128, 128],
      [204, 102, 51],
      [64, 191, 84],
      [230, 26, 204],
      [77, 153, 230],
      [179, 179, 51],
      [38, 217, 115],
      [15, 15, 15],
      [240, 240, 240],
      [220, 40, 40],
      [40, 220, 40],
      [40, 40, 220],
      [250, 200, 50],
      [50, 220, 240],
      [200, 80, 160],
    ]

    let maxError = 0

    try {
      for (const [byteR, byteG, byteB] of testPalette) {
        const inR = byteR / 255
        const inG = byteG / 255
        const inB = byteB / 255

        // Pure TS evaluator (same as WebGL mathematical model)
        const [expR, expG, expB] = applyLutToRgb(lut, inR, inG, inB, 1.0)

        // ffmpeg lut3d via pipe
        const inputBuf = Buffer.from([byteR, byteG, byteB])
        const rawOutput = execSync(
          `"${ffmpegBin}" -y -f rawvideo -pixel_format rgb24 -video_size 1x1 -i - -vf "lut3d=file=${escapedLut}:interp=trilinear,format=rgb24" -vframes 1 -f rawvideo -`,
          { input: inputBuf, stdio: ['pipe', 'pipe', 'ignore'] },
        )

        const ffR = rawOutput[0] / 255
        const ffG = rawOutput[1] / 255
        const ffB = rawOutput[2] / 255

        const diffR = Math.abs(ffR - expR)
        const diffG = Math.abs(ffG - expG)
        const diffB = Math.abs(ffB - expB)
        const colorMax = Math.max(diffR, diffG, diffB)

        if (colorMax > maxError) maxError = colorMax

        // Assert each color channel error is strictly < 2/255
        expect(diffR).toBeLessThan(2 / 255)
        expect(diffG).toBeLessThan(2 / 255)
        expect(diffB).toBeLessThan(2 / 255)
      }

      // Requirement from docs/filters-sprint-plan.md:
      // "sai số so sánh < 2/255 mỗi kênh RGB"
      expect(maxError).toBeLessThan(2 / 255)
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup error
      }
    }
  })
})
