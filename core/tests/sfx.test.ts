import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  SFX_DEFINITIONS,
  SFX_CATEGORIES,
  getSfxDefinition,
  isValidSfxId,
  resolveSfxRelativePath,
} from '../src/sfx'
import { addSfxClip } from '../src/editor-actions'
import { createInitialEditorState } from '../src/editor-state'
import { selectClips, selectTracks, selectAssets } from '../src/editor-selectors'
import { createDefaultTimeline } from '../src/project-model'
import { validateEditPatch, describePatch, applyEditPatchToState } from '../src/edit-patch'

describe('sfx core definitions', () => {
  it('defines 29 studio-quality SFX assets', () => {
    expect(SFX_DEFINITIONS.length).toBe(29)
    const ids = SFX_DEFINITIONS.map(s => s.id)
    expect(ids).toContain('pop')
    expect(ids).toContain('whoosh')
    expect(ids).toContain('whoosh-fast')
    expect(ids).toContain('whoosh-deep')
    expect(ids).toContain('glitch')
    expect(ids).toContain('rewind')
    expect(ids).toContain('ding')
    expect(ids).toContain('alert')
    expect(ids).toContain('cash-register')
    expect(ids).toContain('sub-boom')
    expect(ids).toContain('coin')
    expect(ids).toContain('camera-shutter')
    expect(ids).toContain('fail-trombone')
    expect(ids).toContain('applause')
  })

  it('contains expected categories', () => {
    const ids = SFX_CATEGORIES.map(c => c.id)
    expect(ids).toContain('all')
    expect(ids).toContain('transition')
    expect(ids).toContain('accent')
    expect(ids).toContain('notification')
    expect(ids).toContain('impact')
    expect(ids).toContain('comedy')
    expect(ids).toContain('foley')
  })

  it('retrieves sfx definition by id correctly', () => {
    const whoosh = getSfxDefinition('whoosh')
    expect(whoosh).toBeDefined()
    expect(whoosh?.filename).toBe('whoosh.wav')
    expect(isValidSfxId('whoosh')).toBe(true)
    expect(isValidSfxId('alert')).toBe(true)
    expect(isValidSfxId('sub-boom')).toBe(true)
    expect(isValidSfxId('nonexistent')).toBe(false)
  })

  it('resolves relative sfx path', () => {
    expect(resolveSfxRelativePath('pop')).toBe('sfx/pop.wav')
    expect(resolveSfxRelativePath('sub-boom')).toBe('sfx/sub-boom.wav')
    expect(resolveSfxRelativePath('custom-sound.wav')).toBe('sfx/custom-sound.wav')
  })

  it('ensures all 29 SFX WAV files exist on disk in public/sfx and resources/sfx', () => {
    const publicDir = path.resolve(__dirname, '../../public/sfx')
    const resourcesDir = path.resolve(__dirname, '../../resources/sfx')

    expect(fs.existsSync(publicDir)).toBe(true)
    expect(fs.existsSync(resourcesDir)).toBe(true)

    for (const sfx of SFX_DEFINITIONS) {
      const pubPath = path.join(publicDir, sfx.filename)
      const resPath = path.join(resourcesDir, sfx.filename)
      expect(fs.existsSync(pubPath)).toBe(true)
      expect(fs.existsSync(resPath)).toBe(true)
      const pubStat = fs.statSync(pubPath)
      expect(pubStat.size).toBeGreaterThan(1000) // Minimum valid WAV size
    }
  })
})

describe('addSfxClip action', () => {
  function baseState() {
    const timeline = createDefaultTimeline('Timeline 1')
    return createInitialEditorState({
      timelines: [timeline],
      activeTimelineId: timeline.id,
      assets: [],
      bins: {},
    })
  }

  it('inserts an SFX clip and creates an audio track if none exists', () => {
    const initial = baseState()
    const state = addSfxClip(initial, { sfxId: 'whoosh', startTime: 1.0 })

    const clips = selectClips(state)
    expect(clips.length).toBe(1)
    const clip = clips[0]
    expect(clip.type).toBe('audio')
    expect(clip.startTime).toBe(1.0)
    expect(clip.duration).toBe(0.45)
    expect(clip.importedName).toBe('SFX: Whoosh / Swoosh')

    const assets = selectAssets(state)
    expect(assets.length).toBe(1)
    expect(assets[0].source).toBe('sfx')
    expect(assets[0].path).toBe('sfx/whoosh.wav')

    const tracks = selectTracks(state)
    const audioTrack = tracks[clip.trackIndex]
    expect(audioTrack.kind).toBe('audio')
  })

  it('places subsequent overlapping SFX on separate audio tracks (e.g. A2)', () => {
    let state = baseState()
    state = addSfxClip(state, { sfxId: 'whoosh', startTime: 1.0 })
    state = addSfxClip(state, { sfxId: 'ding', startTime: 1.1 })

    const clips = selectClips(state)
    expect(clips.length).toBe(2)
    // Clips overlap in time, so they must be on different audio tracks
    expect(clips[0].trackIndex).not.toBe(clips[1].trackIndex)

    const tracks = selectTracks(state)
    const audioTracks = tracks.filter(t => t.kind === 'audio')
    expect(audioTracks.length).toBeGreaterThanOrEqual(2)
  })
})

describe('edit-patch add_sfx integration', () => {
  function baseState() {
    const timeline = createDefaultTimeline('Timeline 1')
    return createInitialEditorState({
      timelines: [timeline],
      activeTimelineId: timeline.id,
      assets: [],
      bins: {},
    })
  }

  it('validates and describes an add_sfx operation', () => {
    const state = baseState()
    const patch = {
      version: 1 as const,
      operations: [
        {
          op: 'add_sfx' as const,
          sfxId: 'pop',
          startTime: 2.0,
          volume: 1.5,
        },
      ],
    }

    const validation = validateEditPatch(state, patch)
    expect(validation.valid).toBe(true)

    const desc = describePatch(state, patch)
    expect(desc).toContain('add 1 sound effects')
    expect(desc).toContain('Pop / Bubble')
  })

  it('executes add_sfx through executePatchOperations', () => {
    const state = baseState()
    const patch = {
      version: 1 as const,
      operations: [
        {
          op: 'add_sfx' as const,
          sfxId: 'cash-register',
          startTime: 0.5,
        },
      ],
    }

    const next = applyEditPatchToState(state, patch)
    const clips = selectClips(next)
    expect(clips.length).toBe(1)
    expect(clips[0].importedName).toBe('SFX: Cash Register Cha-Ching')
    expect(clips[0].duration).toBe(0.75)
  })
})
