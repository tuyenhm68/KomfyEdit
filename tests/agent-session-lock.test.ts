import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  createInitialEditorState,
  setIsAgentSessionActive,
  selectIsAgentSessionActive,
  replaceEditorModel,
  getEditorModel,
  updatedProject,
  type Project,
  saveProjectAtomic,
} from '@komfyedit/core'

describe('S5-1: Agent Session Lock & Race Condition Prevention', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'komfy-session-lock-test-'))
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // best effort
    }
  })

  const createDummyProject = (id: string, name: string): Project => ({
    id,
    name,
    createdAt: 1000,
    updatedAt: 1000,
    assets: [],
    bins: { root: [] },
    timelines: [
      {
        id: 'timeline-1',
        name: 'Main Timeline',
        tracks: [
          { id: 'track-v1', name: 'V1', kind: 'video', muted: false, locked: false, sourcePatched: true },
        ],
        clips: [],
        subtitles: [],
      },
    ],
    activeTimelineId: 'timeline-1',
  })

  it('sets and selects isAgentSessionActive correctly', () => {
    const proj = createDummyProject('p1', 'Test')
    const state = createInitialEditorState(getEditorModel(proj))
    expect(selectIsAgentSessionActive(state)).toBe(false)

    const locked = setIsAgentSessionActive(state, true)
    expect(selectIsAgentSessionActive(locked)).toBe(true)

    const unlocked = setIsAgentSessionActive(locked, false)
    expect(selectIsAgentSessionActive(unlocked)).toBe(false)
  })

  it('prevents renderer autosave from overwriting agent edits during active session', async () => {
    const projectId = 'race-proj-1'
    const initialProject = createDummyProject(projectId, 'Initial Project')
    const projectFilePath = path.join(tempDir, `${projectId}.json`)

    // 1. Initial save to disk
    saveProjectAtomic(projectFilePath, initialProject)

    // 2. Renderer has in-memory state with a modified name
    let editorState = createInitialEditorState(getEditorModel(initialProject))
    let inMemoryProject = { ...initialProject, name: 'User In-Memory Name' }
    editorState = replaceEditorModel(editorState, getEditorModel(inMemoryProject))

    // 3. User launches EditPilot -> onRunStart flushes pending in-memory changes & acquires lock
    saveProjectAtomic(projectFilePath, updatedProject(inMemoryProject, editorState.editorModel))
    editorState = setIsAgentSessionActive(editorState, true)
    expect(selectIsAgentSessionActive(editorState)).toBe(true)

    // Verify disk now has the flushed user edits
    const diskBeforeAgent = JSON.parse(fs.readFileSync(projectFilePath, 'utf8')) as Project
    expect(diskBeforeAgent.name).toBe('User In-Memory Name')

    // 4. While locked, a simulated renderer debounce tick tries to run
    let didAutosaveRun = false
    const simulateRendererDebounce = () => {
      if (selectIsAgentSessionActive(editorState)) {
        // Locked: Autosave is paused!
        return
      }
      // If not locked, it would overwrite disk
      saveProjectAtomic(projectFilePath, inMemoryProject)
      didAutosaveRun = true
    }
    simulateRendererDebounce()
    expect(didAutosaveRun).toBe(false)

    // 5. Agent applies an edit patch directly to disk
    const agentModifiedProject: Project = {
      ...diskBeforeAgent,
      name: 'Agent Edited Title',
      timelines: [
        {
          ...diskBeforeAgent.timelines[0],
          clips: [
            {
              id: 'clip-agent-1',
              trackIndex: 0,
              startTime: 0,
              duration: 5,
              type: 'video',
              name: 'Agent Clip',
              assetId: 'asset-1',
              inPoint: 0,
              outPoint: 5,
              speed: 1,
            },
          ],
        },
      ],
    }
    saveProjectAtomic(projectFilePath, agentModifiedProject)

    // 6. Again, while locked, another autosave debounce attempt occurs
    simulateRendererDebounce()
    expect(didAutosaveRun).toBe(false)

    // 7. EditPilot finishes -> onRunEnd reloads from disk and unlocks
    const reloadedFromDisk = JSON.parse(fs.readFileSync(projectFilePath, 'utf8')) as Project
    editorState = replaceEditorModel(editorState, getEditorModel(reloadedFromDisk))
    editorState = setIsAgentSessionActive(editorState, false)

    // 8. Assert: Agent edits are preserved 100% in-memory and on disk
    expect(selectIsAgentSessionActive(editorState)).toBe(false)
    expect(editorState.editorModel.timelines[0].clips).toHaveLength(1)
    expect(editorState.editorModel.timelines[0].clips[0].id).toBe('clip-agent-1')
    expect(reloadedFromDisk.name).toBe('Agent Edited Title')
  })
})
