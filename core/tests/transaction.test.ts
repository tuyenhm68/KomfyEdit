import { describe, expect, it } from 'vitest'
import {
  createInitialEditorState,
  beginTransaction,
  commitTransaction,
  commitTransactionOrThrow,
  rollbackTransaction,
  runInTransaction,
  isTransactionActive,
  undo,
  replaceActiveTimeline,
  splitClipsAtTime,
  toggleTrackLock,
  DEFAULT_CLIP_TRANSITION,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_CLIP_TRANSFORM,
  type Timeline,
  type TimelineClip,
  type Track,
} from '../src'

const createMockClip = (overrides: Partial<TimelineClip> = {}): TimelineClip => ({
  id: `clip-${Math.random().toString(36).slice(2, 8)}`,
  assetId: 'asset-1',
  type: 'video',
  startTime: 0,
  duration: 30,
  trimStart: 0,
  trimEnd: 0,
  speed: 1,
  reversed: false,
  muted: false,
  trackIndex: 0,
  volume: 1,
  asset: null,
  flipH: false,
  flipV: false,
  transitionIn: DEFAULT_CLIP_TRANSITION,
  transitionOut: DEFAULT_CLIP_TRANSITION,
  colorCorrection: DEFAULT_COLOR_CORRECTION,
  transform: DEFAULT_CLIP_TRANSFORM,
  opacity: 100,
  ...overrides,
})

const createMockTimeline = (
  clips: TimelineClip[] = [],
  tracks?: Track[],
): Timeline => ({
  id: 'timeline-1',
  name: 'Main Timeline',
  createdAt: Date.now(),
  tracks: tracks ?? [
    { id: 'v1', kind: 'video', name: 'V1', locked: false, muted: false },
    { id: 'v2', kind: 'video', name: 'V2', locked: false, muted: false },
  ],
  clips,
  subtitles: [],
})

function makeInitialStateWithClip() {
  const clip = createMockClip({ id: 'clip-1', trackIndex: 0, startTime: 0, duration: 30 })
  const timeline = createMockTimeline([clip])
  return createInitialEditorState({
    assets: [],
    bins: {},
    timelines: [timeline],
    activeTimelineId: timeline.id,
  })
}

describe('S2-1: Editing Transactions (beginTransaction / commitTransaction / rollbackTransaction)', () => {
  it('20 thao tác trong một giao dịch → đúng 1 mục trong undoStack (test)', () => {
    const initialState = makeInitialStateWithClip()
    expect(initialState.history.undoStack).toHaveLength(0)

    // Begin transaction
    let tx = beginTransaction(initialState)
    expect(isTransactionActive(tx)).toBe(true)

    // Apply 20 operations inside transaction:
    // Adding/updating clips in timeline
    for (let i = 1; i <= 20; i++) {
      tx = replaceActiveTimeline(tx, (timeline: Timeline) => ({
        ...timeline,
        clips: [
          ...timeline.clips,
          createMockClip({
            id: `clip-extra-${i}`,
            trackIndex: 1, // overlay video track V2
            startTime: i * 2,
            duration: 1.5,
          }),
        ],
      }))
    }

    // Intermediate operations must NOT pollute undoStack
    expect(tx.history.undoStack).toHaveLength(0)
    // 1 base clip + 20 added clips = 21 clips
    expect(tx.editorModel.timelines[0].clips).toHaveLength(21)

    // Commit transaction
    const commitResult = commitTransaction(tx)
    expect(commitResult.success).toBe(true)
    if (!commitResult.success) throw new Error('Commit failed')

    const committedState = commitResult.state
    expect(isTransactionActive(committedState)).toBe(false)

    // Must have EXACTLY 1 undo entry in undoStack
    expect(committedState.history.undoStack).toHaveLength(1)

    // Undoing the transaction restores the original timeline state
    const undoneState = undo(committedState)
    expect(undoneState.editorModel.timelines[0].clips).toHaveLength(1)
    expect(undoneState.editorModel.timelines[0].clips[0].id).toBe('clip-1')
    expect(undoneState.editorModel.timelines[0].clips[0].duration).toBe(30)
  })

  it('Rollback → state giống hệt trước khi begin (test so sánh sâu)', () => {
    const initialState = makeInitialStateWithClip()

    let tx = beginTransaction(initialState)
    // Perform multiple destructive operations
    tx = splitClipsAtTime(tx, ['clip-1'], 5)
    tx = replaceActiveTimeline(tx, (timeline: Timeline) => ({
      ...timeline,
      clips: [], // empty timeline
    }))

    expect(tx.editorModel.timelines[0].clips).toHaveLength(0)

    // Rollback
    const rolledBack = rollbackTransaction(tx)

    // Deep equality: identical in every field
    expect(rolledBack).toEqual(initialState)
    // Exact reference equality: returns baseState unchanged
    expect(rolledBack).toBe(initialState)
    expect(isTransactionActive(rolledBack)).toBe(false)
  })

  it('Validate thất bại lúc commit → tự rollback, state không đổi, trả lỗi', () => {
    const initialState = makeInitialStateWithClip()

    let tx = beginTransaction(initialState)

    // Perform an invalid mutation: add clip referencing invalid track index 999
    tx = replaceActiveTimeline(tx, (timeline: Timeline) => ({
      ...timeline,
      clips: [
        ...timeline.clips,
        createMockClip({
          id: 'invalid-clip-999',
          trackIndex: 999, // Non-existent track!
          startTime: 30,
          duration: 10,
        }),
      ],
    }))

    // Attempt to commit
    const commitResult = commitTransaction(tx)

    // Must fail and return structured error
    expect(commitResult.success).toBe(false)
    if (commitResult.success) throw new Error('Commit should have failed')

    expect(commitResult.error).toContain('timeline validation failed')
    expect(commitResult.validationErrors.length).toBeGreaterThan(0)
    expect(commitResult.validationErrors[0].rule).toBe('CLIP_INVALID_TRACK')

    // State must be rolled back to the EXACT reference before transaction began
    expect(commitResult.state).toBe(initialState)
    expect(commitResult.state).toEqual(initialState)
  })

  it('Validate thất bại khi sửa clip trên track bị khoá → tự rollback và trả lỗi LOCKED_TRACK_MODIFIED', () => {
    const initialState = makeInitialStateWithClip()
    // Lock track V1 (id 'v1')
    const lockedState = toggleTrackLock(initialState, 'v1')
    expect(lockedState.editorModel.timelines[0].tracks[0].locked).toBe(true)

    let tx = beginTransaction(lockedState)

    // Modify clip duration on the locked track
    tx = replaceActiveTimeline(tx, (timeline: Timeline) => ({
      ...timeline,
      clips: [
        {
          ...timeline.clips[0],
          duration: 45,
        },
      ],
    }))

    const commitResult = commitTransaction(tx)
    expect(commitResult.success).toBe(false)
    if (commitResult.success) throw new Error('Commit should have failed')

    expect(commitResult.validationErrors.some(e => e.rule === 'LOCKED_TRACK_MODIFIED')).toBe(true)
    expect(commitResult.state).toBe(lockedState)
  })

  it('Giao dịch lồng nhau bị từ chối rõ ràng', () => {
    const initialState = makeInitialStateWithClip()

    const tx = beginTransaction(initialState)
    expect(isTransactionActive(tx)).toBe(true)

    // Attempt to begin a nested transaction on already active transaction
    expect(() => {
      beginTransaction(tx)
    }).toThrow(/Transaction already in progress: nested transactions are not supported/i)
  })

  it('commitTransaction và rollbackTransaction khi không có giao dịch ném lỗi rõ ràng', () => {
    const initialState = makeInitialStateWithClip()

    expect(() => {
      commitTransaction(initialState)
    }).toThrow(/No active transaction to commit/i)

    expect(() => {
      rollbackTransaction(initialState)
    }).toThrow(/No active transaction to rollback/i)
  })

  it('commitTransactionOrThrow ném lỗi khi validate thất bại và trả EditorState khi thành công', () => {
    const initialState = makeInitialStateWithClip()

    // Success case
    let txSuccess = beginTransaction(initialState)
    txSuccess = splitClipsAtTime(txSuccess, ['clip-1'], 10)
    const committed = commitTransactionOrThrow(txSuccess)
    expect(isTransactionActive(committed)).toBe(false)
    expect(committed.history.undoStack).toHaveLength(1)

    // Failure case
    let txFail = beginTransaction(initialState)
    txFail = replaceActiveTimeline(txFail, (timeline: Timeline) => ({
      ...timeline,
      clips: [
        createMockClip({
          id: 'bad-clip',
          trackIndex: 50,
          startTime: 0,
          duration: 5,
        }),
      ],
    }))

    expect(() => {
      commitTransactionOrThrow(txFail)
    }).toThrow(/Commit rejected: timeline validation failed/i)
  })

  it('runInTransaction tự động commit khi thành công và rollback khi gặp lỗi', () => {
    const initialState = makeInitialStateWithClip()

    // 1. Successful runInTransaction
    const successResult = runInTransaction(initialState, tx => {
      return splitClipsAtTime(tx, ['clip-1'], 15)
    })
    expect(successResult.success).toBe(true)
    if (!successResult.success) throw new Error('Should succeed')
    expect(successResult.state.history.undoStack).toHaveLength(1)
    expect(successResult.state.editorModel.timelines[0].clips).toHaveLength(2)

    // 2. Failing runInTransaction due to validation error
    const failResult = runInTransaction(initialState, tx => {
      return replaceActiveTimeline(tx, (timeline: Timeline) => ({
        ...timeline,
        clips: [{ ...timeline.clips[0], trackIndex: 888 }],
      }))
    })
    expect(failResult.success).toBe(false)
    expect(failResult.state).toBe(initialState)

    // 3. Failing runInTransaction due to exception thrown inside callback
    const throwResult = runInTransaction(initialState, () => {
      throw new Error('Something broke inside transaction callback')
    })
    expect(throwResult.success).toBe(false)
    if (throwResult.success) throw new Error('Should have failed')
    expect(throwResult.error).toContain('Something broke inside transaction callback')
    expect(throwResult.state).toBe(initialState)
  })

  it('Giao dịch không có thay đổi không sinh thêm snapshot trong undoStack', () => {
    const initialState = makeInitialStateWithClip()
    const tx = beginTransaction(initialState)

    // Commit without changing any assets, bins, or timelines
    const commitResult = commitTransaction(tx)
    expect(commitResult.success).toBe(true)
    if (!commitResult.success) throw new Error('Should succeed')
    expect(commitResult.state.history.undoStack).toHaveLength(0)
  })
})
