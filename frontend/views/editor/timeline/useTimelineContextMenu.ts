import { useState, useRef, useEffect, useCallback } from 'react'
import type { TimelineClip } from '../../../types/project-model'
import type { ClipContextMenuState } from '../ClipContextMenu'

export interface UseTimelineContextMenuOptions {
  clips: TimelineClip[]
  selectedClipIds: Set<string>
  setSelectedClipIds: (ids: Set<string>) => void
  expandWithLinkedClips: (ids: Set<string>) => Set<string>
  pixelsPerSecond: number
  setCurrentTime: (time: number) => void
}

export function useTimelineContextMenu({
  clips,
  selectedClipIds,
  setSelectedClipIds,
  expandWithLinkedClips,
  pixelsPerSecond,
  setCurrentTime,
}: UseTimelineContextMenuOptions) {
  const [clipContextMenu, setClipContextMenu] = useState<ClipContextMenuState | null>(null)
  const clipContextMenuRef = useRef<HTMLDivElement>(null)

  const handleClipContextMenu = useCallback((e: React.MouseEvent, clip: TimelineClip) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedClipIds.has(clip.id)) {
      setSelectedClipIds(expandWithLinkedClips(new Set([clip.id])))
    }
    setClipContextMenu({ kind: 'clip', clipId: clip.id, x: e.clientX, y: e.clientY })
  }, [expandWithLinkedClips, selectedClipIds, setSelectedClipIds])

  const handleTimelineBgContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const scrollLeft = (e.currentTarget as HTMLElement).scrollLeft || 0
    const clickX = e.clientX - rect.left + scrollLeft
    const clickTime = Math.max(0, clickX / pixelsPerSecond)
    setCurrentTime(clickTime)
    setClipContextMenu({ kind: 'background', x: e.clientX, y: e.clientY })
  }, [pixelsPerSecond, setCurrentTime])

  useEffect(() => {
    if (!clipContextMenu) return
    const handler = () => setClipContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [clipContextMenu])

  useEffect(() => {
    if (!clipContextMenu || !clipContextMenuRef.current) return
    const el = clipContextMenuRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let { x, y } = clipContextMenu
    let adjusted = false

    if (rect.right > vw - 8) { x = vw - rect.width - 8; adjusted = true }
    if (rect.bottom > vh - 8) { y = vh - rect.height - 8; adjusted = true }
    if (x < 8) { x = 8; adjusted = true }
    if (y < 8) { y = 8; adjusted = true }

    if (adjusted) {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
  }, [clipContextMenu])

  const contextClip = clipContextMenu?.kind === 'clip'
    ? clips.find(clip => clip.id === clipContextMenu.clipId) ?? null
    : null

  return {
    clipContextMenu,
    setClipContextMenu,
    clipContextMenuRef,
    contextClip,
    handleClipContextMenu,
    handleTimelineBgContextMenu,
  }
}
