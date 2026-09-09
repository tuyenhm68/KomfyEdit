import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { RotateCw } from 'lucide-react'
import type { Asset, TimelineClip, ClipMask } from '../../../types/project-model'
import { DEFAULT_CLIP_MASK } from '../../../types/project-model'

export interface MaskBoundingBoxProps {
  selectedClip: TimelineClip | null
  assets: Asset[]
  videoFrameSize: { width: number; height: number }
  currentTime: number
  maskMode: boolean
  onUpdateMask: (patch: Partial<ClipMask>) => void
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
  | 'feather'

export const MaskBoundingBox: React.FC<MaskBoundingBoxProps> = ({
  selectedClip,
  assets,
  videoFrameSize,
  currentTime,
  maskMode,
  onUpdateMask,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Local drag state for smooth 60fps interaction
  const [activeDrag, setActiveDrag] = useState<DragMode | null>(null)
  const [localMask, setLocalMask] = useState<ClipMask | null>(null)

  const liveAsset = useMemo(() => {
    if (!selectedClip || selectedClip.type === 'audio' || selectedClip.type === 'adjustment') return null
    if (selectedClip.assetId) {
      return assets.find(a => a.id === selectedClip.assetId) || selectedClip.asset
    }
    return selectedClip.asset
  }, [selectedClip, assets])

  const isClipActive = useMemo(() => {
    if (!selectedClip) return false
    return currentTime >= selectedClip.startTime - 0.05 && currentTime <= selectedClip.startTime + selectedClip.duration + 0.05
  }, [selectedClip, currentTime])

  const clipMask = selectedClip?.mask ?? DEFAULT_CLIP_MASK
  const currentMask = localMask ?? clipMask

  useEffect(() => {
    setLocalMask(null)
  }, [selectedClip?.id])

  // Fitted dimensions inside video frame container
  const fitted = useMemo(() => {
    const fw = videoFrameSize.width || 1
    const fh = videoFrameSize.height || 1
    const aw = liveAsset?.width || fw
    const ah = liveAsset?.height || fh
    const targetRatio = aw / ah
    const containerRatio = fw / fh

    let bw: number
    let bh: number
    if (containerRatio > targetRatio) {
      bh = fh
      bw = fh * targetRatio
    } else {
      bw = fw
      bh = fw / targetRatio
    }

    return {
      width: Math.round(bw),
      height: Math.round(bh),
    }
  }, [videoFrameSize, liveAsset])

  const handlePointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation()
    e.preventDefault()
    setActiveDrag(mode)

    const startX = e.clientX
    const startY = e.clientY
    const startMask = { ...(localMask ?? clipMask) }

    const containerEl = containerRef.current
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()

    // Center of clip on screen
    const clipTf = selectedClip?.transform
    const clipScale = (clipTf?.scale ?? 100) / 100
    const clipPosX = (clipTf?.positionX ?? 0) / 100
    const clipPosY = (clipTf?.positionY ?? 0) / 100

    const clipW = fitted.width * clipScale
    const clipH = fitted.height * clipScale
    const clipLeft = rect.left + rect.width / 2 + clipPosX * rect.width - clipW / 2
    const clipTop = rect.top + rect.height / 2 + clipPosY * rect.height - clipH / 2

    // Center of mask relative to clip
    const maskCenterX = clipLeft + (startMask.x / 100) * clipW
    const maskCenterY = clipTop + (startMask.y / 100) * clipH

    const initialAngle = Math.atan2(startY - maskCenterY, startX - maskCenterX) * (180 / Math.PI)
    const initialDistance = Math.hypot(startX - maskCenterX, startY - maskCenterY) || 1

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      if (mode === 'move') {
        const deltaXPct = (dx / clipW) * 100
        const deltaYPct = (dy / clipH) * 100
        const newX = Math.max(0, Math.min(100, Math.round((startMask.x + deltaXPct) * 10) / 10))
        const newY = Math.max(0, Math.min(100, Math.round((startMask.y + deltaYPct) * 10) / 10))

        setLocalMask(prev => ({
          ...(prev ?? startMask),
          x: newX,
          y: newY,
        }))
      } else if (mode === 'rotate') {
        const curAngle = Math.atan2(ev.clientY - maskCenterY, ev.clientX - maskCenterX) * (180 / Math.PI)
        let deltaAngle = curAngle - initialAngle
        let newRotation = (startMask.rotation ?? 0) + deltaAngle

        if (ev.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15
        }

        while (newRotation > 180) newRotation -= 360
        while (newRotation < -180) newRotation += 360

        setLocalMask(prev => ({
          ...(prev ?? startMask),
          rotation: Math.round(newRotation),
        }))
      } else if (mode.startsWith('scale-')) {
        const curDist = Math.hypot(ev.clientX - maskCenterY, ev.clientY - maskCenterY)
        const ratio = curDist / initialDistance

        let newW = Math.max(5, Math.min(200, Math.round(startMask.width * ratio)))
        let newH = Math.max(5, Math.min(200, Math.round(startMask.height * ratio)))

        if (mode === 'scale-e' || mode === 'scale-w') {
          newH = startMask.height
        } else if (mode === 'scale-n' || mode === 'scale-s') {
          newW = startMask.width
        }

        setLocalMask(prev => ({
          ...(prev ?? startMask),
          width: newW,
          height: newH,
        }))
      } else if (mode === 'feather') {
        const curDist = Math.hypot(ev.clientX - maskCenterX, ev.clientY - maskCenterY)
        const delta = ((curDist - initialDistance) / (clipW / 2)) * 100
        const newFeather = Math.max(0, Math.min(100, Math.round((startMask.feather ?? 0) + delta)))

        setLocalMask(prev => ({
          ...(prev ?? startMask),
          feather: newFeather,
        }))
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      setActiveDrag(null)

      setLocalMask(finalMask => {
        if (finalMask) {
          onUpdateMask(finalMask)
        }
        return null
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }, [selectedClip, localMask, clipMask, fitted, onUpdateMask])

  if (!selectedClip || !isClipActive || !selectedClip.mask?.enabled || !maskMode) {
    return null
  }

  const { shape, x, y, width, height, rotation = 0, feather = 0 } = currentMask
  const clipTf = selectedClip.transform
  const clipScale = (clipTf?.scale ?? 100) / 100
  const clipPosX = (clipTf?.positionX ?? 0) / 100
  const clipPosY = (clipTf?.positionY ?? 0) / 100

  const clipW = fitted.width * clipScale
  const clipH = fitted.height * clipScale

  const maskPixelW = (width / 100) * clipW
  const maskPixelH = (height / 100) * clipH

  // Pixel position of mask center relative to video frame center
  const maskOffsetX = clipPosX * (videoFrameSize.width || 1) + ((x - 50) / 100) * clipW
  const maskOffsetY = clipPosY * (videoFrameSize.height || 1) + ((y - 50) / 100) * clipH

  const isEllipse = shape === 'ellipse'
  const isLinear = shape === 'linear'

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-[30] overflow-hidden"
    >
      <div
        className="absolute pointer-events-auto"
        style={{
          left: `calc(50% + ${maskOffsetX}px)`,
          top: `calc(50% + ${maskOffsetY}px)`,
          width: isLinear ? `${clipW}px` : `${maskPixelW}px`,
          height: isLinear ? '4px' : `${maskPixelH}px`,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transformOrigin: 'center center',
        }}
      >
        {/* Main mask bounding outline */}
        <div
          className={`absolute inset-0 transition-colors border-2 border-dashed border-blue-400/90 shadow-[0_0_10px_rgba(59,130,246,0.5)] ${
            isEllipse ? 'rounded-full' : ''
          }`}
          style={{
            cursor: activeDrag === 'move' ? 'grabbing' : 'move',
          }}
          onPointerDown={e => handlePointerDown(e, 'move')}
        >
          {/* Center drag crosshair */}
          <div className="absolute inset-0 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
            <div className="w-2.5 h-2.5 bg-blue-400 rounded-full" />
          </div>

          {/* Feather border visualization */}
          {feather > 0 && !isLinear && (
            <div
              className={`absolute inset-0 border border-dotted border-blue-300/40 pointer-events-none ${
                isEllipse ? 'rounded-full' : ''
              }`}
              style={{
                transform: `scale(${1 + (feather / 100) * 0.4})`,
                transformOrigin: 'center center',
              }}
            />
          )}

          {/* Rotation Handle */}
          <div
            className="absolute left-1/2 -top-6 -translate-x-1/2 flex flex-col items-center pointer-events-auto cursor-grab active:cursor-grabbing group"
            onPointerDown={e => handlePointerDown(e, 'rotate')}
            title="Drag to rotate mask"
          >
            <div className="w-3.5 h-3.5 rounded-full bg-blue-400 border-2 border-zinc-950 shadow-md flex items-center justify-center group-hover:scale-125 transition-transform">
              <RotateCw className="w-2 h-2 text-zinc-950 stroke-[3]" />
            </div>
            <div className="w-px h-2.5 bg-blue-400/80" />
          </div>

          {/* Scale corner & edge handles for rectangle and ellipse */}
          {!isLinear && (
            <>
              {/* Corners */}
              <div
                className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-600 rounded-sm cursor-nwse-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-nw')}
              />
              <div
                className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-600 rounded-sm cursor-nesw-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-ne')}
              />
              <div
                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-600 rounded-sm cursor-nwse-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-se')}
              />
              <div
                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-600 rounded-sm cursor-nesw-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-sw')}
              />

              {/* Edges */}
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-2 bg-white border border-blue-600 rounded-sm cursor-ns-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-n')}
              />
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-2 bg-white border border-blue-600 rounded-sm cursor-ns-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-s')}
              />
              <div
                className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-3 bg-white border border-blue-600 rounded-sm cursor-ew-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-w')}
              />
              <div
                className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-3 bg-white border border-blue-600 rounded-sm cursor-ew-resize shadow"
                onPointerDown={e => handlePointerDown(e, 'scale-e')}
              />
            </>
          )}

          {/* Linear dividing line handles */}
          {isLinear && (
            <>
              <div
                className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow cursor-grab"
                onPointerDown={e => handlePointerDown(e, 'rotate')}
              />
              <div
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow cursor-grab"
                onPointerDown={e => handlePointerDown(e, 'rotate')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
