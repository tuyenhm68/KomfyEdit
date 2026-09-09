import { describe, it, expect } from 'vitest'
import { applyEditPatchToState, describePatch, editPatchSchema } from '../src/edit-patch'
import { createInitialEditorState } from '../src/editor-state'
import { selectActiveTimeline } from '../src/editor-selectors'
import type { EditorModel } from '../src/editor-state'

const CLIP_ID = 'clip-text-1'

function stateWithTextClip() {
  const model: EditorModel = {
    assets: [],
    bins: {},
    activeTimelineId: 'tl',
    timelines: [{
      id: 'tl',
      name: 'T',
      createdAt: 0,
      subtitles: [],
      tracks: [
        { id: 'v1', name: 'V1', kind: 'video', muted: false, locked: false },
        { id: 'v2', name: 'V2', kind: 'video', muted: false, locked: false },
      ],
      clips: [{
        id: CLIP_ID,
        assetId: null,
        type: 'text',
        startTime: 0,
        duration: 5,
        trimStart: 0,
        trimEnd: 0,
        speed: 1,
        reversed: false,
        muted: true,
        volume: 1,
        trackIndex: 1,
        asset: null,
        flipH: false,
        flipV: false,
        opacity: 100,
        textStyle: {
          text: 'Hello',
          fontSize: 48,
          color: '#ffffff',
          backgroundColor: 'transparent',
          positionX: 50,
          positionY: 50,
          strokeColor: '#000000',
          strokeWidth: 2,
          padding: 8,
          opacity: 100,
        },
      }] as never,
    }],
  }
  return createInitialEditorState(model)
}

function textClip(state: ReturnType<typeof stateWithTextClip>) {
  return selectActiveTimeline(state)?.clips.find(clip => clip.id === CLIP_ID) as any
}

describe('update_clip merges nested objects instead of replacing them', () => {
  it('changes the text without destroying the rest of the style', () => {
    // The shallow spread wiped 21 of 22 style fields: the clip kept its new
    // text and lost its font, colour, position and stroke.
    const patch = editPatchSchema.parse({
      operations: [{ op: 'update_clip', clipId: CLIP_ID, patch: { textStyle: { text: 'hello komfyedit' } } }],
    })
    const next = applyEditPatchToState(stateWithTextClip(), patch)
    const style = textClip(next).textStyle

    expect(style.text).toBe('hello komfyedit')
    expect(style.fontSize).toBe(48)
    expect(style.color).toBe('#ffffff')
    expect(style.strokeWidth).toBe(2)
    expect(Object.keys(style)).toHaveLength(10)
  })

  it('still replaces plain values outright', () => {
    const patch = editPatchSchema.parse({
      operations: [{ op: 'update_clip', clipId: CLIP_ID, patch: { opacity: 40 } }],
    })
    const next = applyEditPatchToState(stateWithTextClip(), patch)
    expect(textClip(next).opacity).toBe(40)
    expect(textClip(next).textStyle.text).toBe('Hello')
  })

  it('auto-normalizes top-level text patch on text clip to textStyle.text', () => {
    const patch = editPatchSchema.parse({
      operations: [{ op: 'update_clip', clipId: CLIP_ID, patch: { text: 'hello komfyedit' } }],
    })
    const next = applyEditPatchToState(stateWithTextClip(), patch)
    const clip = textClip(next)
    expect(clip.textStyle.text).toBe('hello komfyedit')
    expect(clip.textStyle.fontSize).toBe(48)
    expect(clip.text).toBeUndefined()
  })

  it('rejects a patch aimed at a clip that is not there', () => {
    // A patch aimed at a missing clip must fail loudly rather than report
    // success while the timeline stays as it was.
    const patch = editPatchSchema.parse({
      operations: [{ op: 'update_clip', clipId: 'khong-ton-tai', patch: { opacity: 1 } }],
    })
    expect(() => applyEditPatchToState(stateWithTextClip(), patch)).toThrow(/khong-ton-tai/)
  })
})

describe('describePatch names what update_clip changes', () => {
  it('lists the fields instead of calling it "1 other operation"', () => {
    const patch = editPatchSchema.parse({
      operations: [{ op: 'update_clip', clipId: CLIP_ID, patch: { textStyle: { text: 'x' } } }],
    })
    const description = describePatch(stateWithTextClip(), patch)
    expect(description).toContain('textStyle')
    expect(description).not.toMatch(/thao tác khác/)
  })

  it('leaves the state untouched', () => {
    const state = stateWithTextClip()
    const patch = editPatchSchema.parse({
      operations: [{ op: 'update_clip', clipId: CLIP_ID, patch: { opacity: 10 } }],
    })
    describePatch(state, patch)
    expect(textClip(state).opacity).toBe(100)
  })
})
