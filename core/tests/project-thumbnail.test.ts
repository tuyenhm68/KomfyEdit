import { describe, it, expect } from 'vitest'
import { getProjectThumbnailAsset } from '../src/video-editor-utils'
import type { Project, Asset, TimelineClip } from '../src/project-model'

describe('getProjectThumbnailAsset', () => {
  const videoAsset1: Asset = {
    id: 'asset-video-1',
    type: 'video',
    path: '/path/to/clip1.mp4',
    bigThumbnailPath: '/path/to/thumb1.jpg',
    prompt: '',
    resolution: '1920x1080',
    createdAt: 1000,
  }

  const videoAsset2: Asset = {
    id: 'asset-video-2',
    type: 'video',
    path: '/path/to/clip2.mp4',
    bigThumbnailPath: '/path/to/thumb2.jpg',
    prompt: '',
    resolution: '1920x1080',
    createdAt: 2000,
  }

  const stickerAsset: Asset = {
    id: 'sticker-heart',
    type: 'image',
    path: 'stickers/heart.png',
    prompt: '',
    resolution: '512x512',
    createdAt: 3000,
  }

  const imageAsset: Asset = {
    id: 'asset-photo',
    type: 'image',
    path: '/path/to/photo.png',
    prompt: '',
    resolution: '1920x1080',
    createdAt: 4000,
  }

  it('selects the first video clip on track 1 (V1) at frame 1 even when sticker assets exist', () => {
    const clip1: TimelineClip = {
      id: 'clip-1',
      assetId: videoAsset1.id,
      type: 'video',
      startTime: 0,
      duration: 10,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      reversed: false,
      muted: false,
      volume: 1,
      trackIndex: 0, // Track 1 (V1)
      asset: videoAsset1,
      flipH: false,
      flipV: false,
      transitionIn: { type: 'none', duration: 0.5 },
      transitionOut: { type: 'none', duration: 0.5 },
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
      transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
      opacity: 100,
    }

    const stickerClip: TimelineClip = {
      id: 'clip-sticker',
      assetId: stickerAsset.id,
      type: 'image',
      startTime: 2,
      duration: 1,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      reversed: false,
      muted: false,
      volume: 1,
      trackIndex: 1, // Sticker track
      asset: stickerAsset,
      flipH: false,
      flipV: false,
      transitionIn: { type: 'none', duration: 0.5 },
      transitionOut: { type: 'none', duration: 0.5 },
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
      transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
      opacity: 100,
    }

    const project: Project = {
      version: 2,
      id: 'project-1',
      name: 'Test Project',
      createdAt: 1000,
      updatedAt: 2000,
      bins: {},
      assets: [stickerAsset, videoAsset1], // Note: sticker asset is first in array
      timelines: [
        {
          id: 'timeline-1',
          name: 'Timeline 1',
          createdAt: 1000,
          tracks: [
            { id: 'track-v1', name: 'V1', muted: false, locked: false, kind: 'video' },
            { id: 'track-sticker', name: 'Sticker', muted: false, locked: false, kind: 'sticker' },
          ],
          clips: [clip1, stickerClip],
          subtitles: [],
        },
      ],
      activeTimelineId: 'timeline-1',
    }

    const thumbnail = getProjectThumbnailAsset(project)
    expect(thumbnail).not.toBeNull()
    expect(thumbnail?.id).toBe(videoAsset1.id)
    expect(thumbnail?.path).toBe(videoAsset1.path)
  })

  it('selects the earliest video clip on track 1 when multiple clips are on track 1', () => {
    const clipLate: TimelineClip = {
      id: 'clip-late',
      assetId: videoAsset2.id,
      type: 'video',
      startTime: 15,
      duration: 5,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      reversed: false,
      muted: false,
      volume: 1,
      trackIndex: 0,
      asset: videoAsset2,
      flipH: false,
      flipV: false,
      transitionIn: { type: 'none', duration: 0.5 },
      transitionOut: { type: 'none', duration: 0.5 },
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
      transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
      opacity: 100,
    }

    const clipEarly: TimelineClip = {
      id: 'clip-early',
      assetId: videoAsset1.id,
      type: 'video',
      startTime: 0,
      duration: 10,
      trimStart: 0,
      trimEnd: 0,
      speed: 1,
      reversed: false,
      muted: false,
      volume: 1,
      trackIndex: 0,
      asset: videoAsset1,
      flipH: false,
      flipV: false,
      transitionIn: { type: 'none', duration: 0.5 },
      transitionOut: { type: 'none', duration: 0.5 },
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0 },
      transform: { scale: 100, positionX: 0, positionY: 0, rotation: 0, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 },
      opacity: 100,
    }

    const project: Project = {
      version: 2,
      id: 'project-1',
      name: 'Multi Clip Project',
      createdAt: 1000,
      updatedAt: 2000,
      bins: {},
      assets: [videoAsset2, videoAsset1],
      timelines: [
        {
          id: 'timeline-1',
          name: 'Timeline 1',
          createdAt: 1000,
          tracks: [
            { id: 'track-v1', name: 'V1', muted: false, locked: false, kind: 'video' },
          ],
          clips: [clipLate, clipEarly], // Notice clipLate is first in array
          subtitles: [],
        },
      ],
      activeTimelineId: 'timeline-1',
    }

    const thumbnail = getProjectThumbnailAsset(project)
    expect(thumbnail?.id).toBe(videoAsset1.id)
  })

  it('never returns a sticker asset even if it is the only asset in project', () => {
    const project: Project = {
      version: 2,
      id: 'project-sticker-only',
      name: 'Sticker Only Project',
      createdAt: 1000,
      updatedAt: 2000,
      bins: {},
      assets: [stickerAsset],
      timelines: [],
    }

    const thumbnail = getProjectThumbnailAsset(project)
    expect(thumbnail).toBeNull()
  })

  it('falls back to non-sticker image asset when no video assets or clips exist', () => {
    const project: Project = {
      version: 2,
      id: 'project-photo-only',
      name: 'Photo Only Project',
      createdAt: 1000,
      updatedAt: 2000,
      bins: {},
      assets: [stickerAsset, imageAsset],
      timelines: [],
    }

    const thumbnail = getProjectThumbnailAsset(project)
    expect(thumbnail?.id).toBe(imageAsset.id)
  })
})
