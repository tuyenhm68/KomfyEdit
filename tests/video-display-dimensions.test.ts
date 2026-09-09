import { describe, it, expect } from 'vitest'
import { parseDisplayDimensions } from '../electron/export/ffmpeg-utils'

/**
 * Import must record the size a player shows, not the size the stream is
 * stored at. A phone films in landscape and tags the file with a display
 * matrix: the stream stays 1920x1080 while every player draws it 1080x1920.
 * Recording the stream size made a vertical clip open a landscape project.
 */

const iphonePortrait = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'IMG_4665.MOV':
  Duration: 00:01:20.00, start: 0.000000, bitrate: 15633 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080, 15351 kb/s, 30 fps, 30 tbr, 600 tbn (default)
    Metadata:
      handler_name    : Core Media Video
      encoder         : H.264
    Side data:
      displaymatrix: rotation of 90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 199 kb/s (default)
`

describe('parseDisplayDimensions', () => {
  it('swaps the axes for a quarter turn', () => {
    expect(parseDisplayDimensions(iphonePortrait)).toEqual({ width: 1080, height: 1920 })
  })

  it('swaps them for a quarter turn the other way too', () => {
    const output = iphonePortrait.replace('rotation of 90.00', 'rotation of -90.00')
    expect(parseDisplayDimensions(output)).toEqual({ width: 1080, height: 1920 })
  })

  it('reads the legacy rotate metadata older ffmpeg builds print', () => {
    const output = iphonePortrait.replace('      displaymatrix: rotation of 90.00 degrees', '      rotate          : 270')
    expect(parseDisplayDimensions(output)).toEqual({ width: 1080, height: 1920 })
  })

  it('leaves a half turn alone — the picture is upside down, not on its side', () => {
    const output = iphonePortrait.replace('rotation of 90.00', 'rotation of 180.00')
    expect(parseDisplayDimensions(output)).toEqual({ width: 1920, height: 1080 })
  })

  it('reads an unrotated stream as it is', () => {
    const output = iphonePortrait
      .replace('    Side data:\n', '')
      .replace('      displaymatrix: rotation of 90.00 degrees\n', '')
    expect(parseDisplayDimensions(output)).toEqual({ width: 1920, height: 1080 })
  })

  it('ignores a rotation that belongs to a later stream', () => {
    const output = `
  Stream #0:0[0x1](und): Video: h264, yuv420p, 1920x1080, 30 fps
    Metadata:
      handler_name    : Core Media Video
  Stream #0:1[0x2](und): Video: h264, yuv420p, 640x480, 30 fps
    Side data:
      displaymatrix: rotation of 90.00 degrees
`
    expect(parseDisplayDimensions(output)).toEqual({ width: 1920, height: 1080 })
  })

  it('returns null when there is no video stream to measure', () => {
    expect(parseDisplayDimensions('Stream #0:0: Audio: aac, 48000 Hz, stereo')).toBeNull()
  })
})
