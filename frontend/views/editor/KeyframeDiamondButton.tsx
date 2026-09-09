import React, { useEffect, useState, useCallback, useRef } from 'react'
import type { TimelineClip, KeyframeProperty } from '../../types/project-model'
import { getKeyframeTrack } from '@core/keyframes'
import { selectCurrentTime } from './editor-selectors'
import { useEditorActions, useEditorGetState, useEditorSubscribeToSlice } from './editor-store'

export interface KeyframeDiamondButtonProps {
  clip: TimelineClip
  property: KeyframeProperty
  currentValue: number
  className?: string
}

export const KeyframeDiamondButton: React.FC<KeyframeDiamondButtonProps> = ({
  clip,
  property,
  currentValue,
  className = '',
}) => {
  const { setKeyframe, removeKeyframeAt } = useEditorActions()
  const getState = useEditorGetState()
  const subscribeToSlice = useEditorSubscribeToSlice()

  const track = getKeyframeTrack(clip, property)
  const hasTrack = Boolean(track && track.points && track.points.length > 0)

  // Track whether playhead is on a keyframe point
  const [playheadState, setPlayheadState] = useState<{
    timeInClip: number
    isOnKeyframe: boolean
    activePointT: number | null
    isInsideClip: boolean
  }>(() => {
    const time = selectCurrentTime(getState())
    const timeInClip = time - clip.startTime
    const isInsideClip = timeInClip >= -0.05 && timeInClip <= clip.duration + 0.05
    const matchedPoint = track?.points.find(p => Math.abs(p.t - timeInClip) <= 0.08)
    return {
      timeInClip: Math.max(0, Math.min(clip.duration, timeInClip)),
      isOnKeyframe: Boolean(matchedPoint),
      activePointT: matchedPoint ? matchedPoint.t : null,
      isInsideClip,
    }
  })

  // Keep a ref to latest track and clip so the subscription callback is fresh
  const trackRef = useRef(track)
  trackRef.current = track
  const clipRef = useRef(clip)
  clipRef.current = clip

  const updateFromTime = useCallback((currentTime: number) => {
    const currentClip = clipRef.current
    const currentTrack = trackRef.current
    const timeInClip = currentTime - currentClip.startTime
    const isInsideClip = timeInClip >= -0.05 && timeInClip <= currentClip.duration + 0.05
    const clampedT = Math.max(0, Math.min(currentClip.duration, timeInClip))
    const matchedPoint = currentTrack?.points.find(p => Math.abs(p.t - clampedT) <= 0.08)
    setPlayheadState({
      timeInClip: clampedT,
      isOnKeyframe: Boolean(matchedPoint),
      activePointT: matchedPoint ? matchedPoint.t : null,
      isInsideClip,
    })
  }, [])

  useEffect(() => {
    updateFromTime(selectCurrentTime(getState()))
    return subscribeToSlice(selectCurrentTime, updateFromTime)
  }, [getState, subscribeToSlice, updateFromTime, clip.id, track])

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!playheadState.isInsideClip) return

    if (playheadState.isOnKeyframe && playheadState.activePointT !== null) {
      removeKeyframeAt(clip.id, property, playheadState.activePointT)
    } else {
      setKeyframe(clip.id, property, playheadState.timeInClip, currentValue, 'linear')
    }
  }

  const { isInsideClip, isOnKeyframe } = playheadState

  const tooltip = !isInsideClip
    ? 'Playhead is outside this clip'
    : isOnKeyframe
      ? 'Remove keyframe at playhead'
      : hasTrack
        ? 'Add keyframe at playhead'
        : 'Enable keyframing for this property'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isInsideClip}
      title={tooltip}
      className={`inline-flex items-center justify-center w-5 h-5 rounded hover:bg-zinc-800/80 transition-colors ${
        !isInsideClip ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" className="flex-shrink-0">
        <polygon
          points="6,1 11,6 6,11 1,6"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className={
            isOnKeyframe
              ? 'fill-amber-400 stroke-amber-400 hover:fill-amber-300 hover:stroke-amber-300'
              : hasTrack
                ? 'fill-transparent stroke-amber-400 hover:fill-amber-400/30'
                : 'fill-transparent stroke-zinc-500 hover:stroke-amber-400'
          }
        />
      </svg>
    </button>
  )
}
