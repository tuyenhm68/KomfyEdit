import { describe, it, expect } from 'vitest';
import {
  SOCIAL_PRESETS,
  EXPORT_FORMATS,
  estimateExportFileSize,
  formatFileSize,
} from '../src/export-options';

describe('export-options', () => {
  describe('SOCIAL_PRESETS', () => {
    it('defines standard social presets', () => {
      expect(SOCIAL_PRESETS.length).toBeGreaterThanOrEqual(3);
      const vertical = SOCIAL_PRESETS.find((p) => p.id === 'tiktok-reels-shorts');
      expect(vertical).toBeDefined();
      expect(vertical?.width).toBe(1080);
      expect(vertical?.height).toBe(1920);
      expect(vertical?.bitrateMbps).toBe(8);

      const square = SOCIAL_PRESETS.find((p) => p.id === 'instagram-square');
      expect(square).toBeDefined();
      expect(square?.width).toBe(1080);
      expect(square?.height).toBe(1080);
      expect(square?.bitrateMbps).toBe(6);

      const landscape = SOCIAL_PRESETS.find((p) => p.id === 'youtube-fhd');
      expect(landscape).toBeDefined();
      expect(landscape?.width).toBe(1920);
      expect(landscape?.height).toBe(1080);
      expect(landscape?.bitrateMbps).toBe(10);
    });
  });

  describe('EXPORT_FORMATS', () => {
    it('contains video, gif, and audio formats', () => {
      const formatList = Object.values(EXPORT_FORMATS);
      const types = new Set(formatList.map((f) => f.type));
      expect(types.has('video')).toBe(true);
      expect(types.has('gif')).toBe(true);
      expect(types.has('audio')).toBe(true);

      const gif = EXPORT_FORMATS.gif;
      expect(gif.ext).toBe('gif');
      expect(gif.type).toBe('gif');

      const wav = EXPORT_FORMATS.wav;
      expect(wav.ext).toBe('wav');
      expect(wav.type).toBe('audio');
    });
  });

  describe('estimateExportFileSize', () => {
    it('returns 0 for non-positive duration', () => {
      expect(estimateExportFileSize({ durationSec: 0, codec: 'h264' })).toBe(0);
      expect(estimateExportFileSize({ durationSec: -5, codec: 'h264' })).toBe(0);
    });

    it('calculates size from custom video bitrate', () => {
      // 10 seconds, 8 Mbps video + 0.192 Mbps audio = 8.192 Mbps
      const bytes = estimateExportFileSize({
        durationSec: 10,
        codec: 'h264',
        customBitrateMbps: 8,
      });
      const expected = Math.round(((8 + 0.192) * 1_000_000 * 10) / 8);
      expect(bytes).toBe(expected);
    });

    it('estimates size for audio-only codecs (WAV, MP3, AAC)', () => {
      // WAV uncompressed 48kHz 16-bit stereo = 192 KB/s * 10 = 1,920,000 bytes
      const wavBytes = estimateExportFileSize({ durationSec: 10, codec: 'wav' });
      expect(wavBytes).toBe(10 * 192_000);

      // MP3 320 kbps = 40 KB/s * 10 = 400,000 bytes
      const mp3Bytes = estimateExportFileSize({ durationSec: 10, codec: 'mp3' });
      expect(mp3Bytes).toBe(Math.round((10 * 320 * 1000) / 8));

      // AAC 256 kbps = 32 KB/s * 10 = 320,000 bytes
      const aacBytes = estimateExportFileSize({ durationSec: 10, codec: 'aac' });
      expect(aacBytes).toBe(Math.round((10 * 256 * 1000) / 8));
    });

    it('estimates size for GIF', () => {
      const gifBytes = estimateExportFileSize({
        durationSec: 5,
        codec: 'gif',
        width: 1080,
        height: 1080,
        fps: 30,
      });
      expect(gifBytes).toBeGreaterThan(0);
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes into KB, MB, GB properly', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1024 * 1024 * 5.5)).toBe('5.5 MB');
      expect(formatFileSize(1024 * 1024 * 1024 * 2.1)).toBe('2.10 GB');
    });
  });
});
