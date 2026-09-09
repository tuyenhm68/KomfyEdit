import { describe, it, expect } from 'vitest'
import { buildVideoFilterGraph } from '../electron/export/video-filter'
import type { ExportClip } from '../electron/export/timeline'
import { electronAPISchemas } from '../shared/electron-api-schema'

describe('Multi-layer Export & Video Filter Graph', () => {
  it('builds a composited filtergraph containing video, overlay video with transform, and text overlay clips', () => {
    const clips: ExportClip[] = [
      // Base video on Track 0 (V1)
      {
        id: 'clip-v1',
        type: 'video',
        path: '/dummy/base.mp4',
        startTime: 0,
        duration: 10,
        trimStart: 0,
        speed: 1,
        reversed: false,
        flipH: false,
        flipV: false,
        opacity: 100,
        trackIndex: 0,
        muted: false,
        volume: 1,
      },
      // Overlay image/video on Track 1 (V2) with transform (e.g. Picture-in-Picture)
      {
        id: 'clip-v2',
        type: 'video',
        path: '/dummy/overlay.mp4',
        startTime: 2,
        duration: 5,
        trimStart: 0,
        speed: 1,
        reversed: false,
        flipH: false,
        flipV: false,
        opacity: 90,
        trackIndex: 1,
        muted: false,
        volume: 1,
        transform: {
          scale: 40,
          positionX: 30,
          positionY: -20,
          rotation: 0,
          cropTop: 5,
          cropRight: 5,
          cropBottom: 5,
          cropLeft: 5,
        },
      },
      // Text overlay on Track 2 (V3)
      {
        id: 'clip-text-v3',
        type: 'text',
        path: '',
        startTime: 1,
        duration: 4,
        trimStart: 0,
        speed: 1,
        reversed: false,
        flipH: false,
        flipV: false,
        opacity: 100,
        trackIndex: 2,
        muted: false,
        volume: 1,
        textStyle: {
          text: 'Hello Multi-Layer World',
          fontSize: 64,
          color: '#FFCC00',
          backgroundColor: '#00000080',
          positionX: 50,
          positionY: 80,
          strokeColor: '#000000',
          strokeWidth: 2,
          padding: 8,
          opacity: 95,
        },
      },
    ]

    const { inputs, filterScript } = buildVideoFilterGraph(clips, {
      width: 1920,
      height: 1080,
      fps: 30,
      totalDuration: 10,
    })

    // Both media files must be present in inputs
    expect(inputs).toContain('/dummy/base.mp4')
    expect(inputs).toContain('/dummy/overlay.mp4')

    // Clip labels are now scoped per transition run — `c<run>_<clip>` — because
    // a run of clips joined by transitions folds into one stream before it is
    // composited. A clip with no transition is a run of one, as here.
    // Track 0 clip composited first onto [base] -> [ov0]
    expect(filterScript).toContain('[base][c0_0]overlay=')
    expect(filterScript).toContain('[ov0]')

    // Track 1 clip composited on top of [ov0] -> [ov1]
    expect(filterScript).toMatch(/\[ov0\]\[(c1_0|p1)\]overlay=/)
    expect(filterScript).toContain('[ov1]')

    // V2 overlay has transform: crop and scale applied
    expect(filterScript).toContain('crop=iw*')
    expect(filterScript).toContain('scale=768:432') // 40% of 1920x1080

    // V3 text clip is burned in via drawtext on top of the composite
    expect(filterScript).toContain('drawtext=text=\'Hello Multi-Layer World\'')
    expect(filterScript).toContain('fontcolor=0xFFCC00@0.95')
    expect(filterScript).toContain('enable=\'between(t\\,1.000\\,5.000)\'')
  })

  it('validates render.start schema with textStyle, transform, transitions, and effects', () => {
    const payload = {
      outputPath: 'C:/exports/my_video.mp4',
      codec: 'h264' as const,
      width: 1920,
      height: 1080,
      fps: 30,
      quality: 18,
      clips: [
        {
          id: 'v1',
          path: 'C:/media/video1.mp4',
          type: 'video',
          startTime: 0,
          duration: 10,
          trimStart: 0,
          speed: 1,
          reversed: false,
          flipH: false,
          flipV: false,
          opacity: 100,
          trackIndex: 0,
          muted: false,
          volume: 1,
          transform: {
            scale: 100,
            positionX: 0,
            positionY: 0,
            rotation: 0,
            cropTop: 0,
            cropRight: 0,
            cropBottom: 0,
            cropLeft: 0,
          },
        },
        {
          id: 't1',
          path: '',
          type: 'text',
          startTime: 1,
          duration: 3,
          trimStart: 0,
          speed: 1,
          reversed: false,
          flipH: false,
          flipV: false,
          opacity: 100,
          trackIndex: 1,
          muted: false,
          volume: 1,
          textStyle: {
            text: 'Overlay Title',
            fontSize: 48,
            color: '#FFFFFF',
            backgroundColor: 'transparent',
            positionX: 50,
            positionY: 50,
            strokeColor: 'transparent',
            strokeWidth: 0,
            padding: 0,
            opacity: 100,
          },
        },
      ],
    }

    const parseResult = electronAPISchemas['render.start'].input.safeParse(payload)
    expect(parseResult.success).toBe(true)
  })
})
