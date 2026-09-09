import React, { createContext, useCallback, useContext, useMemo } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import type { EditorState } from './editor-state'
import { equalUndoSnapshot, getUndoSnapshot } from './editor-state'
import * as editorActions from './editor-actions'

const MAX_UNDO_HISTORY = 50

type EditorSetStateAction = React.SetStateAction<EditorState>

interface EditorStore {
  state: EditorState
  setStateWithHistory: (value: EditorSetStateAction) => void
  setStateWithoutHistory: (value: EditorSetStateAction) => void
}

export type EditorStoreApi = StoreApi<EditorStore>

function resolveStateAction(value: EditorSetStateAction, prev: EditorState): EditorState {
  return typeof value === 'function'
    ? (value as (prevState: EditorState) => EditorState)(prev)
    : value
}

export function createEditorStore(initialState: EditorState): EditorStoreApi {
  return createStore<EditorStore>()((set) => ({
    state: initialState,
    setStateWithHistory: (value) => {
      set((prev) => ({
        state: recordHistoryStep(prev.state, resolveStateAction(value, prev.state)),
      }))
    },
    setStateWithoutHistory: (value) => {
      set((prev) => ({
        state: resolveStateAction(value, prev.state),
      }))
    },
  }))
}

function recordHistoryStep(prev: EditorState, next: EditorState): EditorState {
  if (next === prev) return prev
  if (next.transaction) return next

  const beforeSnapshot = getUndoSnapshot(prev)
  const afterSnapshot = getUndoSnapshot(next)
  if (equalUndoSnapshot(beforeSnapshot, afterSnapshot)) return next

  return {
    ...next,
    history: {
      undoStack: [
        ...prev.history.undoStack.slice(-(MAX_UNDO_HISTORY - 1)),
        beforeSnapshot,
      ],
      redoStack: [],
    },
  }
}

const EditorStoreContext = createContext<EditorStoreApi | null>(null)

export interface EditorStoreProviderProps {
  store: EditorStoreApi
  children: React.ReactNode
}

export function EditorStoreProvider({ store, children }: EditorStoreProviderProps) {
  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  )
}

function useEditorStoreContext(): EditorStoreApi {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error('EditorStoreProvider is missing')
  return store
}

export const useEditorStoreApi = useEditorStoreContext

export function useEditorStore<T>(
  selector: (state: EditorState) => T,
  equalityFn?: (left: T, right: T) => boolean,
): T {
  const store = useEditorStoreContext()
  return useStoreWithEqualityFn(store, state => selector(state.state), equalityFn)
}

/**
 * Subscribe to a slice of editor state *outside* the render cycle.
 *
 * Use this when a value changes far more often than the UI that consumes it can
 * afford to re-render — the playhead being the motivating case, where a store
 * subscription drives a couple of DOM writes instead of re-rendering every clip.
 * Returns an unsubscribe function.
 */
export function useEditorSubscribeToSlice(): <T>(
  selector: (state: EditorState) => T,
  onChange: (value: T) => void,
) => () => void {
  const store = useEditorStoreContext()
  return useCallback((selector, onChange) => {
    let previous = selector(store.getState().state)
    return store.subscribe((next) => {
      const value = selector(next.state)
      if (Object.is(value, previous)) return
      previous = value
      onChange(value)
    })
  }, [store])
}

export function useEditorGetState(): () => EditorState {
  const store = useEditorStoreContext()
  return useCallback(() => store.getState().state, [store])
}

function useEditorStoreSetStateWithHistory(): (value: EditorSetStateAction) => void {
  const store = useEditorStoreContext()
  return useCallback((value: EditorSetStateAction) => {
    store.getState().setStateWithHistory(value)
  }, [store])
}

function useEditorStoreSetStateWithoutHistory(): (value: EditorSetStateAction) => void {
  const store = useEditorStoreContext()
  return useCallback((value: EditorSetStateAction) => {
    store.getState().setStateWithoutHistory(value)
  }, [store])
}

type EditorActionModule = typeof editorActions

type ReducerActionKeys = {
  [K in keyof EditorActionModule]:
    EditorActionModule[K] extends (state: EditorState, ...args: any[]) => EditorState ? K : never
}[keyof EditorActionModule]

export type EditorActions = {
  [K in ReducerActionKeys]:
    EditorActionModule[K] extends (state: EditorState, ...args: infer A) => EditorState
      ? (...args: A) => void
      : never
}

export function useEditorActions(): EditorActions {
  const setStateWithHistory = useEditorStoreSetStateWithHistory()
  const setStateWithoutHistory = useEditorStoreSetStateWithoutHistory()
  return useMemo(() => {
    const actions = {} as EditorActions
    const source = editorActions as Record<string, (...args: any[]) => any>

    for (const [key, action] of Object.entries(source)) {
      ;(actions as Record<string, (...args: any[]) => void>)[key] = (...args: any[]) => {
        const apply = key === 'undo' || key === 'redo'
          ? setStateWithoutHistory
          : setStateWithHistory
        apply(prev => action(prev, ...args))
      }
    }
    return actions
  }, [setStateWithHistory, setStateWithoutHistory])
}
