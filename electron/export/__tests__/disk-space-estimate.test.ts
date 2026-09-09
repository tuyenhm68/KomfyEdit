import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import {
  estimateExportIntermediateSize,
  formatBytes,
  checkDiskSpaceForExport,
} from '../export-handler'

describe('S0-4: Disk space check before export', () => {
  describe('estimateExportIntermediateSize (pure function)', () => {
    it('estimates size for 1080p / 30fps / 10 min (600s)', () => {
      const sizeBytes = estimateExportIntermediateSize({
        width: 1920,
        height: 1080,
        fps: 30,
        durationSec: 10 * 60,
      })

      const sizeMB = sizeBytes / (1024 * 1024)
      // Expect approx 1.5GB - 2.5GB
      expect(sizeMB).toBeGreaterThan(1000)
      expect(sizeMB).toBeLessThan(3000)
    })

    it('estimates size for 4K / 30fps / 60 min (3600s)', () => {
      const sizeBytes = estimateExportIntermediateSize({
        width: 3840,
        height: 2160,
        fps: 30,
        durationSec: 60 * 60,
      })

      const sizeGB = sizeBytes / (1024 * 1024 * 1024)
      // Expect 25GB - 45GB (matching conservative CRF 16 intermediate MKV estimate)
      expect(sizeGB).toBeGreaterThan(25)
      expect(sizeGB).toBeLessThan(45)
    })

    it('estimates size for 720p / 60fps / 5 min (300s)', () => {
      const sizeBytes = estimateExportIntermediateSize({
        width: 1280,
        height: 720,
        fps: 60,
        durationSec: 5 * 60,
      })

      const sizeMB = sizeBytes / (1024 * 1024)
      // Expect approx 500MB - 1.5GB
      expect(sizeMB).toBeGreaterThan(500)
      expect(sizeMB).toBeLessThan(1500)
    })

    it('returns 0 for non-positive dimensions or duration', () => {
      expect(estimateExportIntermediateSize({ width: 0, height: 1080, fps: 30, durationSec: 60 })).toBe(0)
      expect(estimateExportIntermediateSize({ width: 1920, height: 0, fps: 30, durationSec: 60 })).toBe(0)
      expect(estimateExportIntermediateSize({ width: 1920, height: 1080, fps: 0, durationSec: 60 })).toBe(0)
      expect(estimateExportIntermediateSize({ width: 1920, height: 1080, fps: 30, durationSec: 0 })).toBe(0)
    })
  })

  describe('formatBytes', () => {
    it('formats bytes, KB, MB, and GB', () => {
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(2048)).toBe('2.0 KB')
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
      expect(formatBytes(30 * 1024 * 1024 * 1024)).toBe('30.00 GB')
    })
  })

  describe('checkDiskSpaceForExport', () => {
    it('detects insufficient disk space', () => {
      vi.spyOn(fs, 'statfsSync').mockReturnValue({
        bsize: 4096,
        bavail: 250, // 250 * 4096 = 1,024,000 bytes (~1 MB)
      } as unknown as fs.StatsFs)

      const requiredBytes = 100 * 1024 * 1024 // 100 MB
      const result = checkDiskSpaceForExport('/mock/tmp', requiredBytes)

      expect(result.sufficient).toBe(false)
      expect(result.requiredBytes).toBe(requiredBytes)
      expect(result.availableBytes).toBe(1024000)

      vi.restoreAllMocks()
    })

    it('detects sufficient disk space', () => {
      vi.spyOn(fs, 'statfsSync').mockReturnValue({
        bsize: 4096,
        bavail: 25000000, // ~100 GB
      } as unknown as fs.StatsFs)

      const requiredBytes = 100 * 1024 * 1024 // 100 MB
      const result = checkDiskSpaceForExport('/mock/tmp', requiredBytes)

      expect(result.sufficient).toBe(true)
      expect(result.availableBytes).toBeGreaterThan(requiredBytes)

      vi.restoreAllMocks()
    })
  })
})
