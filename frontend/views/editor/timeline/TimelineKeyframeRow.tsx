import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { TimelineClip, KeyframeProperty, KeyframeEasing, KeyframePoint } from '../../../types/project-model'
import { useEditorActions } from '../editor-store'

export interface TimelineKeyframeRowProps {
  clip: TimelineClip
  pixelsPerSecond: number
}

interface KeyframeGroup {
  id: string
  t: number
  points: Array<{
    property: KeyframeProperty
    point: KeyframePoint
  }>
}

interface ContextMenuState {
  x: number
  y: number
  group: KeyframeGroup
}

const EASING_OPTIONS: Array<{ value: KeyframeEasing; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease In' },
  { value: 'ease-out', label: 'Ease Out' },
  { value: 'ease-in-out', label: 'Ease In-Out' },
  { value: 'hold', label: 'Hold' },
]

export const TimelineKeyframeRow: React.FC<TimelineKeyframeRowProps> = ({
  clip,
  pixelsPerSecond,
}) => {
  const { moveKeyframe, setKeyframeEasing, removeKeyframeAt } = useEditorActions()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Group keyframe points by time (within 0.04s)
  const keyframeGroups: KeyframeGroup[] = []
  if (clip.keyframes) {
    for (const track of clip.keyframes) {
      for (const pt of track.points) {
        const existing = keyframeGroups.find(g => Math.abs(g.t - pt.t) <= 0.04)
        if (existing) {
          existing.points.push({ property: track.property, point: pt })
        } else {
          keyframeGroups.push({
            id: `${track.property}-${pt.t}`,
            t: pt.t,
            points: [{ property: track.property, point: pt }],
          })
        }
      }
    }
  }

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!contextMenu) return
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    window.addEventListener('mousedown', handleOutside, true)
    return () => window.removeEventListener('mousedown', handleOutside, true)
  }, [contextMenu])

  // High-frequency imperative drag handler for diamond markers
  const handleDiamondMouseDown = useCallback(
    (e: React.MouseEvent, group: KeyframeGroup) => {
      if (e.button !== 0) return // Only primary click
      e.stopPropagation()
      e.preventDefault()

      const diamondEl = e.currentTarget as HTMLElement
      const startX = e.clientX
      const startT = group.t
      const clipDuration = clip.duration

      let lastDeltaX = 0

      const onPointerMove = (moveEvent: PointerEvent) => {
        lastDeltaX = moveEvent.clientX - startX
        const newT = Math.max(0, Math.min(clipDuration, startT + lastDeltaX / pixelsPerSecond))
        const actualDeltaPx = (newT - startT) * pixelsPerSecond
        diamondEl.style.transform = `translate3d(${actualDeltaPx}px, -50%, 0) rotate(45deg)`
        diamondEl.style.zIndex = '30'
      }

      const onPointerUp = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)

        diamondEl.style.transform = ''
        diamondEl.style.zIndex = ''

        const finalDeltaX = upEvent.clientX - startX
        const finalT = Math.max(0, Math.min(clipDuration, startT + finalDeltaX / pixelsPerSecond))

        if (Math.abs(finalT - startT) > 0.005) {
          // Commit to store once on mouse release
          for (const item of group.points) {
            moveKeyframe(clip.id, item.property, item.point.t, finalT)
          }
        }
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [clip.duration, clip.id, moveKeyframe, pixelsPerSecond],
  )

  const handleContextMenu = (e: React.MouseEvent, group: KeyframeGroup) => {
    e.stopPropagation()
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      group,
    })
  }

  if (!clip.keyframes || clip.keyframes.length === 0) {
    return (
      <div className="absolute inset-x-0 bottom-0 h-4 bg-black/40 border-t border-zinc-700/50 flex items-center px-1 pointer-events-none">
        <span className="text-[8px] text-zinc-500 font-mono tracking-wider">KEYFRAMES</span>
      </div>
    )
  }

  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0 h-4 bg-black/50 border-t border-zinc-700/60 z-20 flex items-center select-none overflow-visible"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <div className="relative w-full h-full">
          {keyframeGroups.map(group => {
            const leftPx = group.t * pixelsPerSecond
            const propsLabel = group.points
              .map(p => `${p.property}: ${Math.round(p.point.value * 100) / 100} (${p.point.easing})`)
              .join('\n')
            const tooltip = `${propsLabel}\nat ${group.t.toFixed(2)}s (drag to move, right-click to edit)`

            return (
              <div
                key={group.id}
                title={tooltip}
                onMouseDown={e => handleDiamondMouseDown(e, group)}
                onContextMenu={e => handleContextMenu(e, group)}
                style={{
                  left: `${leftPx}px`,
                  top: '50%',
                  transform: 'translate3d(0, -50%, 0) rotate(45deg)',
                }}
                className="absolute w-2.5 h-2.5 bg-amber-400 border border-amber-200 hover:bg-amber-300 hover:scale-125 cursor-ew-resize transition-transform shadow-sm"
              />
            )
          })}
        </div>
      </div>

      {/* Floating Context Menu for Easing and Deletion */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 9999,
          }}
          className="min-w-[150px] bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl py-1 text-xs text-zinc-200"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 border-b border-zinc-800 uppercase tracking-wider">
            Easing ({contextMenu.group.t.toFixed(2)}s)
          </div>
          {EASING_OPTIONS.map(opt => {
            const currentEasing = contextMenu.group.points[0]?.point.easing
            const isActive = currentEasing === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between hover:bg-zinc-800 transition-colors ${
                  isActive ? 'text-amber-400 font-medium' : 'text-zinc-300'
                }`}
                onClick={() => {
                  for (const item of contextMenu.group.points) {
                    setKeyframeEasing(clip.id, item.property, item.point.t, opt.value)
                  }
                  setContextMenu(null)
                }}
              >
                <span>{opt.label}</span>
                {isActive && <span className="text-amber-400 text-xs">✓</span>}
              </button>
            )
          })}
          <div className="my-1 border-t border-zinc-800" />
          <button
            type="button"
            className="w-full text-left px-2.5 py-1.5 text-red-400 hover:bg-red-500/10 transition-colors"
            onClick={() => {
              for (const item of contextMenu.group.points) {
                removeKeyframeAt(clip.id, item.property, item.point.t)
              }
              setContextMenu(null)
            }}
          >
            Delete Keyframe
          </button>
        </div>
      )}
    </>
  )
}
