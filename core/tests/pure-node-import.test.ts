import { describe, it, expect } from 'vitest'
import {
  insertAssetsToTimeline,
  createInitialEditorState,
  createDefaultTimeline,
  type Asset,
  type EditorModel,
} from '../src/index'

describe('S1-1: Pure Node import and timeline operations in core package', () => {
  it('imports @komfyedit/core in Node and calls insertAssetsToTimeline without React/DOM', () => {
    const defaultTimeline = createDefaultTimeline('Timeline 1')

    const initialModel: EditorModel = {
      assets: [],
      bins: {},
      timelines: [defaultTimeline],
      activeTimelineId: defaultTimeline.id,
    }

    const defaultLayout = {
      leftPanelWidth: 470,
      rightPanelWidth: 366,
      timelineHeight: 300,
      assetsHeight: 0,
    }

    const state = createInitialEditorState(initialModel, defaultLayout)

    const sampleAsset: Asset = {
      id: 'asset-test-1',
      type: 'video',
      path: '/media/sample_video.mp4',
      prompt: 'sample_video.mp4',
      resolution: '1920x1080',
      duration: 10,
      createdAt: Date.now(),
    }

    // Call insertAssetsToTimeline from core
    const updatedState = insertAssetsToTimeline(state, {
      assets: [sampleAsset],
      startTime: 0,
      trackIndex: 0,
    })

    expect(updatedState).toBeDefined()
    const activeTimeline = updatedState.editorModel.timelines.find(
      t => t.id === updatedState.editorModel.activeTimelineId,
    )
    expect(activeTimeline).toBeDefined()
    expect(activeTimeline?.clips.length).toBeGreaterThan(0)

    const insertedClip = activeTimeline?.clips[0]
    expect(insertedClip?.duration).toBe(10)
    expect(insertedClip?.startTime).toBe(0)
  })
})
