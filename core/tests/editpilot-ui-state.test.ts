import { describe, it, expect } from 'vitest'
import { createInitialEditorState } from '../src/editor-state'
import { setShowEditPilot, toggleEditPilot } from '../src/editor-actions'
import { selectShowEditPilot } from '../src/editor-selectors'

function freshState() {
  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines: [],
    activeTimelineId: null,
  })
}

describe('EditPilot panel visibility', () => {
  it('starts closed', () => {
    expect(selectShowEditPilot(freshState())).toBe(false)
  })

  it('opens and closes', () => {
    const opened = setShowEditPilot(freshState(), true)
    expect(selectShowEditPilot(opened)).toBe(true)
    expect(selectShowEditPilot(setShowEditPilot(opened, false))).toBe(false)
  })

  it('toggles', () => {
    const once = toggleEditPilot(freshState())
    expect(selectShowEditPilot(once)).toBe(true)
    expect(selectShowEditPilot(toggleEditPilot(once))).toBe(false)
  })

  it('does not disturb the timeline document or the undo stack', () => {
    const before = freshState()
    const after = setShowEditPilot(before, true)
    // A panel toggle is chrome, not an edit: the document must be untouched.
    expect(after.editorModel).toBe(before.editorModel)
    expect(after.history.undoStack).toHaveLength(0)
  })
})
