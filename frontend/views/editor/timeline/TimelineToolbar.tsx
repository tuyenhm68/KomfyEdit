import React, { useState, useRef, useEffect } from 'react'
import {
  Plus, Trash2,
  ZoomIn, ZoomOut, Maximize2,
  Volume2, VolumeX, Copy,
  Magnet, ChevronDown,
  PanelRight,
  Undo2, Redo2, SplitSquareVertical, FlipHorizontal2,
  GitBranch,
} from 'lucide-react'
import { Tooltip } from '../../../components/ui/tooltip'
import type { TimelineClip } from '../../../types/project-model'
import {
  useEditorStore,
  useEditorActions,
} from '../editor-store'
import {
  selectTimelines,
  selectActiveTimeline,
} from '../editor-selectors'
import {
  PRIMARY_TOOLS, TRIM_TOOLS,
  type ToolType,
  getShortcutLabel, tooltipLabel,
} from '../video-editor-utils'

export interface TimelineToolbarProps {
  kbLayout: any
  activeTool: ToolType
  setActiveTool: (tool: ToolType) => void
  lastTrimTool: ToolType
  setLastTrimTool: (tool: ToolType) => void
  addTextClip: () => void
  undo: () => void
  redo: () => void
  selectedClip: TimelineClip | null
  selectedClipIds: Set<string>
  splitClipAtPlayhead: (clipId: string) => void
  deleteClips: (clipIds: string[]) => void
  updateClip: (id: string, patch: Partial<TimelineClip>) => void
  toggleClipMute: (clipId: string) => void
  duplicateClip: (clipId: string) => void
  snapEnabled: boolean
  setSnapEnabled: (enabled: boolean) => void
  showPropertiesPanel: boolean
  setShowPropertiesPanel: (updater: (prev: boolean) => boolean) => void
  zoom: number
  setZoom: (updater: (prev: number) => number) => void
  getMinZoom: () => number
  centerOnPlayheadRef: React.MutableRefObject<boolean>
  handleFitToView: () => void
}

function ToolbarDivider() {
  return <div className="mx-1.5 h-4 w-px flex-shrink-0 bg-zinc-800" />
}

export const TimelineToolbar: React.FC<TimelineToolbarProps> = ({
  kbLayout,
  activeTool,
  setActiveTool,
  lastTrimTool,
  setLastTrimTool,
  addTextClip,
  undo,
  redo,
  selectedClip,
  selectedClipIds,
  splitClipAtPlayhead,
  deleteClips,
  updateClip,
  toggleClipMute,
  duplicateClip,
  snapEnabled,
  setSnapEnabled,
  showPropertiesPanel,
  setShowPropertiesPanel,
  zoom,
  setZoom,
  getMinZoom,
  centerOnPlayheadRef,
  handleFitToView,
}) => {
  const [showTrimFlyout, setShowTrimFlyout] = useState(false)
  const [showVariantMenu, setShowVariantMenu] = useState(false)
  const variantMenuRef = useRef<HTMLDivElement>(null)

  const timelines = useEditorStore(selectTimelines)
  const activeTimeline = useEditorStore(selectActiveTimeline)
  const actions = useEditorActions()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (variantMenuRef.current && !variantMenuRef.current.contains(event.target as Node)) {
        setShowVariantMenu(false)
      }
    }
    if (showVariantMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showVariantMenu])

  const trimToolIds = new Set(TRIM_TOOLS.map(t => t.id))
  const isTrimActive = trimToolIds.has(activeTool)
  const currentTrimTool = TRIM_TOOLS.find(t => t.id === (isTrimActive ? activeTool : lastTrimTool)) || TRIM_TOOLS[0]

  return (
    <div className="flex h-[34px] flex-shrink-0 items-center gap-0.5 border-b border-zinc-800 bg-zinc-950 px-2">
      <Tooltip content="Add text at playhead" side="bottom">
        <button onClick={() => addTextClip()} className="cc-icon-btn">
          <Plus className="h-4 w-4" />
        </button>
      </Tooltip>

      {/* Active tool, with the trim variants behind a flyout */}
      <div className="relative flex items-center">
        {PRIMARY_TOOLS.map(tool => (
          <Tooltip key={tool.id} content={tooltipLabel(tool.label, getShortcutLabel(kbLayout, tool.actionId))} side="bottom">
            <button
              onClick={() => setActiveTool(tool.id)}
              className={`cc-icon-btn ${activeTool === tool.id ? 'cc-icon-btn-on' : ''}`}
            >
              <tool.icon className="h-4 w-4" />
            </button>
          </Tooltip>
        ))}

        <Tooltip content={`${currentTrimTool.label} — use the arrow for other trim tools`} side="bottom">
          <button
            onClick={() => { setActiveTool(currentTrimTool.id); setLastTrimTool(currentTrimTool.id) }}
            className={`cc-icon-btn ${isTrimActive ? 'cc-icon-btn-on' : ''}`}
          >
            <currentTrimTool.icon className="h-4 w-4" />
          </button>
        </Tooltip>
        <button
          onClick={() => setShowTrimFlyout(v => !v)}
          className="flex h-7 w-3 items-center justify-center text-zinc-500 hover:text-white"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        {showTrimFlyout && (
          <>
            <div className="fixed inset-0 z-[9998]" onMouseDown={() => setShowTrimFlyout(false)} />
            <div className="absolute left-0 top-full z-[9999] mt-1 min-w-[170px] rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {TRIM_TOOLS.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setActiveTool(t.id); setLastTrimTool(t.id); setShowTrimFlyout(false) }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                    activeTool === t.id ? 'text-accent' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  <span className="flex-1">{t.label}</span>
                  <span className="text-[10px] text-zinc-500">{getShortcutLabel(kbLayout, t.actionId)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <ToolbarDivider />

      <Tooltip content={tooltipLabel('Undo', getShortcutLabel(kbLayout, 'edit.undo'))} side="bottom">
        <button onClick={undo} className="cc-icon-btn">
          <Undo2 className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content={tooltipLabel('Redo', getShortcutLabel(kbLayout, 'edit.redo'))} side="bottom">
        <button onClick={redo} className="cc-icon-btn">
          <Redo2 className="h-4 w-4" />
        </button>
      </Tooltip>

      <ToolbarDivider />

      <Tooltip content="Split at playhead" side="bottom">
        <button
          onClick={() => selectedClip && splitClipAtPlayhead(selectedClip.id)}
          disabled={!selectedClip}
          className="cc-icon-btn"
        >
          <SplitSquareVertical className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content="Delete selection" side="bottom">
        <button
          onClick={() => selectedClipIds.size > 0 && deleteClips([...selectedClipIds])}
          disabled={selectedClipIds.size === 0}
          className="cc-icon-btn"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </Tooltip>

      {/* Clip actions surface only with a selection */}
      {selectedClip && (
        <>
          <ToolbarDivider />
          <Tooltip content="Mirror horizontally" side="bottom">
            <button
              onClick={() => updateClip(selectedClip.id, { flipH: !selectedClip.flipH })}
              className={`cc-icon-btn ${selectedClip.flipH ? 'cc-icon-btn-on' : ''}`}
            >
              <FlipHorizontal2 className="h-4 w-4" />
            </button>
          </Tooltip>
          <Tooltip content={selectedClip.muted ? 'Unmute clip' : 'Mute clip'} side="bottom">
            <button
              onClick={() => toggleClipMute(selectedClip.id)}
              className={`cc-icon-btn ${selectedClip.muted ? 'cc-icon-btn-on' : ''}`}
            >
              {selectedClip.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </Tooltip>
          <Tooltip content="Duplicate clip" side="bottom">
            <button onClick={() => duplicateClip(selectedClip.id)} className="cc-icon-btn">
              <Copy className="h-4 w-4" />
            </button>
          </Tooltip>
        </>
      )}

      {/* Variant / Sequence Selector */}
      <ToolbarDivider />
      <div className="relative" ref={variantMenuRef}>
        <button
          onClick={() => setShowVariantMenu(v => !v)}
          className="flex h-7 items-center gap-1.5 rounded bg-zinc-900/90 px-2 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800"
          title="Timeline Variants / Sequences"
        >
          <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
          <span className="max-w-[130px] truncate">
            {activeTimeline?.name || 'Timeline'}
          </span>
          {activeTimeline?.variantTag && (
            <span className="rounded bg-indigo-950/80 px-1 py-0.2 text-[9px] font-semibold text-indigo-300 border border-indigo-800/60">
              {activeTimeline.variantTag}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-zinc-400" />
        </button>

        {showVariantMenu && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-md border border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl">
            <div className="mb-1.5 flex items-center justify-between px-2 py-1 border-b border-zinc-800/80">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Timeline Variants ({timelines.length})
              </span>
              <button
                onClick={() => {
                  if (activeTimeline) {
                    actions.duplicateTimeline(activeTimeline.id, `${activeTimeline.name} Variant`, 'variant-b')
                  }
                  setShowVariantMenu(false)
                }}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-indigo-400 hover:bg-indigo-950/80 hover:text-indigo-200"
                title="Duplicate Current Variant"
              >
                <Plus className="h-3 w-3" />
                <span>Duplicate</span>
              </button>
            </div>

            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {timelines.map(tl => {
                const isActive = tl.id === activeTimeline?.id
                return (
                  <div
                    key={tl.id}
                    onClick={() => {
                      if (!isActive) {
                        actions.switchActiveTimeline(tl.id)
                      }
                      setShowVariantMenu(false)
                    }}
                    className={`group flex items-center justify-between rounded px-2 py-1.5 text-[11px] cursor-pointer transition-colors ${
                      isActive ? 'bg-indigo-950/60 text-indigo-200 font-medium' : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{tl.name}</span>
                        {tl.variantTag && (
                          <span className="rounded bg-zinc-800 px-1 py-0.2 text-[9px] text-zinc-300">
                            {tl.variantTag}
                          </span>
                        )}
                      </div>
                      {tl.description && (
                        <span className="text-[10px] text-zinc-500 truncate">{tl.description}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {timelines.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            actions.deleteTimeline(tl.id)
                          }}
                          className="rounded p-1 text-zinc-400 hover:bg-rose-950 hover:text-rose-400"
                          title="Delete variant"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Right cluster: snap, details panel, zoom */}
      <Tooltip content={snapEnabled ? 'Snapping on' : 'Snapping off'} side="bottom">
        <button
          onClick={() => setSnapEnabled(!snapEnabled)}
          className={`cc-icon-btn ${snapEnabled ? 'cc-icon-btn-on' : ''}`}
        >
          <Magnet className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content={showPropertiesPanel ? 'Hide details panel' : 'Show details panel'} side="bottom">
        <button
          onClick={() => setShowPropertiesPanel(p => !p)}
          className={`cc-icon-btn ${showPropertiesPanel ? 'cc-icon-btn-on' : ''}`}
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </Tooltip>

      <ToolbarDivider />

      <Tooltip content="Zoom out" side="bottom">
        <button
          onClick={() => { centerOnPlayheadRef.current = true; setZoom(prev => Math.max(getMinZoom(), +(prev - 0.25).toFixed(2))) }}
          className="cc-icon-btn"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
      </Tooltip>
      <input
        type="range"
        min={Math.max(1, Math.round(getMinZoom() * 100))}
        max={400}
        step={5}
        value={Math.round(zoom * 100)}
        onChange={(e) => { centerOnPlayheadRef.current = true; setZoom(() => Math.max(getMinZoom(), +(parseInt(e.target.value) / 100).toFixed(2))) }}
        className="cc-range mx-1 w-24"
        title={`Zoom: ${Math.round(zoom * 100)}%`}
      />
      <Tooltip content="Zoom in" side="bottom">
        <button
          onClick={() => { centerOnPlayheadRef.current = true; setZoom(prev => Math.min(4, +(prev + 0.25).toFixed(2))) }}
          className="cc-icon-btn"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </Tooltip>
      <Tooltip content={tooltipLabel('Fit to view', getShortcutLabel(kbLayout, 'timeline.fitToView'))} side="bottom">
        <button onClick={handleFitToView} className="cc-icon-btn">
          <Maximize2 className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  )
}
