import { describe, it, expect } from 'vitest'
import { qcCheck } from '../src/qc-check'
import type { EditorModel } from '../src/editor-state'

function modelWithClip(overrides: Record<string, unknown>): EditorModel {
  return {
    assets: [],
    bins: {},
    activeTimelineId: 'tl',
    timelines: [{
      id: 'tl', name: 'T', createdAt: 0, subtitles: [],
      tracks: [{ id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false }],
      clips: [{
        id: 'c1', assetId: null, asset: null, startTime: 0, duration: 5,
        trimStart: 0, trimEnd: 0, speed: 1, reversed: false, muted: false,
        volume: 1, trackIndex: 0, flipH: false, flipV: false, opacity: 100,
        ...overrides,
      }] as never,
    }],
  }
}

const mediaIssues = (model: EditorModel) =>
  qcCheck(model).filter(issue => issue.type === 'MISSING_MEDIA')

describe('qc_check and clips that legitimately have no media', () => {
  it('does not flag a text overlay', () => {
    // A title has no source file. Flagging it kept every project containing one
    // permanently in error, which blocked every agent edit.
    expect(mediaIssues(modelWithClip({ type: 'text', textStyle: { text: 'Hello' } }))).toHaveLength(0)
  })

  it('does not flag an adjustment layer', () => {
    expect(mediaIssues(modelWithClip({ type: 'adjustment' }))).toHaveLength(0)
  })

  it('still flags a video clip with no media', () => {
    // The check must keep working where it is meaningful.
    expect(mediaIssues(modelWithClip({ type: 'video' }))).toHaveLength(1)
  })

  it('still flags an audio clip with no media', () => {
    expect(mediaIssues(modelWithClip({ type: 'audio' }))).toHaveLength(1)
  })

  it('leaves a text-only timeline clean enough to edit', () => {
    const errors = qcCheck(modelWithClip({ type: 'text', textStyle: { text: 'Hello' } }))
      .filter(issue => issue.severity === 'error')
    expect(errors).toHaveLength(0)
  })
})
