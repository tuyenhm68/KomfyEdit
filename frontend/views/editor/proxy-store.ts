import { create } from 'zustand'

interface ProxyStoreState {
  progressMap: Record<string, number>
  setProgress: (assetId: string, progress: number) => void
  removeProgress: (assetId: string) => void
  clearAll: () => void
}

export const useProxyStore = create<ProxyStoreState>((set) => ({
  progressMap: {},
  setProgress: (assetId, progress) =>
    set((state) => ({
      progressMap: { ...state.progressMap, [assetId]: progress },
    })),
  removeProgress: (assetId) =>
    set((state) => {
      if (!(assetId in state.progressMap)) return state
      const next = { ...state.progressMap }
      delete next[assetId]
      return { progressMap: next }
    }),
  clearAll: () => set({ progressMap: {} }),
}))
