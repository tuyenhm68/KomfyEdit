import {
  MousePointer2, ChevronRight, Scissors,
  ArrowLeftRight, GitMerge, MoveHorizontal, Gauge,
} from 'lucide-react'
import { formatKeyCombo, type ActionId, type KeyboardLayout } from '../../lib/keyboard-shortcuts'
export type { KeyboardLayout } from '../../lib/keyboard-shortcuts'
import {
  DEFAULT_LAYOUT,
  LAYOUT_LIMITS,
  LAYOUT_STORAGE_KEY,
  clampVal,
  type EditorLayout,
  type ToolType,
} from '@core/video-editor-utils'

// Re-export all timeline domain utilities from @core
export * from '@core/video-editor-utils'

// ── UI Tool types & definitions (with Lucide icons) ───────────────────

export type ToolDef = { id: ToolType; icon: any; label: string; actionId: ActionId }

export const PRIMARY_TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, label: 'Selection Tool', actionId: 'tool.select' },
  { id: 'trackForward', icon: ChevronRight, label: 'Track Select Forward (Shift: single track)', actionId: 'tool.trackForward' },
  { id: 'blade', icon: Scissors, label: 'Blade Tool', actionId: 'tool.blade' },
]

export const TRIM_TOOLS: ToolDef[] = [
  { id: 'ripple', icon: ArrowLeftRight, label: 'Ripple Trim', actionId: 'tool.ripple' },
  { id: 'roll', icon: GitMerge, label: 'Roll Trim (A/B)', actionId: 'tool.roll' },
  { id: 'slip', icon: MoveHorizontal, label: 'Slip Tool', actionId: 'tool.slip' },
  { id: 'slide', icon: Gauge, label: 'Slide Tool', actionId: 'tool.slide' },
]

/** Get the display shortcut string for an action from the active layout */
export function getShortcutLabel(layout: KeyboardLayout, actionId: ActionId): string {
  const combos = layout[actionId]
  if (!combos || combos.length === 0) return ''
  return formatKeyCombo(combos[0])
}

/** Returns `"label (shortcut)"` when a shortcut exists, or just `"label"` when it doesn't. */
export function tooltipLabel(label: string, shortcut: string): string {
  return shortcut ? `${label} (${shortcut})` : label
}

// ── UI Layout Storage (localStorage) ──────────────────────────────────

export function loadLayout(): EditorLayout {
  try {
    const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        leftPanelWidth: clampVal(parsed.leftPanelWidth ?? DEFAULT_LAYOUT.leftPanelWidth, LAYOUT_LIMITS.leftPanelWidth),
        rightPanelWidth: clampVal(parsed.rightPanelWidth ?? DEFAULT_LAYOUT.rightPanelWidth, LAYOUT_LIMITS.rightPanelWidth),
        timelineHeight: clampVal(parsed.timelineHeight ?? DEFAULT_LAYOUT.timelineHeight, LAYOUT_LIMITS.timelineHeight),
        assetsHeight: parsed.assetsHeight ? clampVal(parsed.assetsHeight, LAYOUT_LIMITS.assetsHeight) : 0,
      }
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_LAYOUT }
}

export function saveLayout(layout: EditorLayout) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
}

// ── Layout presets ──────────────────────────────────────────────────

export const LAYOUT_PRESETS_KEY = 'komfyedit-video-editor-layout-presets'

export interface LayoutPreset {
  id: string
  name: string
  layout: EditorLayout
}

export function loadLayoutPresets(): LayoutPreset[] {
  try {
    const stored = localStorage.getItem(LAYOUT_PRESETS_KEY)
    if (stored) return JSON.parse(stored) as LayoutPreset[]
  } catch { /* ignore */ }
  return []
}

export function saveLayoutPresets(presets: LayoutPreset[]) {
  try { localStorage.setItem(LAYOUT_PRESETS_KEY, JSON.stringify(presets)) } catch { /* ignore */ }
}
