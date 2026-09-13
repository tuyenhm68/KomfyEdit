import { makeId } from './id-generator'
import type { KomfyTemplate, TemplateSlot } from './template-model'
import { DEFAULT_CLIP_TRANSFORM, type Asset, type Timeline, type TimelineClip } from './project-model'

/* ────────────────────────────────────────────────────────────────
   Filling a template's holes.

   Two rules carry the whole thing:

   1. A slot's duration never changes. These edits are cut to a rhythm, and a
      slot that shrinks to fit a short clip drags every later cut off the beat.
   2. Nothing about the slot's look is touched. The transform, keyframes,
      filter, effects, transitions and text are the template — replacing them
      with the incoming clip's defaults would apply nothing at all.

   Everything below follows from those two.
   ──────────────────────────────────────────────────────────────── */

/**
 * Slowest a clip may be played to fill a slot it is too short for.
 *
 * Half speed is about as far as ordinary footage stretches before it reads as
 * an effect rather than a cut. Past that the slot is left short instead:
 * a visibly slow-motion shot the user did not ask for is worse than a gap
 * they can see and fix.
 */
export const MIN_SLOT_SPEED = 0.5

export interface SlotFit {
  /** Where in the media the slot starts, in media seconds. */
  trimStart: number
  /** How long the clip occupies on the timeline. */
  duration: number
  speed: number
  /** True when the media ran out and the slot could not be filled. */
  short: boolean
}

/**
 * How much of a piece of media goes into one slot, and how fast.
 *
 * `mediaDuration` is the usable length of the asset. An asset with no known
 * duration — a still image — can fill any slot, so it is treated as endless.
 */
export function fitAssetToSlot(slot: TemplateSlot, mediaDuration: number | undefined): SlotFit {
  const wanted = slot.duration

  // A still has no length of its own; it simply holds for as long as asked.
  if (mediaDuration === undefined || !Number.isFinite(mediaDuration) || mediaDuration <= 0) {
    return { trimStart: 0, duration: wanted, speed: 1, short: false }
  }

  if (mediaDuration >= wanted) {
    return { trimStart: 0, duration: wanted, speed: 1, short: false }
  }

  // Short clip: stretch it if the stretch stays believable.
  const neededSpeed = mediaDuration / wanted
  if (neededSpeed >= MIN_SLOT_SPEED) {
    return { trimStart: 0, duration: wanted, speed: Number(neededSpeed.toFixed(4)), short: false }
  }

  // Too short to stretch. Keep real speed and leave the slot visibly unfilled
  // rather than turning the user's clip into slow motion they never asked for.
  return { trimStart: 0, duration: mediaDuration, speed: 1, short: true }
}

/**
 * The scale that makes a piece of media cover a frame of another shape.
 *
 * Templates are usually 1080×1920 and footage is usually landscape, so without
 * this every applied template would show pillarboxed video inside the vertical
 * frame. Returned as a percentage because `clip.transform.scale` is one.
 *
 * Unknown media dimensions mean no opinion: 100 leaves the clip exactly as the
 * template author had it, which is the safe answer.
 */
export function coverScaleFor(
  media: { width?: number; height?: number } | undefined,
  frame: { width: number; height: number },
): number {
  if (!media?.width || !media?.height || !frame.width || !frame.height) return 100

  const mediaAspect = media.width / media.height
  const frameAspect = frame.width / frame.height
  // Wider than the frame: height is the binding dimension, and vice versa.
  const cover = mediaAspect > frameAspect ? mediaAspect / frameAspect : frameAspect / mediaAspect
  return Number((cover * 100).toFixed(2))
}

export interface TemplateBinding {
  slotIndex: number
  asset: Asset
}

export interface ApplyTemplateResult {
  timeline: Timeline
  /** Slots the media was too short for, by slot index. */
  shortSlots: number[]
  /** Slots nobody supplied media for; they stay empty. */
  unfilledSlots: number[]
}

/**
 * Builds the timeline an applied template produces.
 *
 * Every clip is given a fresh id, and `linkedClipIds` plus the timeline's
 * transitions are remapped onto the new ids — the same care `duplicateTimeline`
 * takes, for the same reason: an id that still points into the template makes
 * linked audio and cross-dissolves attach to nothing.
 */
export function applyTemplate(
  template: KomfyTemplate,
  bindings: ReadonlyArray<TemplateBinding>,
  options?: { timelineId?: string; name?: string; variantTag?: string },
): ApplyTemplateResult {
  const bySlotIndex = new Map(bindings.map(binding => [binding.slotIndex, binding.asset]))
  const slotByClipId = new Map<string, TemplateSlot>(
    template.slots.map(slot => [slot.clipId, slot]),
  )

  const idMap = new Map<string, string>()
  for (const clip of template.timeline.clips) {
    idMap.set(clip.id, makeId('clip'))
  }

  const frame = { width: template.width, height: template.height }
  const shortSlots: number[] = []
  const unfilledSlots: number[] = []

  const clips: TimelineClip[] = template.timeline.clips.map(clip => {
    const remapped: TimelineClip = {
      ...clip,
      id: idMap.get(clip.id)!,
      ...(clip.linkedClipIds
        ? { linkedClipIds: clip.linkedClipIds.map(old => idMap.get(old) ?? old) }
        : {}),
    }

    const slot = slotByClipId.get(clip.id)
    if (!slot) return remapped

    const asset = bySlotIndex.get(slot.slotIndex)
    if (!asset) {
      unfilledSlots.push(slot.slotIndex)
      return remapped
    }

    const fit = fitAssetToSlot(slot, asset.duration)
    if (fit.short) shortSlots.push(slot.slotIndex)

    return {
      ...remapped,
      type: asset.type === 'image' ? 'image' : 'video',
      assetId: asset.id,
      asset,
      importedName: asset.path ? asset.path.split(/[/\\]/).pop() : undefined,
      trimStart: fit.trimStart,
      trimEnd: 0,
      duration: fit.duration,
      speed: fit.speed,
      // The template's framing is kept; only the scale needed to cover the
      // frame is recomputed, because that depends on the incoming media.
      transform: {
        ...(clip.transform ?? DEFAULT_CLIP_TRANSFORM),
        scale: Math.max(
          clip.transform?.scale ?? DEFAULT_CLIP_TRANSFORM.scale,
          coverScaleFor(asset, frame),
        ),
      },
    } as TimelineClip
  })

  // A transition names the two clips it sits between, so both ends have to
  // follow the clips to their new ids or the overlap attaches to nothing.
  const transitions = (template.timeline.transitions ?? []).map(transition => ({
    ...transition,
    leftClipId: idMap.get(transition.leftClipId) ?? transition.leftClipId,
    rightClipId: idMap.get(transition.rightClipId) ?? transition.rightClipId,
  }))

  return {
    timeline: {
      ...template.timeline,
      id: options?.timelineId ?? makeId('timeline'),
      name: options?.name ?? template.name,
      createdAt: Date.now(),
      clips,
      ...(transitions.length > 0 ? { transitions } : {}),
      width: template.width,
      height: template.height,
      ...(template.fps ? { fps: template.fps } : {}),
      variantTag: options?.variantTag ?? 'template',
    },
    shortSlots: shortSlots.sort((a, b) => a - b),
    unfilledSlots: unfilledSlots.sort((a, b) => a - b),
  }
}
