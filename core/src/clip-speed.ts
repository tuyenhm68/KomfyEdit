/**
 * The speed range a clip can be played at, and how it maps onto a slider.
 *
 * The range matches what CapCut offers, 0.1x to 100x, which spans three
 * decades. A linear slider over that range is unusable: 1x would land less than
 * one percent along it, and every ordinary speed would be crammed against the
 * left edge. The mapping here is logarithmic, so each decade — 0.1x to 1x, 1x
 * to 10x, 10x to 100x — gets an equal share of the track and 1x sits a third of
 * the way in.
 */

export const MIN_CLIP_SPEED = 0.1
export const MAX_CLIP_SPEED = 100

/** Slider positions run 0 to 1 rather than in speed units. */
const MIN_LOG = Math.log10(MIN_CLIP_SPEED)
const MAX_LOG = Math.log10(MAX_CLIP_SPEED)

/**
 * How close to a landmark speed counts as being on it.
 *
 * Without this, 1x is a single pixel on a three-decade slider and dragging back
 * to normal speed by hand is luck. The window is in slider units, so it stays
 * the same physical distance wherever the landmark sits.
 */
const SNAP_WINDOW = 0.012
const SNAP_TARGETS = [0.25, 0.5, 1, 2, 5, 10, 50, 100]

export function clampClipSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1
  return Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed))
}

/** Where a speed sits on the slider, 0 at the slowest and 1 at the fastest. */
export function sliderPositionForSpeed(speed: number): number {
  const clamped = clampClipSpeed(speed)
  return (Math.log10(clamped) - MIN_LOG) / (MAX_LOG - MIN_LOG)
}

/**
 * The speed a slider position means, snapped to a landmark when it is near one
 * and rounded to two decimals otherwise — 3.7419x helps nobody.
 */
export function speedForSliderPosition(position: number): number {
  const clampedPosition = Math.min(1, Math.max(0, position))
  const raw = Math.pow(10, MIN_LOG + clampedPosition * (MAX_LOG - MIN_LOG))

  for (const target of SNAP_TARGETS) {
    if (Math.abs(sliderPositionForSpeed(target) - clampedPosition) <= SNAP_WINDOW) {
      return target
    }
  }

  return clampClipSpeed(Math.round(raw * 100) / 100)
}

/** How a speed is written in the UI: 1x, 2.5x, 100x — never 2.50x or 100.00x. */
export function formatClipSpeed(speed: number): string {
  const clamped = clampClipSpeed(speed)
  const rounded = Math.round(clamped * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}x`
}

/**
 * The fastest a media element can actually play in the browser.
 *
 * Chrome and friends clamp `playbackRate` to 16; asking for more is either
 * ignored or throws. Above this the element cannot keep up with the timeline,
 * and what shows on screen is whatever it managed to decode — frames from
 * further back in the file, corrected by a seek, then falling behind again.
 * That reads as the clip stuttering between the right moment and an earlier
 * one, which looks like footage from elsewhere in the video mixed in.
 */
export const MAX_REALTIME_PLAYBACK_RATE = 16

export interface PlaybackDriveMode {
  /** What to set on the element. Meaningless while `seekDriven` is true. */
  rate: number
  /**
   * Whether the element has to be stepped by seeking instead of played.
   *
   * Past the element's rate ceiling there is no way to play in real time, so
   * the monitor pauses it and moves it frame by frame. Choppier, but every
   * frame shown is the right one — and at 20x you are seeing every twentieth
   * frame regardless.
   */
  seekDriven: boolean
}

/** How the preview should drive a media element for a given clip speed. */
export function playbackDriveModeForSpeed(speed: number): PlaybackDriveMode {
  const clamped = clampClipSpeed(speed)
  return clamped > MAX_REALTIME_PLAYBACK_RATE
    ? { rate: 1, seekDriven: true }
    : { rate: Math.max(0.1, clamped), seekDriven: false }
}

/**
 * How much of the source file a stretch of timeline consumes.
 *
 * `trimStart` and `trimEnd` are measured in the source file's own seconds,
 * while `startTime` and `duration` are measured on the timeline. Speed is the
 * exchange rate between the two, and forgetting it is silent: at 1x the two
 * units are equal, so a conversion that omits speed looks right until someone
 * retimes a clip. A cut in a 6x clip then set the second half's `trimStart` six
 * times too early, and it replayed footage the first half had already shown.
 */
export function mediaSecondsForTimelineSeconds(
  timelineSeconds: number,
  speed: number | undefined,
): number {
  return timelineSeconds * clampClipSpeed(speed ?? 1)
}
