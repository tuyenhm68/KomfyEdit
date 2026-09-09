import { create } from 'zustand'

export interface CachedSegmentInfo {
  id: string
  startTime: number
  endTime: number
  duration: number
  hash: string
  ready: boolean
  rendering: boolean
  cachePath?: string
  reasons: string[]
}

interface RenderCacheStoreState {
  segments: CachedSegmentInfo[]
  setSegments: (segments: CachedSegmentInfo[]) => void
  updateSegment: (hash: string, patch: Partial<CachedSegmentInfo>) => void
  clearAll: () => void
}

export const useRenderCacheStore = create<RenderCacheStoreState>((set) => ({
  segments: [],
  setSegments: (segments) => set({ segments }),
  updateSegment: (hash, patch) =>
    set((state) => ({
      segments: state.segments.map((seg) =>
        seg.hash === hash ? { ...seg, ...patch } : seg,
      ),
    })),
  clearAll: () => set({ segments: [] }),
}))
