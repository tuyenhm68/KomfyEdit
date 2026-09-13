import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  selectActiveTimelineInPoint,
  selectActiveTimelineOutPoint,
  selectContentDuration,
  selectIsPlaying,
  selectPlayingInOut,
  selectShuttleSpeed,
  selectTotalDuration,
} from './editor-selectors'
import { useEditorActions, useEditorGetState, useEditorStore } from './editor-store'

const STATE_UPDATE_INTERVAL_MS = 250

export interface UsePlaybackEngineParams {
  playbackTimeRef: React.MutableRefObject<number>
}

export function usePlaybackEngine(params: UsePlaybackEngineParams) {
  const {
    playbackTimeRef,
  } = params
  const { setCurrentTime, setPlayingInOut, stopShuttle } = useEditorActions()
  const isPlaying = useEditorStore(selectIsPlaying)
  const shuttleSpeed = useEditorStore(selectShuttleSpeed)
  const playingInOut = useEditorStore(selectPlayingInOut)
  const inPoint = useEditorStore(selectActiveTimelineInPoint)
  const outPoint = useEditorStore(selectActiveTimelineOutPoint)
  const totalDuration = useEditorStore(selectTotalDuration)
  const getEditorState = useEditorGetState()

  const lastStateUpdateRef = useRef(0)
  const prevIsPlayingRef = useRef(isPlaying)

  // Flush transport time immediately when playback stops to avoid a one-frame
  // visual jump where paused UI reads stale currentTime before effect cleanup runs.
  useLayoutEffect(() => {
    const wasPlaying = prevIsPlayingRef.current
    prevIsPlayingRef.current = isPlaying
    if (wasPlaying && !isPlaying) {
      setCurrentTime(playbackTimeRef.current)
    }
  }, [isPlaying, playbackTimeRef, setCurrentTime])

  useEffect(() => {
    if (!isPlaying) return

    // If starting playback while already at or past the end of the content, rewind to 0!
    const currentState = getEditorState()
    const contentDuration = selectContentDuration(currentState)
    if (contentDuration > 0 && playbackTimeRef.current >= contentDuration - 0.04) {
      playbackTimeRef.current = 0
      setCurrentTime(0)
    }

    const effectiveSpeed = shuttleSpeed !== 0 ? shuttleSpeed : 1
    let lastTimestamp: number | null = null
    let animFrameId = 0

    lastStateUpdateRef.current = 0

    const tick = (timestamp: number) => {
      if (lastTimestamp === null) {
        lastTimestamp = timestamp
        lastStateUpdateRef.current = timestamp
      }

      const deltaMs = timestamp - lastTimestamp
      lastTimestamp = timestamp
      const deltaSec = (deltaMs / 1000) * effectiveSpeed

      let next = playbackTimeRef.current + deltaSec
      let stopped = false

      if (playingInOut && inPoint !== null && outPoint !== null) {
        const loopStart = Math.min(inPoint, outPoint)
        const loopEnd = Math.max(inPoint, outPoint)
        if (next >= loopEnd) next = loopStart
        else if (next <= loopStart) next = loopEnd
      } else {
        const currentContentDuration = selectContentDuration(getEditorState())
        const maxLimit = currentContentDuration > 0 ? currentContentDuration : totalDuration
        if (next >= maxLimit) {
          next = maxLimit
          stopped = true
        } else if (next < 0) {
          next = 0
          stopped = true
        }
      }

      playbackTimeRef.current = next

      if (stopped) {
        stopShuttle()
        setCurrentTime(next)
        return
      }

      if (timestamp - lastStateUpdateRef.current >= STATE_UPDATE_INTERVAL_MS) {
        lastStateUpdateRef.current = timestamp
        setCurrentTime(next)
      }

      animFrameId = requestAnimationFrame(tick)
    }

    animFrameId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animFrameId)
      setCurrentTime(playbackTimeRef.current)
    }
  }, [
    isPlaying,
    shuttleSpeed,
    playingInOut,
    inPoint,
    outPoint,
    totalDuration,
    playbackTimeRef,
    setCurrentTime,
    stopShuttle,
    getEditorState,
  ])

  useEffect(() => {
    if (!isPlaying && playingInOut) {
      setPlayingInOut(false)
    }
  }, [isPlaying, playingInOut, setPlayingInOut])
}
