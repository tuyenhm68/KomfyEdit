import React from 'react'
import type { SubtitleClip, Track } from '../../../types/project-model'

export interface TimelineSubtitleItemProps {
  sub: SubtitleClip
  track: Track | undefined
  isSelected: boolean
  isEditing: boolean
  pixelsPerSecond: number
  trackTopPx: (trackIndex: number, padding?: number) => number
  getTrackHeight: (trackIndex: number) => number
  onSelect: () => void
  onStartEdit: () => void
  onFinishEdit: (newText: string) => void
  onCancelEdit: () => void
  updateSubtitle: (id: string, patch: Partial<SubtitleClip>) => void
}

export const TimelineSubtitleItem: React.FC<TimelineSubtitleItemProps> = ({
  sub,
  track,
  isSelected,
  isEditing,
  pixelsPerSecond,
  trackTopPx,
  getTrackHeight,
  onSelect,
  onStartEdit,
  onFinishEdit,
  onCancelEdit,
  updateSubtitle,
}) => {
  if (!track || track.type !== 'subtitle') return null

  const leftPx = sub.startTime * pixelsPerSecond
  const widthPx = Math.max(20, (sub.endTime - sub.startTime) * pixelsPerSecond)
  const topPx = trackTopPx(sub.trackIndex, 4)

  return (
    <div
      key={sub.id}
      className={`absolute rounded border-2 overflow-hidden cursor-pointer select-none flex items-center ${
        isSelected
          ? 'border-amber-400 shadow-lg shadow-amber-500/20 bg-amber-900/60'
          : 'border-amber-700/50 hover:border-amber-600/70 bg-amber-900/40'
      } ${track.locked ? 'pointer-events-none opacity-50' : ''}`}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${getTrackHeight(sub.trackIndex) - 8}px`,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onStartEdit()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onSelect()
      }}
      onMouseDown={(e) => {
        if (track.locked || e.button !== 0) return
        e.stopPropagation()
        const startX = e.clientX
        const origStart = sub.startTime
        const origEnd = sub.endTime
        const dur = origEnd - origStart

        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX
          const dt = dx / pixelsPerSecond
          const newStart = Math.max(0, origStart + dt)
          updateSubtitle(sub.id, { startTime: newStart, endTime: newStart + dur })
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }}
    >
      {/* Subtitle text */}
      <div className="flex-1 min-w-0 px-2 py-1">
        {isEditing ? (
          <input
            autoFocus
            defaultValue={sub.text}
            className="w-full bg-transparent text-amber-100 text-[10px] leading-tight outline-none border-b border-amber-500/50"
            onBlur={(e) => onFinishEdit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onFinishEdit((e.target as HTMLInputElement).value)
              }
              if (e.key === 'Escape') onCancelEdit()
              e.stopPropagation()
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-[10px] text-amber-200 leading-tight line-clamp-2 break-all">
            {sub.text}
          </span>
        )}
      </div>

      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-amber-400/30"
        onMouseDown={(e) => {
          e.stopPropagation()
          const startX = e.clientX
          const origStart = sub.startTime
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX
            const dt = dx / pixelsPerSecond
            const newStart = Math.max(0, Math.min(sub.endTime - 0.2, origStart + dt))
            updateSubtitle(sub.id, { startTime: newStart })
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-amber-400/30"
        onMouseDown={(e) => {
          e.stopPropagation()
          const startX = e.clientX
          const origEnd = sub.endTime
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX
            const dt = dx / pixelsPerSecond
            const newEnd = Math.max(sub.startTime + 0.2, origEnd + dt)
            updateSubtitle(sub.id, { endTime: newEnd })
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      />
    </div>
  )
}
