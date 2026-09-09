import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { fitMediaInFrame } from '@core/video-editor-utils'
import { RotateCw, Crop, Check } from 'lucide-react'
import type { Asset, TimelineClip, ClipTransform } from '../../../types/project-model'
import { DEFAULT_CLIP_TRANSFORM } from '../../../types/project-model'

export interface TransformBoundingBoxProps {
  selectedClip: TimelineClip | null
  assets: Asset[]
  videoFrameSize: { width: number; height: number }
  currentTime: number
  cropMode: boolean
  onToggleCropMode: () => void
  onUpdateTransform: (patch: Partial<ClipTransform>, options?: { recordKeyframeAt?: number }) => void
  /**
   * Raised as soon as a handle is grabbed, before anything moves.
   *
   * The preview clears or re-picks the selection when the frame is clicked,
   * and the click that ends a drag lands there too. Without this the editor
   * hit-tested the clip's OLD rectangle, missed it, and selected whatever
   * sat underneath — dropping a sticker handed focus back to the video on
   * track 1 every single time.
   */
  onInteractionStart?: () => void
}

type DragMode =
  | 'move'
  | 'rotate'
  | 'scale-nw'
  | 'scale-ne'
  | 'scale-se'
  | 'scale-sw'
  | 'scale-n'
  | 'scale-s'
  | 'scale-e'
  | 'scale-w'
  | 'crop-t'
  | 'crop-b'
  | 'crop-l'
  | 'crop-r'
  | 'crop-tl'
  | 'crop-tr'
  | 'crop-bl'
  | 'crop-br'

export const TransformBoundingBox: React.FC<TransformBoundingBoxProps> = ({
  selectedClip,
  assets,
  videoFrameSize,
  currentTime,
  cropMode,
  onToggleCropMode,
  onUpdateTransform,
  onInteractionStart,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Local drag state for high-frequency 60fps manipulation
  const [activeDrag, setActiveDrag] = useState<DragMode | null>(null)
  const [localTransform, setLocalTransform] = useState<ClipTransform | null>(null)
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({})

  // Resolve media asset dimensions to compute fitted box
  const liveAsset = useMemo(() => {
    if (!selectedClip || selectedClip.type === 'audio' || selectedClip.type === 'adjustment') return null
    if (selectedClip.assetId) {
      return assets.find(a => a.id === selectedClip.assetId) || selectedClip.asset
    }
    return selectedClip.asset
  }, [selectedClip, assets])

  // Is the selected clip currently in the frame at currentTime?
  const isClipActive = useMemo(() => {
    if (!selectedClip) return false
    return currentTime >= selectedClip.startTime - 0.05 && currentTime <= selectedClip.startTime + selectedClip.duration + 0.05
  }, [selectedClip, currentTime])

  const clipTf = selectedClip?.transform ?? DEFAULT_CLIP_TRANSFORM
  const currentTf = localTransform ?? clipTf

  // Sync local transform when selectedClip changes
  useEffect(() => {
    setLocalTransform(null)
    setSnapLines({})
  }, [selectedClip?.id])

  // Fitted dimensions inside the video frame container. Shared with the click
  // hit test in ProgramMonitor, so the box the user sees and the area that
  // responds to a click cannot drift apart.
  const fitted = useMemo(() => {
    const size = fitMediaInFrame(videoFrameSize, liveAsset)
    return { width: Math.round(size.width), height: Math.round(size.height) }
  }, [videoFrameSize, liveAsset])

  // Start drag interaction
  const handlePointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    if (!selectedClip || !containerRef.current) return
    e.stopPropagation()
    onInteractionStart?.()
    e.preventDefault()

    const startX = e.clientX
    const startY = e.clientY
    const startTf = { ...(localTransform ?? clipTf) }
    const fw = videoFrameSize.width || 1
    const fh = videoFrameSize.height || 1

    const containerRect = containerRef.current.getBoundingClientRect()
    // Center of the clip in client/screen coordinates
    const centerX = containerRect.left + ((50 + startTf.positionX) / 100) * fw
    const centerY = containerRect.top + ((50 + startTf.positionY) / 100) * fh

    const initialDistance = Math.hypot(startX - centerX, startY - centerY) || 1
    const initialAngle = Math.atan2(startY - centerY, startX - centerX) * (180 / Math.PI)

    setActiveDrag(mode)

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault()
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const newSnap: { x?: number; y?: number } = {}

      if (mode === 'move') {
        const dXPercent = (dx / fw) * 100
        const dYPercent = (dy / fh) * 100

        let newX = startTf.positionX + dXPercent
        let newY = startTf.positionY + dYPercent

        // Snapping: center horizontal (X = 0) and center vertical (Y = 0)
        const snapThresholdX = (8 / fw) * 100
        const snapThresholdY = (8 / fh) * 100

        if (Math.abs(newX) < snapThresholdX) {
          newX = 0
          newSnap.x = 50
        }
        if (Math.abs(newY) < snapThresholdY) {
          newY = 0
          newSnap.y = 50
        }

        // Edge snapping (edges at -50% and +50% of frame center)
        const halfWidthPercent = ((fitted.width * (startTf.scale / 100)) / (2 * fw)) * 100
        const halfHeightPercent = ((fitted.height * (startTf.scale / 100)) / (2 * fh)) * 100

        // Left edge aligns with left frame boundary
        if (Math.abs(newX - halfWidthPercent + 50) < snapThresholdX) {
          newX = -50 + halfWidthPercent
          newSnap.x = 0
        }
        // Right edge aligns with right frame boundary
        if (Math.abs(newX + halfWidthPercent - 50) < snapThresholdX) {
          newX = 50 - halfWidthPercent
          newSnap.x = 100
        }
        // Top edge aligns with top frame boundary
        if (Math.abs(newY - halfHeightPercent + 50) < snapThresholdY) {
          newY = -50 + halfHeightPercent
          newSnap.y = 0
        }
        // Bottom edge aligns with bottom frame boundary
        if (Math.abs(newY + halfHeightPercent - 50) < snapThresholdY) {
          newY = 50 - halfHeightPercent
          newSnap.y = 100
        }

        setSnapLines(newSnap)
        setLocalTransform(prev => ({
          ...(prev ?? startTf),
          positionX: Math.round(newX * 10) / 10,
          positionY: Math.round(newY * 10) / 10,
        }))
      } else if (mode === 'rotate') {
        const curAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * (180 / Math.PI)
        let deltaAngle = curAngle - initialAngle
        let newRotation = startTf.rotation + deltaAngle

        // Snap to 15-degree increments if shift is held
        if (ev.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15
        }

        // Normalize between -180 and 180
        while (newRotation > 180) newRotation -= 360
        while (newRotation < -180) newRotation += 360

        setLocalTransform(prev => ({
          ...(prev ?? startTf),
          rotation: Math.round(newRotation),
        }))
      } else if (mode.startsWith('scale-')) {
        const curDist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY)
        const ratio = curDist / initialDistance
        let newScale = Math.round(startTf.scale * ratio)
        newScale = Math.max(5, Math.min(500, newScale))

        setLocalTransform(prev => ({
          ...(prev ?? startTf),
          scale: newScale,
        }))
      } else if (mode.startsWith('crop-')) {
        // Crop mode adjustments (percentages 0..90)
        const baseW = fitted.width * (startTf.scale / 100)
        const baseH = fitted.height * (startTf.scale / 100)

        let cropTop = startTf.cropTop
        let cropBottom = startTf.cropBottom
        let cropLeft = startTf.cropLeft
        let cropRight = startTf.cropRight

        if (mode.includes('t')) {
          cropTop = Math.max(0, Math.min(90 - cropBottom, Math.round(startTf.cropTop + (dy / baseH) * 100)))
        }
        if (mode.includes('b')) {
          cropBottom = Math.max(0, Math.min(90 - cropTop, Math.round(startTf.cropBottom - (dy / baseH) * 100)))
        }
        if (mode.includes('l')) {
          cropLeft = Math.max(0, Math.min(90 - cropRight, Math.round(startTf.cropLeft + (dx / baseW) * 100)))
        }
        if (mode.includes('r')) {
          cropRight = Math.max(0, Math.min(90 - cropLeft, Math.round(startTf.cropRight - (dx / baseW) * 100)))
        }

        setLocalTransform(prev => ({
          ...(prev ?? startTf),
          cropTop,
          cropBottom,
          cropLeft,
          cropRight,
        }))
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      setActiveDrag(null)
      setSnapLines({})

      setLocalTransform(finalTf => {
        if (finalTf) {
          const timeInClip = Math.max(0, Math.min(selectedClip.duration, currentTime - selectedClip.startTime))
          onUpdateTransform(finalTf, { recordKeyframeAt: timeInClip })
        }
        return null
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }, [selectedClip, localTransform, clipTf, videoFrameSize, fitted, currentTime, onUpdateTransform, onInteractionStart])

  if (!selectedClip || !isClipActive || selectedClip.type === 'audio' || selectedClip.type === 'adjustment' || selectedClip.type === 'text') {
    return null
  }

  const { positionX, positionY, scale, rotation, cropTop, cropRight, cropBottom, cropLeft } = currentTf

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-[25] overflow-hidden"
    >
      {/* Visual Snap Guide Lines */}
      {snapLines.x !== undefined && (
        <div
          className="absolute top-0 bottom-0 w-px bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] z-[30] pointer-events-none"
          style={{ left: `${snapLines.x}%` }}
        />
      )}
      {snapLines.y !== undefined && (
        <div
          className="absolute left-0 right-0 h-px bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] z-[30] pointer-events-none"
          style={{ top: `${snapLines.y}%` }}
        />
      )}

      {/* Transform Bounding Box Anchor */}
      <div
        className="absolute pointer-events-auto"
        style={{
          left: `${50 + positionX}%`,
          top: `${50 + positionY}%`,
          // Sized directly rather than drawn full size and scaled down. A CSS
          // scale shrinks the outline and the grab handles along with the box,
          // so a small sticker ended up with a hairline border and handles too
          // fine to hit. Baking the scale into the dimensions keeps the chrome
          // one pixel wide at every size.
          width: `${fitted.width * (scale / 100)}px`,
          height: `${fitted.height * (scale / 100)}px`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {/* Main Bounding Outline */}
        <div
          className={`absolute inset-0 transition-colors ${
            cropMode
              ? 'border-2 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
              : 'border border-cyan-400/90 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
          }`}
          style={{
            cursor: activeDrag === 'move' ? 'grabbing' : 'move',
          }}
          onPointerDown={e => handlePointerDown(e, 'move')}
        >
          {/* Subtle center crosshair / drag indicator */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 hover:opacity-80 transition-opacity">
            <div className="w-3 h-3 border-t-2 border-l-2 border-r-2 border-b-2 border-cyan-400 rounded-full" />
          </div>

          {/* Crop Mask Overlay if crop is active */}
          {(cropTop > 0 || cropRight > 0 || cropBottom > 0 || cropLeft > 0) && (
            <div
              className="absolute inset-0 border border-dashed border-amber-400/60 pointer-events-none"
              style={{
                top: `${cropTop}%`,
                right: `${cropRight}%`,
                bottom: `${cropBottom}%`,
                left: `${cropLeft}%`,
              }}
            />
          )}

          {/* Top Rotation Stem and Knob (in Normal Transform mode) */}
          {!cropMode && (
            <div
              className="absolute left-1/2 -top-6 -translate-x-1/2 flex flex-col items-center pointer-events-auto cursor-grab active:cursor-grabbing group"
              onPointerDown={e => handlePointerDown(e, 'rotate')}
              title="Drag to rotate (Hold Shift for 15° snap)"
            >
              <div className="w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-zinc-950 shadow-md flex items-center justify-center group-hover:scale-125 transition-transform">
                <RotateCw className="w-2 h-2 text-zinc-950 stroke-[3]" />
              </div>
              <div className="w-px h-2.5 bg-cyan-400/80" />
            </div>
          )}

          {/* Mode Indicator Badge (Crop / Transform) */}
          <div className="absolute -top-7 left-0 flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                onToggleCropMode()
              }}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shadow-lg transition-colors ${
                cropMode
                  ? 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                  : 'bg-zinc-900/90 border border-zinc-700 text-cyan-300 hover:bg-zinc-800'
              }`}
              title="Press 'C' to toggle Crop Mode"
            >
              {cropMode ? (
                <>
                  <Check className="w-2.5 h-2.5" />
                  Crop (Done)
                </>
              ) : (
                <>
                  <Crop className="w-2.5 h-2.5" />
                  Crop
                </>
              )}
            </button>
            <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-black/60 text-zinc-300 backdrop-blur-sm">
              {Math.round(scale)}% · {Math.round(rotation)}°
            </span>
          </div>

          {/* Handles: Scale Handles in Transform Mode */}
          {!cropMode && (
            <>
              {/* 4 Corners */}
              <div
                className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-cyan-500 shadow-sm rounded-sm cursor-nwse-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-nw')}
              />
              <div
                className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-cyan-500 shadow-sm rounded-sm cursor-nesw-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-ne')}
              />
              <div
                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-cyan-500 shadow-sm rounded-sm cursor-nesw-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-sw')}
              />
              <div
                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-cyan-500 shadow-sm rounded-sm cursor-nwse-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-se')}
              />

              {/* 4 Edge Midpoints */}
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-white border border-cyan-500 rounded-sm cursor-ns-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-n')}
              />
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2 bg-white border border-cyan-500 rounded-sm cursor-ns-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-s')}
              />
              <div
                className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border border-cyan-500 rounded-sm cursor-ew-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-w')}
              />
              <div
                className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2.5 bg-white border border-cyan-500 rounded-sm cursor-ew-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'scale-e')}
              />
            </>
          )}

          {/* Handles: Crop Handles in Crop Mode */}
          {cropMode && (
            <>
              {/* L-shaped corner brackets */}
              <div
                className="absolute -top-2 -left-2 w-4 h-4 border-t-4 border-l-4 border-amber-400 cursor-nwse-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-tl')}
              />
              <div
                className="absolute -top-2 -right-2 w-4 h-4 border-t-4 border-r-4 border-amber-400 cursor-nesw-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-tr')}
              />
              <div
                className="absolute -bottom-2 -left-2 w-4 h-4 border-b-4 border-l-4 border-amber-400 cursor-nesw-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-bl')}
              />
              <div
                className="absolute -bottom-2 -right-2 w-4 h-4 border-b-4 border-r-4 border-amber-400 cursor-nwse-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-br')}
              />

              {/* Edge bars */}
              <div
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-8 h-2 bg-amber-400 rounded-sm cursor-ns-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-t')}
              />
              <div
                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-2 bg-amber-400 rounded-sm cursor-ns-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-b')}
              />
              <div
                className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-8 bg-amber-400 rounded-sm cursor-ew-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-l')}
              />
              <div
                className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-2 h-8 bg-amber-400 rounded-sm cursor-ew-resize hover:scale-125 transition-transform"
                onPointerDown={e => handlePointerDown(e, 'crop-r')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
