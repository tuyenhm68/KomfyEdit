import React, { type RefObject } from 'react'
import { Plus, X, FolderPlus, Folder, Trash2, FolderOpen } from 'lucide-react'
import type { Asset } from '../../types/project-model'
import { COLOR_LABELS } from './video-editor-utils'
import { equalAssetBins, selectAssetBins } from './editor-selectors'
import { useEditorActions, useEditorStore } from './editor-store'

export interface AssetContextMenuProps {
  asset: Asset
  targetIds: string[]
  assetContextMenu: { assetId: string; x: number; y: number }
  assetContextMenuRef: RefObject<HTMLDivElement>
  addClipToTimeline: (asset: Asset, trackIndex?: number, startTime?: number) => void
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setAssetContextMenu: React.Dispatch<React.SetStateAction<{ assetId: string; x: number; y: number } | null>>
  openCreateBinEditor: (assetIds: string[]) => void
}

export function AssetContextMenu({
  asset,
  targetIds,
  assetContextMenu,
  assetContextMenuRef,
  addClipToTimeline,
  setSelectedAssetIds,
  setAssetContextMenu,
  openCreateBinEditor,
}: AssetContextMenuProps) {
  const actions = useEditorActions()
  const bins = useEditorStore(selectAssetBins, equalAssetBins)
  const isMulti = targetIds.length > 1

  const closeMenu = () => setAssetContextMenu(null)
  const clearSelection = () => setSelectedAssetIds(new Set())

  const setColor = (colorLabel?: string) => {
    for (const id of targetIds) {
      actions.setAssetColorLabel(id, colorLabel)
    }
    closeMenu()
  }

  const moveToBin = (binId?: string) => {
    actions.assignAssetsToBin(targetIds, binId)
    clearSelection()
    closeMenu()
  }

  const deleteTargetAssets = () => {
    actions.deleteAssets(targetIds)
    clearSelection()
    closeMenu()
  }

  return (
    <div
      ref={assetContextMenuRef}
      className="fixed bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl py-1.5 z-[60] min-w-[180px] text-xs"
      style={{ left: assetContextMenu.x, top: assetContextMenu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {isMulti && (
        <div className="px-3 py-1 text-[10px] text-blue-400 font-medium">
          {targetIds.length} assets selected
        </div>
      )}

      {!isMulti && (
        <button
          onClick={() => {
            addClipToTimeline(asset, 0)
            closeMenu()
          }}
          className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 flex items-center gap-3"
        >
          <Plus className="h-3.5 w-3.5 text-zinc-500" />
          <span>Add to Timeline</span>
        </button>
      )}

      {!isMulti && asset.path && (
        <button
          onClick={() => {
            window.electronAPI?.showItemInFolder({ filePath: asset.path! })
            closeMenu()
          }}
          className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 flex items-center gap-3"
        >
          <FolderOpen className="h-3.5 w-3.5 text-zinc-500" />
          <span>Show in Explorer</span>
        </button>
      )}

      <div className="h-px bg-zinc-700 my-1" />

      <div className="px-3 py-1 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Label</div>
      <div className="px-3 py-1.5 flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setColor(undefined)}
          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
            !asset.colorLabel ? 'border-white scale-110' : 'border-zinc-600 hover:border-zinc-400'
          }`}
          title="No label"
        >
          <X className="h-2 w-2 text-zinc-400" />
        </button>
        {COLOR_LABELS.map(cl => (
          <button
            key={cl.id}
            onClick={() => setColor(cl.id)}
            className={`w-4 h-4 rounded-full transition-all ${
              asset.colorLabel === cl.id ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800 scale-110' : 'hover:scale-125'
            }`}
            style={{ backgroundColor: cl.color }}
            title={cl.label}
          />
        ))}
      </div>

      <div className="h-px bg-zinc-700 my-1" />

      <div className="px-3 py-1 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Move to Bin</div>

      <button
        onClick={() => moveToBin(undefined)}
        className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 flex items-center gap-3"
      >
        <X className="h-3.5 w-3.5 text-zinc-500" />
        <span>Remove from Bin</span>
      </button>

      {bins.map(bin => (
        <button
          key={bin.id}
          onClick={() => moveToBin(bin.id)}
          className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 flex items-center gap-3"
        >
          <Folder className="h-3.5 w-3.5 text-zinc-500" />
          <span>{bin.name}</span>
        </button>
      ))}

      <button
        onClick={() => {
          openCreateBinEditor(targetIds)
          closeMenu()
        }}
        className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 flex items-center gap-3"
      >
        <FolderPlus className="h-3.5 w-3.5 text-zinc-500" />
        <span>New Bin...</span>
      </button>

      {isMulti && (
        <>
          <div className="h-px bg-zinc-700 my-1" />
          <button
            onClick={() => {
              clearSelection()
              closeMenu()
            }}
            className="w-full text-left px-3 py-1.5 text-zinc-300 hover:bg-zinc-700 flex items-center gap-3"
          >
            <X className="h-3.5 w-3.5 text-zinc-500" />
            <span>Clear Selection</span>
          </button>
        </>
      )}

      <div className="h-px bg-zinc-700 my-1" />

      <button
        onClick={deleteTargetAssets}
        className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-zinc-700 flex items-center gap-3"
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span>{isMulti ? `Delete ${targetIds.length} Assets` : 'Delete Asset'}</span>
      </button>
    </div>
  )
}
