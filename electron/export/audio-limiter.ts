const FULL_SCALE = 32768

/** Leave a hair of headroom so rounding to int16 can never wrap. */
const CEILING = 0.99

/**
 * Look-ahead window. The limiter starts pulling the gain down this far before a
 * peak arrives, which is what keeps a boost sounding clean instead of crackling.
 */
const LOOKAHEAD_SECONDS = 0.005

/** How fast the gain recovers once a peak has passed. */
const RELEASE_SECONDS = 0.12

export interface LimiterResult {
  /** Peak of the input mix, in linear full-scale units (1 = 0 dBFS). */
  inputPeak: number
  /** Strongest gain reduction applied, in dB. 0 means the limiter never engaged. */
  maxReductionDb: number
  engaged: boolean
}

/**
 * Stereo-linked look-ahead peak limiter, applied in place to an interleaved
 * float mix (samples in int16 range, i.e. ±32768).
 *
 * Hard-clamping a boosted mix flat-tops the waveform and produces harmonic
 * distortion — the crunch you hear when a clip is pushed past 0 dBFS. Instead
 * this computes a per-frame gain envelope, takes a sliding minimum over the
 * look-ahead window so the reduction is always in place *before* the peak, then
 * smooths the release so the level glides back rather than pumping.
 *
 * Both channels share one envelope, so the stereo image never shifts.
 * Returns without touching the buffer when nothing exceeds the ceiling.
 */
export function applyLookaheadLimiter(
  mix: Float64Array,
  channels: number,
  sampleRate: number,
): LimiterResult {
  const frames = Math.floor(mix.length / channels)
  if (frames === 0) return { inputPeak: 0, maxReductionDb: 0, engaged: false }

  // Per-frame peak across all channels, normalised to 1 = full scale.
  const framePeak = new Float32Array(frames)
  let inputPeak = 0
  for (let f = 0; f < frames; f++) {
    let peak = 0
    const base = f * channels
    for (let c = 0; c < channels; c++) {
      const magnitude = Math.abs(mix[base + c])
      if (magnitude > peak) peak = magnitude
    }
    const normalised = peak / FULL_SCALE
    framePeak[f] = normalised
    if (normalised > inputPeak) inputPeak = normalised
  }

  if (inputPeak <= CEILING) {
    return { inputPeak, maxReductionDb: 0, engaged: false }
  }

  // Target gain per frame: only below 1 where the signal would overshoot.
  const targetGain = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    targetGain[f] = framePeak[f] > CEILING ? CEILING / framePeak[f] : 1
  }

  // Sliding minimum over the look-ahead window, so the gain is already down by
  // the time the peak arrives. Monotonic deque keeps this O(n).
  const window = Math.max(1, Math.round(LOOKAHEAD_SECONDS * sampleRate))
  const envelope = new Float32Array(frames)
  const deque = new Int32Array(frames)
  let head = 0
  let tail = 0

  for (let f = 0; f < frames; f++) {
    const windowEnd = Math.min(frames - 1, f + window)
    // Extend the window to cover everything up to windowEnd.
    const fillFrom = f === 0 ? 0 : Math.min(frames - 1, f - 1 + window) + 1
    for (let j = fillFrom; j <= windowEnd; j++) {
      while (tail > head && targetGain[deque[tail - 1]] >= targetGain[j]) tail--
      deque[tail++] = j
    }
    // Drop indices that have fallen out of the left edge.
    while (tail > head && deque[head] < f) head++
    envelope[f] = tail > head ? targetGain[deque[head]] : 1
  }

  // Release smoothing: the gain may drop instantly (the look-ahead already gave
  // us warning) but recovers with a one-pole glide.
  const releaseCoefficient = Math.exp(-1 / (RELEASE_SECONDS * sampleRate))
  let smoothed = 1
  let maxReduction = 1
  for (let f = 0; f < frames; f++) {
    const target = envelope[f]
    smoothed = target < smoothed
      ? target
      : target + (smoothed - target) * releaseCoefficient
    if (smoothed < maxReduction) maxReduction = smoothed

    const base = f * channels
    for (let c = 0; c < channels; c++) {
      mix[base + c] *= smoothed
    }
  }

  return {
    inputPeak,
    maxReductionDb: -20 * Math.log10(Math.max(maxReduction, 1e-6)),
    engaged: true,
  }
}
