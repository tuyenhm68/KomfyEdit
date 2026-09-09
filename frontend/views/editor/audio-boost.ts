import { logger } from '../../lib/logger'

/**
 * Preview-side volume boost.
 *
 * `HTMLMediaElement.volume` is capped at 1.0, so a clip boosted past 100% would
 * play back at unity in preview while exporting louder. Routing the element
 * through a Web Audio gain node lifts that cap, and a shared limiter keeps the
 * boost from clipping the speakers, mirroring the export limiter.
 *
 * The catch: `MediaElementAudioSourceNode` outputs *silence* for a media
 * resource the page cannot read cross-origin, and clip media is loaded over
 * `file://`. Whether that counts as readable depends on the packaging (a
 * `file://` page in the packaged app, `http://localhost` in dev). Routing an
 * element is also irreversible — `createMediaElementSource` may only be called
 * once per element and permanently redirects its output.
 *
 * So the graph is never attached to a real playback element until a throwaway
 * probe on the same URL has proven that samples actually flow. If the probe
 * cannot confirm it, preview stays at unity rather than risking silence, and
 * `isPreviewBoostAvailable()` lets the UI say so.
 */

interface BoostChain {
  gain: GainNode
}

type ProbeVerdict = 'unknown' | 'probing' | 'usable' | 'unusable'

const PROBE_SETTLE_MS = 400
const PROBE_RMS_THRESHOLD = 1e-5

let audioContext: AudioContext | null = null
let masterLimiter: DynamicsCompressorNode | null = null
let probeVerdict: ProbeVerdict = 'unknown'
const chains = new WeakMap<HTMLMediaElement, BoostChain>()

function getContext(): AudioContext | null {
  if (audioContext) return audioContext
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  audioContext = new Ctor()
  const limiter = audioContext.createDynamicsCompressor()
  // Brick-wall-ish: catch only what would overshoot, and catch it fast.
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.12
  limiter.connect(audioContext.destination)
  masterLimiter = limiter

  return audioContext
}

/**
 * Play a hidden copy of `url` through a Web Audio graph that is *not* connected
 * to the speakers, and report whether any signal came through. Silence means the
 * resource is opaque to Web Audio and boosting must be skipped.
 */
async function probeWebAudioAccess(url: string): Promise<void> {
  if (probeVerdict !== 'unknown') return
  probeVerdict = 'probing'

  const context = getContext()
  if (!context) {
    probeVerdict = 'unusable'
    return
  }

  const element = document.createElement('audio')
  element.src = url
  element.loop = true
  element.preload = 'auto'

  try {
    await new Promise<void>((resolve, reject) => {
      element.onloadedmetadata = () => resolve()
      element.onerror = () => reject(new Error('probe media failed to load'))
      setTimeout(() => reject(new Error('probe media timed out')), 4000)
    })

    const source = context.createMediaElementSource(element)
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    // Deliberately not connected to context.destination: the probe is inaudible.

    await context.resume()
    // Start a little way in, so leading digital silence does not fail the probe.
    if (Number.isFinite(element.duration) && element.duration > 1) {
      element.currentTime = element.duration / 3
    }
    await element.play()
    await new Promise(resolve => setTimeout(resolve, PROBE_SETTLE_MS))

    const samples = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(samples)
    let sumSquares = 0
    for (const sample of samples) sumSquares += sample * sample
    const rms = Math.sqrt(sumSquares / samples.length)

    probeVerdict = rms > PROBE_RMS_THRESHOLD ? 'usable' : 'unusable'
    if (probeVerdict === 'unusable') {
      logger.warn(
        'Preview volume boost disabled: media is opaque to Web Audio, so preview stays at 100%. '
        + 'Export is unaffected.',
      )
    }
  } catch {
    probeVerdict = 'unusable'
  } finally {
    element.pause()
    element.removeAttribute('src')
    element.load()
  }
}

function getOrCreateChain(element: HTMLMediaElement): BoostChain | null {
  const existing = chains.get(element)
  if (existing) return existing

  const context = getContext()
  if (!context || !masterLimiter) return null

  try {
    const source = context.createMediaElementSource(element)
    const gain = context.createGain()
    source.connect(gain)
    gain.connect(masterLimiter)
    const chain: BoostChain = { gain }
    chains.set(element, chain)
    return chain
  } catch {
    return null
  }
}

/**
 * Set a clip's playback gain, where 1 is unity and higher values boost.
 *
 * Gains at or below unity use the element's own volume, so a project that never
 * boosts anything never builds a Web Audio graph.
 */
export function applyPlaybackGain(element: HTMLMediaElement, gain: number): void {
  const safeGain = Number.isFinite(gain) ? Math.max(0, gain) : 1

  if (safeGain <= 1) {
    const chain = chains.get(element)
    // An already-routed element keeps its boost transparent and lets the
    // element's own volume do the attenuating.
    if (chain) chain.gain.gain.value = 1
    element.volume = safeGain
    return
  }

  if (probeVerdict === 'unknown' && element.currentSrc) {
    void probeWebAudioAccess(element.currentSrc)
  }

  if (probeVerdict !== 'usable') {
    // Not proven safe yet: play at unity rather than risk routing into silence.
    // The next sync tick will boost once the probe lands.
    element.volume = 1
    return
  }

  const chain = getOrCreateChain(element)
  if (!chain) {
    element.volume = 1
    return
  }

  element.volume = 1
  chain.gain.gain.value = safeGain
}

/**
 * Whether preview can actually reproduce a boost above 100%. False means the
 * platform blocked Web Audio access to the media and preview is capped at
 * unity; the exported file is still boosted.
 */
export function isPreviewBoostAvailable(): boolean {
  return probeVerdict !== 'unusable'
}

/**
 * Browsers start an AudioContext suspended until a user gesture. Call this when
 * playback starts so boosted clips are audible.
 */
export function resumePlaybackAudioContext(): void {
  if (audioContext?.state === 'suspended') {
    void audioContext.resume()
  }
}
