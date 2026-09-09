import React from 'react'
import type { ToolType } from '../video-editor-utils'

export interface TimelineGapItemProps {
  gap: { trackIndex: number; startTime: number; endTime: number }
  index: number
  selectedGap: { trackIndex: number; startTime: number; endTime: number } | null
  pixelsPerSecond: number
  trackTopPx: (trackIndex: number, padding?: number) => number
  getTrackHeight: (trackIndex: number) => number
  activeTool: ToolType
  setIsPlaying: (playing: boolean) => void
  scrubFromEvent: (clientX: number) => void
  startSelectionLasso: (clientX: number, clientY: number, shiftKey: boolean) => void
  selectGap: (gap: { trackIndex: number; startTime: number; endTime: number }, el: HTMLElement) => void
  suppressGapClickRef: React.MutableRefObject<boolean>
}

export const TimelineGapItem: React.FC<TimelineGapItemProps> = ({
  gap,
  index,
  selectedGap,
  pixelsPerSecond,
  trackTopPx,
  getTrackHeight,
  activeTool,
  setIsPlaying,
  scrubFromEvent,
  startSelectionLasso,
  selectGap,
  suppressGapClickRef,
}) => {
  const leftPx = gap.startTime * pixelsPerSecond
  const widthPx = (gap.endTime - gap.startTime) * pixelsPerSecond
  const topPx = trackTopPx(gap.trackIndex, 4)
  const isSelected = selectedGap &&
    selectedGap.trackIndex === gap.trackIndex &&
    Math.abs(selectedGap.startTime - gap.startTime) < 0.01 &&
    Math.abs(selectedGap.endTime - gap.endTime) < 0.01

  if (widthPx < 4) return null

  return (
    <div
      key={`gap-${index}`}
      className={`absolute rounded cursor-pointer transition-all group ${
        isSelected
          ? 'bg-blue-500/20 border-2 border-dashed border-blue-400/60 shadow-inner'
          : 'border-2 border-dashed border-transparent hover:bg-blue-500/10 hover:border-blue-400/30'
      }`}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        width: `${widthPx}px`,
        height: `${getTrackHeight(gap.trackIndex) - 8}px`,
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || activeTool !== 'select') return
        setIsPlaying(false)
        scrubFromEvent(e.clientX)
        startSelectionLasso(e.clientX, e.clientY, e.shiftKey)
        suppressGapClickRef.current = false
        const startX = e.clientX
        const startY = e.clientY
        const onMove = (event: MouseEvent) => {
          if (
            Math.abs(event.clientX - startX) >= 4 ||
            Math.abs(event.clientY - startY) >= 4
          ) {
            suppressGapClickRef.current = true
          }
        }
        const onUp = () => {
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (suppressGapClickRef.current) {
          suppressGapClickRef.current = false
          return
        }
        selectGap(gap, e.currentTarget as HTMLElement)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        selectGap(gap, e.currentTarget as HTMLElement)
      }}
    >
      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity ${
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <span className="text-[9px] font-medium text-blue-400">
          {(gap.endTime - gap.startTime).toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
