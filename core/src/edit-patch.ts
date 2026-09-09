import { z } from 'zod'
import type { EditorState } from './editor-state'
import { selectClips, selectActiveTimeline } from './editor-selectors'
import {
  deleteClips,
  splitClipsAtTime,
  moveClips,
  slipClip,
  slideClip,
  updateClip,
  insertAssetsToTimeline,
  addSubtitle,
  importSrtCues,
  addTextClip,
  addSubtitleTrack,
  replaceActiveTimeline,
  setClipFilter,
  removeClipFilter,
  addFilterClip,
  detachAudio,
  setKeyframe,
  setKeyframePoints,
  removeKeyframeAt,
  clearKeyframes,
  setAudioFade,
  normalizeClipAudio,
  duckClipAudio,
  setTimelineSettings,
  setTimelineBackground,
  setClipMask,
  setClipChromaKey,
  setClipBlendMode,
  applyTextPresetToClip,
  applyTextAnimationToClip,
  addStickerClip,
  addMarker,
  deleteMarker,
  updateMarker,
  freezeFrame,
  punchInClip,
  punchInSequence,
  createHighlightShort,
  insertBrollClip,
  duplicateTimeline,
  deleteTimeline,
  switchActiveTimeline,
  setTimelineVariantInfo,
} from './editor-actions'
import { getTextPreset, getTextAnimation, getSubtitlePreset, applySubtitlePreset } from './text-presets'
import { getStickerDefinition } from './stickers'
import { keyframePropertySchema, keyframeEasingSchema, timelineBackgroundSchema, clipMaskSchema, chromaKeySchema } from './project-model'
import { clipBlendModeSchema } from './blend-modes'
import { makeId } from './id-generator'
import { getFilterDefinition } from './filters'
import { DEFAULT_TRANSITION_DURATION, getTransitionDefinition } from './transitions'
import {
  findTransitionAtCut,
  removeTransitionById,
  resolveCut,
  setTransitionAtCut,
} from './timeline-transitions'
import { parseSrt, chunkSrtCues } from './srt'
import type { SrtCue } from './srt'
import { beginTransaction, commitTransaction } from './transaction'
import type { ValidationError } from './validator'

// ── 1. Edit Patch Zod Schema ───────────────────────────────────────────────

export const editPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('split_clip'),
    clipId: z.string().min(1, 'clipId is required'),
    splitTime: z.number().min(0, 'splitTime must be non-negative'),
  }),
  z.object({
    op: z.literal('delete_clips'),
    clipIds: z.array(z.string().min(1)).min(1, 'clipIds must not be empty'),
  }),
  z.object({
    op: z.literal('delete_clip'),
    clipId: z.string().min(1, 'clipId is required'),
  }),
  z.object({
    op: z.literal('cut_range'),
    startTime: z.number().min(0, 'startTime must be non-negative'),
    endTime: z.number().min(0, 'endTime must be non-negative'),
    label: z.string().optional(),
  }).refine(data => data.endTime > data.startTime, {
    message: 'endTime must be greater than startTime',
    path: ['endTime'],
  }),
  z.object({
    op: z.literal('move_clip'),
    clipId: z.string().min(1, 'clipId is required'),
    deltaTime: z.number(),
  }),
  z.object({
    op: z.literal('slip_clip'),
    clipId: z.string().min(1, 'clipId is required'),
    delta: z.number(),
  }),
  z.object({
    op: z.literal('slide_clip'),
    clipId: z.string().min(1, 'clipId is required'),
    delta: z.number(),
  }),
  z.object({
    op: z.literal('update_clip'),
    clipId: z.string().min(1, 'clipId is required'),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal('insert_clip'),
    assetId: z.string().min(1, 'assetId is required'),
    trackIndex: z.number().int().min(0).optional(),
    startTime: z.number().min(0, 'startTime must be non-negative').optional(),
    duration: z.number().positive('duration must be positive').optional(),
  }),
  z.object({
    op: z.literal('add_subtitle'),
    text: z.string().min(1, 'text is required'),
    startTime: z.number().min(0, 'startTime must be non-negative'),
    endTime: z.number().min(0, 'endTime must be non-negative'),
    trackIndex: z.number().int().min(0).optional(),
    style: z.record(z.string(), z.unknown()).optional(),
    preset: z.string().optional(),
  }).refine(data => data.endTime > data.startTime, {
    message: 'endTime must be greater than startTime',
    path: ['endTime'],
  }),
  z.object({
    op: z.literal('import_srt'),
    content: z.string().min(1, 'content is required'),
    targetTrackIndex: z.number().int().min(0).optional(),
    chunk: z.boolean().optional(),
    minWords: z.number().int().positive().optional(),
    maxWords: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    preset: z.string().optional(),
  }),
  z.object({
    op: z.literal('chunk_subtitles'),
    trackIndex: z.number().int().min(0).optional(),
    minWords: z.number().int().positive().optional(),
    maxWords: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    preset: z.string().optional(),
  }),
  z.object({
    op: z.literal('add_text'),
    text: z.string().min(1, 'text is required'),
    startTime: z.number().min(0, 'startTime must be non-negative').optional(),
    duration: z.number().positive('duration must be positive').optional(),
    trackIndex: z.number().int().min(0).optional(),
    style: z.record(z.string(), z.unknown()).optional(),
    preset: z.string().optional(),
    animation: z.string().optional(),
  }),
  z.object({
    op: z.literal('apply_text_preset'),
    clipId: z.string().min(1, 'clipId is required'),
    preset: z.string().min(1, 'preset is required'),
  }),
  z.object({
    op: z.literal('apply_text_animation'),
    clipId: z.string().min(1, 'clipId is required'),
    animation: z.string().min(1, 'animation is required'),
  }),
  z.object({
    op: z.literal('add_sticker'),
    /** Built-in sticker id (e.g. 'star', 'fire', 'heart') or path to PNG/WebP file. */
    stickerId: z.string().min(1, 'stickerId is required'),
    startTime: z.number().min(0, 'startTime must be non-negative').optional(),
    duration: z.number().positive('duration must be positive').optional(),
    trackIndex: z.number().int().min(0).optional(),
    scale: z.number().positive('scale must be positive').optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    rotation: z.number().optional(),
    opacity: z.number().min(0).max(100).optional(),
  }),
  z.object({
    op: z.literal('set_transition'),
    leftClipId: z.string().min(1, 'leftClipId is required'),
    rightClipId: z.string().min(1, 'rightClipId is required'),
    /** An id from TRANSITION_DEFINITIONS; see core/src/transitions.ts. */
    type: z.string().min(1, 'type is required'),
    duration: z.number().positive('duration must be positive').optional(),
  }),
  z.object({
    op: z.literal('remove_transition'),
    leftClipId: z.string().min(1, 'leftClipId is required'),
    rightClipId: z.string().min(1, 'rightClipId is required'),
  }),
  z.object({
    op: z.literal('add_subtitle_track'),
    name: z.string().optional(),
  }),
  z.object({
    op: z.literal('set_filter'),
    clipId: z.string().min(1, 'clipId is required'),
    filterId: z.string().min(1, 'filterId is required'),
    intensity: z.number().min(0).max(100).optional(),
  }),
  z.object({
    op: z.literal('remove_filter'),
    clipId: z.string().min(1, 'clipId is required'),
  }),
  z.object({
    op: z.literal('add_filter_clip'),
    filterId: z.string().min(1, 'filterId is required'),
    intensity: z.number().min(0).max(100).optional(),
    startTime: z.number().min(0, 'startTime must be non-negative').optional(),
    duration: z.number().positive('duration must be positive').optional(),
    trackIndex: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal('detach_audio'),
    clipId: z.string().min(1, 'clipId is required'),
  }),
  z.object({
    op: z.literal('set_keyframe'),
    clipId: z.string().min(1, 'clipId is required'),
    property: keyframePropertySchema,
    t: z.number().min(0, 't must be non-negative'),
    value: z.number(),
    easing: keyframeEasingSchema.optional(),
  }),
  z.object({
    op: z.literal('set_keyframes'),
    clipId: z.string().min(1, 'clipId is required'),
    property: keyframePropertySchema,
    points: z.array(z.object({
      t: z.number().min(0, 't must be non-negative'),
      value: z.number(),
      easing: keyframeEasingSchema.optional(),
    })).min(1, 'points must contain at least 1 keyframe point'),
  }),
  z.object({
    op: z.literal('remove_keyframe'),
    clipId: z.string().min(1, 'clipId is required'),
    property: keyframePropertySchema,
    t: z.number().min(0, 't must be non-negative'),
  }),
  z.object({
    op: z.literal('clear_keyframes'),
    clipId: z.string().min(1, 'clipId is required'),
    property: keyframePropertySchema.optional(),
  }),
  z.object({
    op: z.literal('set_audio_fade'),
    clipId: z.string().min(1, 'clipId is required'),
    fadeIn: z.number().min(0, 'fadeIn must be non-negative').optional(),
    fadeOut: z.number().min(0, 'fadeOut must be non-negative').optional(),
  }),
  z.object({
    op: z.literal('normalize_audio'),
    clipId: z.string().min(1, 'clipId is required'),
    targetLufs: z.number().optional().default(-14),
    currentLufs: z.number().optional(),
    gainDb: z.number().optional(),
  }),
  z.object({
    op: z.literal('duck_audio'),
    musicClipId: z.string().min(1, 'musicClipId is required'),
    speechIntervals: z.array(z.object({
      start: z.number().min(0, 'speech interval start must be non-negative'),
      end: z.number().min(0, 'speech interval end must be non-negative'),
    })).min(1, 'speechIntervals must not be empty'),
    duckingDb: z.number().optional().default(-12),
    attack: z.number().min(0).optional().default(0.3),
    release: z.number().min(0).optional().default(0.5),
  }),
  z.object({
    op: z.literal('set_timeline_dimensions'),
    timelineId: z.string().optional(),
    width: z.number().int().positive('width must be positive'),
    height: z.number().int().positive('height must be positive'),
    fps: z.number().positive('fps must be positive').optional(),
  }),
  z.object({
    op: z.literal('set_timeline_background'),
    timelineId: z.string().optional(),
    background: timelineBackgroundSchema,
  }),
  z.object({
    op: z.literal('set_canvas'),
    timelineId: z.string().optional(),
    width: z.number().int().positive('width must be positive').optional(),
    height: z.number().int().positive('height must be positive').optional(),
    fps: z.number().positive('fps must be positive').optional(),
    background: timelineBackgroundSchema.optional(),
  }),
  z.object({
    op: z.literal('set_mask'),
    clipId: z.string().min(1, 'clipId is required'),
    mask: clipMaskSchema.nullable().optional(),
  }),
  z.object({
    op: z.literal('set_chroma_key'),
    clipId: z.string().min(1, 'clipId is required'),
    chromaKey: chromaKeySchema.nullable().optional(),
  }),
  z.object({
    op: z.literal('set_blend_mode'),
    clipId: z.string().min(1, 'clipId is required'),
    blendMode: clipBlendModeSchema,
  }),
  z.object({
    op: z.literal('add_marker'),
    time: z.number().min(0, 'time must be non-negative'),
    label: z.string().optional(),
    color: z.string().optional(),
    id: z.string().optional(),
  }),
  z.object({
    op: z.literal('delete_marker'),
    markerId: z.string().min(1, 'markerId is required'),
  }),
  z.object({
    op: z.literal('update_marker'),
    markerId: z.string().min(1, 'markerId is required'),
    time: z.number().min(0, 'time must be non-negative').optional(),
    label: z.string().optional(),
    color: z.string().optional(),
  }),
  z.object({
    op: z.literal('freeze_frame'),
    clipId: z.string().min(1, 'clipId is required'),
    time: z.number().min(0, 'time must be non-negative').optional(),
    duration: z.number().positive('duration must be positive').optional(),
    imageAssetId: z.string().optional(),
    imagePath: z.string().optional(),
  }),
  z.object({
    op: z.literal('punch_in_cut'),
    clipId: z.string().min(1, 'clipId is required'),
    scale: z.number().positive('scale must be positive').optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
  }),
  z.object({
    op: z.literal('punch_in_sequence'),
    trackIndex: z.number().int().min(0).optional(),
    scale: z.number().positive('scale must be positive').optional(),
    startWithZoom: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('create_highlight_short'),
    sourceClipId: z.string().min(1, 'sourceClipId is required'),
    startTime: z.number().min(0, 'startTime must be non-negative'),
    endTime: z.number().min(0, 'endTime must be non-negative'),
    hookText: z.string().optional(),
    hookPreset: z.string().optional(),
    hookDuration: z.number().positive('hookDuration must be positive').optional(),
    targetDimensions: z.object({
      width: z.number().positive(),
      height: z.number().positive(),
    }).optional(),
  }).refine(data => data.endTime > data.startTime, {
    message: 'endTime must be greater than startTime',
    path: ['endTime'],
  }),
  z.object({
    op: z.literal('insert_broll'),
    assetId: z.string().optional(),
    assetPath: z.string().optional(),
    startTime: z.number().min(0, 'startTime must be non-negative'),
    duration: z.number().positive('duration must be positive'),
    trackIndex: z.number().int().min(0).optional(),
    fadeIn: z.number().min(0).max(2).optional(),
    fadeOut: z.number().min(0).max(2).optional(),
    muteAudio: z.boolean().optional(),
  }),
  z.object({
    op: z.literal('duplicate_timeline'),
    timelineId: z.string().optional(),
    name: z.string().optional(),
    variantTag: z.string().optional(),
  }),
  z.object({
    op: z.literal('switch_timeline'),
    timelineId: z.string().min(1, 'timelineId is required'),
  }),
  z.object({
    op: z.literal('delete_timeline'),
    timelineId: z.string().min(1, 'timelineId is required'),
  }),
  z.object({
    op: z.literal('set_timeline_variant'),
    timelineId: z.string().optional(),
    name: z.string().optional(),
    variantTag: z.string().optional(),
    description: z.string().optional(),
  }),
])

export type EditPatchOperation = z.infer<typeof editPatchOperationSchema>

export const editPatchSchema = z.object({
  version: z.literal(1).default(1),
  description: z.string().optional(),
  operations: z.array(editPatchOperationSchema).min(1, 'operations must not be empty'),
})

export type EditPatch = z.infer<typeof editPatchSchema>

export type PatchValidationResult =
  | { valid: true; data: EditPatch }
  | { valid: false; error: string; issues?: z.ZodIssue[] }

export type PatchApplyResult =
  | {
      success: true
      state: EditorState
      description: string
      appliedCount: number
    }
  | {
      success: false
      state: EditorState
      error: string
      validationErrors?: ValidationError[]
    }

// ── 2. Validation Helper ───────────────────────────────────────────────────

/**
 * Validates an EditPatch syntactically (zod) and semantically against the state.
 */
export function validateEditPatch(state: EditorState, rawPatch: unknown): PatchValidationResult {
  const parseResult = editPatchSchema.safeParse(rawPatch)
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]
    const path = firstIssue.path.join('.')
    return {
      valid: false,
      error: `Patch schema validation failed: [${path}] ${firstIssue.message}`,
      issues: parseResult.error.issues,
    }
  }

  const patch = parseResult.data
  const activeTimeline = selectActiveTimeline(state)
  if (!activeTimeline) {
    return { valid: false, error: 'No active timeline found in editor state' }
  }

  const clipMap = new Map(activeTimeline.clips.map(c => [c.id, c]))
  const trackMap = new Map(activeTimeline.tracks.map((t, idx) => [idx, t]))

  // Semantic check: all referenced clipIds must exist and not be on locked tracks
  for (let i = 0; i < patch.operations.length; i++) {
    const op = patch.operations[i]
    if ('clipId' in op && op.clipId) {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Clip ID "${op.clipId}" does not exist in active timeline`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Cannot modify clip "${op.clipId}" on locked track #${clip.trackIndex}`,
        }
      }
    }
    if (op.op === 'cut_range') {
      const activeClips = activeTimeline.clips || []
      const timelineDuration = activeClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
      if (activeClips.length > 0 && op.startTime <= 0.05 && op.endTime >= timelineDuration - 0.05) {
        return {
          valid: false,
          error: `Operation #${i + 1} (cut_range): Khoảng thời gian cắt [${op.startTime}, ${op.endTime}] bao trùm toàn bộ timeline (${timelineDuration.toFixed(2)}s). Thao tác này sẽ xoá sạch toàn bộ video và bị từ chối vì lý do an toàn.`,
        }
      }
    }
    if (op.op === 'delete_marker' || op.op === 'update_marker') {
      const markerExists = (activeTimeline.markers || []).some(m => m.id === op.markerId)
      if (!markerExists) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Marker ID "${op.markerId}" does not exist in active timeline`,
        }
      }
    }
    if (op.op === 'set_transition' || op.op === 'remove_transition') {
      // A transition names two clips and a junction; every way that can be
      // wrong is worth saying out loud, because the agent's next move depends
      // on which one it was — a missing clip means it read a stale timeline,
      // a gap means it should close the gap first.
      for (const id of [op.leftClipId, op.rightClipId]) {
        const clip = clipMap.get(id)
        if (!clip) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Clip ID "${id}" does not exist in active timeline`,
          }
        }
        if (trackMap.get(clip.trackIndex)?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot modify clip "${id}" on locked track #${clip.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'set_transition') {
      if (!getTransitionDefinition(op.type)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_transition): Unknown transition type "${op.type}"`,
        }
      }
      const cut = resolveCut(activeTimeline, op.leftClipId, op.rightClipId)
      if (!cut.ok) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_transition): ${cut.reason}`,
        }
      }
    }
    if (op.op === 'set_filter' || op.op === 'add_filter_clip') {
      if (!getFilterDefinition(op.filterId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Unknown filter ID "${op.filterId}"`,
        }
      }
    }
    if (op.op === 'detach_audio') {
      const clip = clipMap.get(op.clipId)
      if (clip && clip.type !== 'video') {
        return {
          valid: false,
          error: `Operation #${i + 1} (detach_audio): Clip "${op.clipId}" is not a video clip (type is "${clip.type}")`,
        }
      }
      if (clip && (clip.linkedClipIds ?? []).some(id => clipMap.get(id)?.type === 'audio')) {
        return {
          valid: false,
          error: `Operation #${i + 1} (detach_audio): Clip "${op.clipId}" already has a linked audio clip`,
        }
      }
    }
    if (op.op === 'set_keyframe' || op.op === 'remove_keyframe') {
      const clip = clipMap.get(op.clipId)
      if (clip && op.t > clip.duration + 0.05) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Time ${op.t} exceeds clip duration (${clip.duration})`,
        }
      }
      if (clip && op.property === 'volume' && clip.type !== 'audio' && clip.type !== 'video') {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Cannot keyframe volume on non-audio clip "${op.clipId}" (type: ${clip.type})`,
        }
      }
      if (clip && op.property === 'filter.intensity' && !clip.filter) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Clip "${op.clipId}" has no filter applied to keyframe`,
        }
      }
      if (op.op === 'set_keyframe') {
        if (op.property === 'opacity' && (op.value < 0 || op.value > 100)) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_keyframe): Opacity value ${op.value} is out of range [0, 100]`,
          }
        }
        if (op.property === 'filter.intensity' && (op.value < 0 || op.value > 100)) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_keyframe): Filter intensity ${op.value} is out of range [0, 100]`,
          }
        }
        if (op.property === 'volume' && op.value < 0) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_keyframe): Volume value ${op.value} must be non-negative`,
          }
        }
        if (op.property === 'transform.scale' && op.value < 0) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_keyframe): Scale value ${op.value} must be non-negative`,
          }
        }
      }
    }
    if (op.op === 'set_keyframes') {
      const clip = clipMap.get(op.clipId)
      if (clip) {
        for (const p of op.points) {
          if (p.t > clip.duration + 0.05) {
            return {
              valid: false,
              error: `Operation #${i + 1} (set_keyframes): Time ${p.t} exceeds clip duration (${clip.duration})`,
            }
          }
          if (op.property === 'opacity' && (p.value < 0 || p.value > 100)) {
            return {
              valid: false,
              error: `Operation #${i + 1} (set_keyframes): Opacity value ${p.value} is out of range [0, 100]`,
            }
          }
          if (op.property === 'filter.intensity' && (p.value < 0 || p.value > 100)) {
            return {
              valid: false,
              error: `Operation #${i + 1} (set_keyframes): Filter intensity ${p.value} is out of range [0, 100]`,
            }
          }
          if (op.property === 'volume' && p.value < 0) {
            return {
              valid: false,
              error: `Operation #${i + 1} (set_keyframes): Volume value ${p.value} must be non-negative`,
            }
          }
          if (op.property === 'transform.scale' && p.value < 0) {
            return {
              valid: false,
              error: `Operation #${i + 1} (set_keyframes): Scale value ${p.value} must be non-negative`,
            }
          }
        }
        if (op.property === 'volume' && clip.type !== 'audio' && clip.type !== 'video') {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_keyframes): Cannot keyframe volume on non-audio clip "${op.clipId}" (type: ${clip.type})`,
          }
        }
        if (op.property === 'filter.intensity' && !clip.filter) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_keyframes): Clip "${op.clipId}" has no filter applied to keyframe`,
          }
        }
      }
    }
    if (op.op === 'set_audio_fade') {
      const clip = clipMap.get(op.clipId)
      if (clip) {
        if (clip.type !== 'audio' && clip.type !== 'video') {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_audio_fade): Cannot apply audio fade to non-audio clip "${op.clipId}" (type: ${clip.type})`,
          }
        }
        const fadeIn = op.fadeIn ?? 0
        const fadeOut = op.fadeOut ?? 0
        if (fadeIn > clip.duration + 0.01) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_audio_fade): Fade in duration (${fadeIn}s) exceeds clip duration (${clip.duration}s)`,
          }
        }
        if (fadeOut > clip.duration + 0.01) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_audio_fade): Fade out duration (${fadeOut}s) exceeds clip duration (${clip.duration}s)`,
          }
        }
        if (fadeIn + fadeOut > clip.duration + 0.01) {
          return {
            valid: false,
            error: `Operation #${i + 1} (set_audio_fade): Total fade duration (${fadeIn + fadeOut}s) exceeds clip duration (${clip.duration}s)`,
          }
        }
      }
    }
    if (op.op === 'normalize_audio') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (normalize_audio): Clip ID "${op.clipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'audio' && clip.type !== 'video') {
        return {
          valid: false,
          error: `Operation #${i + 1} (normalize_audio): Cannot normalize non-audio clip "${op.clipId}" (type: ${clip.type})`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (normalize_audio): Cannot modify clip "${op.clipId}" on locked track #${clip.trackIndex}`,
        }
      }
    }
    if (op.op === 'duck_audio') {
      const clip = clipMap.get(op.musicClipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (duck_audio): Music clip ID "${op.musicClipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'audio' && clip.type !== 'video') {
        return {
          valid: false,
          error: `Operation #${i + 1} (duck_audio): Cannot duck non-audio clip "${op.musicClipId}" (type: ${clip.type})`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (duck_audio): Cannot modify clip "${op.musicClipId}" on locked track #${clip.trackIndex}`,
        }
      }
      for (const seg of op.speechIntervals) {
        if (seg.end < seg.start) {
          return {
            valid: false,
            error: `Operation #${i + 1} (duck_audio): Speech interval end (${seg.end}) cannot be less than start (${seg.start})`,
          }
        }
      }
    }
    if ('clipIds' in op && Array.isArray(op.clipIds)) {
      for (const id of op.clipIds) {
        const clip = clipMap.get(id)
        if (!clip) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Clip ID "${id}" does not exist in active timeline`,
          }
        }
        const track = trackMap.get(clip.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot modify clip "${id}" on locked track #${clip.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'cut_range') {
      const overlappingLocked = activeTimeline.clips.filter(
        c => c.startTime < op.endTime && c.startTime + c.duration > op.startTime && trackMap.get(c.trackIndex)?.locked
      )
      if (overlappingLocked.length > 0) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Range [${op.startTime}, ${op.endTime}] intersects clip "${overlappingLocked[0].id}" on locked track #${overlappingLocked[0].trackIndex}`,
        }
      }
    }
    if (op.op === 'insert_clip') {
      const asset = state.editorModel.assets.find(a => a.id === op.assetId)
      if (!asset) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Asset ID "${op.assetId}" does not exist in project assets`,
        }
      }
      if (op.trackIndex !== undefined) {
        if (op.trackIndex < 0 || op.trackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.trackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot insert clip onto locked track #${op.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'add_subtitle') {
      if (op.preset && !getSubtitlePreset(op.preset)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Subtitle preset "${op.preset}" does not exist`,
        }
      }
      if (op.trackIndex !== undefined) {
        if (op.trackIndex < 0 || op.trackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.trackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot add subtitle onto locked track #${op.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'import_srt') {
      const cues = parseSrt(op.content)
      if (cues.length === 0) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): SRT content contains no valid cues`,
        }
      }
      if (op.preset && !getSubtitlePreset(op.preset)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Subtitle preset "${op.preset}" does not exist`,
        }
      }
      if (op.targetTrackIndex !== undefined) {
        if (op.targetTrackIndex < 0 || op.targetTrackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.targetTrackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.targetTrackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot import SRT onto locked track #${op.targetTrackIndex}`,
          }
        }
      }
    }
    if (op.op === 'chunk_subtitles') {
      if (op.preset && !getSubtitlePreset(op.preset)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (${op.op}): Subtitle preset "${op.preset}" does not exist`,
        }
      }
      if (op.trackIndex !== undefined) {
        if (op.trackIndex < 0 || op.trackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.trackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot chunk subtitles on locked track #${op.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'add_text') {
      if (op.trackIndex !== undefined) {
        if (op.trackIndex < 0 || op.trackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.trackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot add text onto locked track #${op.trackIndex}`,
          }
        }
      }
      if (op.preset && !getTextPreset(op.preset)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (add_text): Unknown text preset "${op.preset}"`,
        }
      }
      if (op.animation && !getTextAnimation(op.animation)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (add_text): Unknown text animation "${op.animation}"`,
        }
      }
    }
    if (op.op === 'insert_broll') {
      if (op.trackIndex !== undefined) {
        if (op.trackIndex < 0 || op.trackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.trackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot insert B-roll onto locked track #${op.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'apply_text_preset') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_preset): Clip "${op.clipId}" does not exist`,
        }
      }
      if (clip.type !== 'text') {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_preset): Clip "${op.clipId}" is of type "${clip.type}", expected "text"`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_preset): Cannot modify clip on locked track #${clip.trackIndex}`,
        }
      }
      if (!getTextPreset(op.preset)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_preset): Unknown text preset "${op.preset}"`,
        }
      }
    }
    if (op.op === 'apply_text_animation') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_animation): Clip "${op.clipId}" does not exist`,
        }
      }
      if (clip.type !== 'text') {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_animation): Clip "${op.clipId}" is of type "${clip.type}", expected "text"`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_animation): Cannot modify clip on locked track #${clip.trackIndex}`,
        }
      }
      if (!getTextAnimation(op.animation)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (apply_text_animation): Unknown text animation "${op.animation}"`,
        }
      }
    }
    if (op.op === 'add_sticker') {
      if (op.trackIndex !== undefined) {
        if (op.trackIndex < 0 || op.trackIndex >= activeTimeline.tracks.length) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Track index #${op.trackIndex} does not exist in timeline`,
          }
        }
        const track = trackMap.get(op.trackIndex)
        if (track?.locked) {
          return {
            valid: false,
            error: `Operation #${i + 1} (${op.op}): Cannot add sticker onto locked track #${op.trackIndex}`,
          }
        }
      }
    }
    if (op.op === 'set_timeline_dimensions') {
      if (op.timelineId && !state.editorModel.timelines.some(t => t.id === op.timelineId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_timeline_dimensions): Timeline ID "${op.timelineId}" does not exist in project`,
        }
      }
    }
    if (op.op === 'set_timeline_background') {
      if (op.timelineId && !state.editorModel.timelines.some(t => t.id === op.timelineId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_timeline_background): Timeline ID "${op.timelineId}" does not exist in project`,
        }
      }
    }
    if (op.op === 'set_canvas') {
      if (op.timelineId && !state.editorModel.timelines.some(t => t.id === op.timelineId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_canvas): Timeline ID "${op.timelineId}" does not exist in project`,
        }
      }
      if (op.width === undefined && op.height === undefined && op.fps === undefined && op.background === undefined) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_canvas): At least one property (width, height, fps, background) must be specified`,
        }
      }
    }
    if (op.op === 'set_mask') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_mask): Clip ID "${op.clipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'video' && clip.type !== 'image') {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_mask): Cannot apply mask to non-visual clip "${op.clipId}" (type: ${clip.type})`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_mask): Cannot modify clip "${op.clipId}" on locked track #${clip.trackIndex}`,
        }
      }
    }
    if (op.op === 'set_chroma_key') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_chroma_key): Clip ID "${op.clipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'video' && clip.type !== 'image') {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_chroma_key): Cannot apply chroma key to non-visual clip "${op.clipId}" (type: ${clip.type})`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_chroma_key): Cannot modify clip "${op.clipId}" on locked track #${clip.trackIndex}`,
        }
      }
    }
    if (op.op === 'freeze_frame') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (freeze_frame): Clip ID "${op.clipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'video' && clip.type !== 'image') {
        return {
          valid: false,
          error: `Operation #${i + 1} (freeze_frame): Cannot freeze frame on non-video/image clip "${op.clipId}" (type: ${clip.type})`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (freeze_frame): Cannot modify clip "${op.clipId}" on locked track #${clip.trackIndex}`,
        }
      }
      if (op.time !== undefined) {
        if (op.time <= clip.startTime + 0.01 || op.time >= clip.startTime + clip.duration - 0.01) {
          return {
            valid: false,
            error: `Operation #${i + 1} (freeze_frame): Freeze time ${op.time}s is outside clip bounds [${clip.startTime}s, ${clip.startTime + clip.duration}s]`,
          }
        }
      }
    }
    if (op.op === 'punch_in_cut') {
      const clip = clipMap.get(op.clipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_cut): Clip ID "${op.clipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'video' && clip.type !== 'image') {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_cut): Cannot punch-in non-visual clip "${op.clipId}" (type: ${clip.type})`,
        }
      }
      const track = trackMap.get(clip.trackIndex)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_cut): Cannot modify clip "${op.clipId}" on locked track #${clip.trackIndex}`,
        }
      }
      if (op.scale !== undefined && op.scale <= 0) {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_cut): Scale must be positive, got ${op.scale}`,
        }
      }
    }
    if (op.op === 'punch_in_sequence') {
      const targetTrack = op.trackIndex !== undefined ? op.trackIndex : 0
      if (targetTrack < 0 || targetTrack >= activeTimeline.tracks.length) {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_sequence): Track index #${targetTrack} does not exist in timeline`,
        }
      }
      const track = trackMap.get(targetTrack)
      if (track?.locked) {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_sequence): Cannot apply punch-in sequence on locked track #${targetTrack}`,
        }
      }
      if (op.scale !== undefined && op.scale <= 0) {
        return {
          valid: false,
          error: `Operation #${i + 1} (punch_in_sequence): Scale must be positive, got ${op.scale}`,
        }
      }
    }
    if (op.op === 'create_highlight_short') {
      const clip = clipMap.get(op.sourceClipId)
      if (!clip) {
        return {
          valid: false,
          error: `Operation #${i + 1} (create_highlight_short): Source clip ID "${op.sourceClipId}" does not exist in active timeline`,
        }
      }
      if (clip.type !== 'video' && clip.type !== 'audio') {
        return {
          valid: false,
          error: `Operation #${i + 1} (create_highlight_short): Cannot create highlight from clip "${op.sourceClipId}" of type "${clip.type}"`,
        }
      }
      if (op.startTime < clip.startTime - 0.05 || op.endTime > clip.startTime + clip.duration + 0.05) {
        return {
          valid: false,
          error: `Operation #${i + 1} (create_highlight_short): Highlight range [${op.startTime}s, ${op.endTime}s] exceeds clip bounds [${clip.startTime}s, ${clip.startTime + clip.duration}s]`,
        }
      }
    }
    if (op.op === 'duplicate_timeline') {
      const targetId = op.timelineId || activeTimeline.id
      if (!state.editorModel.timelines.some(t => t.id === targetId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (duplicate_timeline): Timeline ID "${targetId}" does not exist in project`,
        }
      }
    }
    if (op.op === 'switch_timeline') {
      if (!state.editorModel.timelines.some(t => t.id === op.timelineId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (switch_timeline): Timeline ID "${op.timelineId}" does not exist in project`,
        }
      }
    }
    if (op.op === 'delete_timeline') {
      if (!state.editorModel.timelines.some(t => t.id === op.timelineId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (delete_timeline): Timeline ID "${op.timelineId}" does not exist in project`,
        }
      }
      if (state.editorModel.timelines.length <= 1) {
        return {
          valid: false,
          error: `Operation #${i + 1} (delete_timeline): Cannot delete the only timeline in the project`,
        }
      }
    }
    if (op.op === 'set_timeline_variant') {
      const targetId = op.timelineId || activeTimeline.id
      if (!state.editorModel.timelines.some(t => t.id === targetId)) {
        return {
          valid: false,
          error: `Operation #${i + 1} (set_timeline_variant): Timeline ID "${targetId}" does not exist in project`,
        }
      }
    }
  }

  return { valid: true, data: patch }
}

// ── 3. Time Formatter Helper ───────────────────────────────────────────────

function formatDurationMmSs(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getV1Duration(state: EditorState): number {
  const activeTimeline = selectActiveTimeline(state)
  if (!activeTimeline) return 0
  const v1TrackIndex = activeTimeline.tracks.findIndex(
    t => t.name === 'V1' || t.id.includes('v1') || (t.kind === 'video' && t.type !== 'subtitle'),
  )
  const targetIndex = v1TrackIndex >= 0 ? v1TrackIndex : 0
  const v1Clips = activeTimeline.clips.filter(c => c.trackIndex === targetIndex)
  return v1Clips.reduce((sum, c) => sum + c.duration, 0)
}

// ── 4. Describe Patch (Pure Function) ──────────────────────────────────────

/**
 * Returns a human-readable semantic diff of the patch intent without modifying state.
 * E.g.: "Xoá 3 đoạn im lặng, tổng 15.0s; V1 rút từ 1:00 còn 0:45"
 */
/**
 * Merge a partial clip patch, one level deep.
 *
 * `updateClip` spreads shallowly, which is right for the UI (callers there pass
 * whole nested objects) but destructive here: an agent patching
 * `textStyle: { text }` replaced the entire style object and wiped font, colour,
 * position and the other 20 fields. Nested plain objects are merged instead.
 */
function mergeClipPatch(
  clip: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  // Auto-normalize text overlay patches: agents frequently pass `text: "..."`
  // directly for a text clip instead of nesting inside `textStyle: { text: "..." }`.
  let effectivePatch = patch
  if (clip.type === 'text' && typeof patch.text === 'string') {
    const patchTextStyle = isPlainObject(patch.textStyle) ? patch.textStyle : {}
    effectivePatch = {
      ...patch,
      textStyle: {
        ...patchTextStyle,
        text: patchTextStyle.text ?? patch.text,
      },
    }
    delete (effectivePatch as Record<string, unknown>).text
  }

  const merged: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(effectivePatch)) {
    const existing = clip[key]
    merged[key] = isPlainObject(value) && isPlainObject(existing)
      ? { ...existing, ...value }
      : value
  }
  return merged
}

export function describePatch(state: EditorState, patch: EditPatch): string {
  const v1DurationBefore = getV1Duration(state)

  // Tally operation details
  let cutRangeCount = 0
  let cutRangeTotalSec = 0
  let deleteClipCount = 0
  let splitCount = 0
  let insertClipCount = 0
  let addSubtitleCount = 0
  let importSrtCount = 0
  let srtCuesTotal = 0
  let addTextCount = 0
  let addSubTrackCount = 0
  let setTransitionCount = 0
  let removeTransitionCount = 0
  let setFilterCount = 0
  let removeFilterCount = 0
  let detachAudioCount = 0
  const keyframeDescriptions: string[] = []
  let removeKeyframeCount = 0
  let clearKeyframeCount = 0
  const filterNamesApplied: string[] = []
  const timelineDimensionChanges: string[] = []
  const maskChanges: string[] = []
  const chromaKeyChanges: string[] = []
  const blendModeChanges: string[] = []
  let applyTextPresetCount = 0
  let applyTextAnimCount = 0
  const textPresetsApplied: string[] = []
  const textAnimsApplied: string[] = []
  let addStickerCount = 0
  const stickerNamesApplied: string[] = []
  let addMarkerCount = 0
  let deleteMarkerCount = 0
  let updateMarkerCount = 0
  let freezeFrameCount = 0
  let insertBrollCount = 0
  let otherCount = 0
  const updatedFields: string[] = []

  for (const op of patch.operations) {
    if (op.op === 'insert_broll') {
      insertBrollCount++
    } else if (op.op === 'cut_range') {
      cutRangeCount++
      cutRangeTotalSec += op.endTime - op.startTime
    } else if (op.op === 'delete_clips') {
      deleteClipCount += op.clipIds.length
    } else if (op.op === 'delete_clip') {
      deleteClipCount++
    } else if (op.op === 'split_clip') {
      splitCount++
    } else if (op.op === 'insert_clip') {
      insertClipCount++
    } else if (op.op === 'add_subtitle') {
      addSubtitleCount++
    } else if (op.op === 'import_srt') {
      importSrtCount++
      try {
        let cues = parseSrt(op.content)
        if (op.chunk) {
          cues = chunkSrtCues(cues, {
            minWords: op.minWords,
            maxWords: op.maxWords,
            maxChars: op.maxChars,
          })
        }
        srtCuesTotal += cues.length
      } catch {
        // best effort
      }
    } else if (op.op === 'chunk_subtitles') {
      otherCount++
      const presetInfo = op.preset ? ` (preset ${op.preset})` : ''
      keyframeDescriptions.push(`chunk subtitles into 3–5 word phrases${presetInfo}`)
    } else if (op.op === 'add_text') {
      addTextCount++
    } else if (op.op === 'apply_text_preset') {
      applyTextPresetCount++
      const def = getTextPreset(op.preset)
      textPresetsApplied.push(def?.name || op.preset)
    } else if (op.op === 'apply_text_animation') {
      applyTextAnimCount++
      const def = getTextAnimation(op.animation)
      textAnimsApplied.push(def?.name || op.animation)
    } else if (op.op === 'add_sticker') {
      addStickerCount++
      const def = getStickerDefinition(op.stickerId)
      stickerNamesApplied.push(def?.name || op.stickerId)
    } else if (op.op === 'add_subtitle_track') {
      addSubTrackCount++
    } else if (op.op === 'set_transition') {
      setTransitionCount++
    } else if (op.op === 'remove_transition') {
      removeTransitionCount++
    } else if (op.op === 'set_filter' || op.op === 'add_filter_clip') {
      setFilterCount++
      const def = getFilterDefinition(op.filterId)
      const name = def ? def.name : op.filterId
      const intensityStr = op.intensity !== undefined ? ` (${Math.round(op.intensity)}%)` : ''
      filterNamesApplied.push(`${name}${intensityStr}`)
    } else if (op.op === 'remove_filter') {
      removeFilterCount++
    } else if (op.op === 'detach_audio') {
      detachAudioCount++
    } else if (op.op === 'set_keyframe') {
      keyframeDescriptions.push(`set keyframe for ${op.property} at ${op.t.toFixed(1)}s`)
    } else if (op.op === 'set_keyframes') {
      const times = op.points.map(p => p.t)
      const tMin = Math.min(...times)
      const tMax = Math.max(...times)
      const rangeStr = tMin === tMax ? `${tMin.toFixed(1)}s` : `${tMin.toFixed(1)}s – ${tMax.toFixed(1)}s`
      keyframeDescriptions.push(`set ${op.points.length} keyframe points for ${op.property} (${rangeStr})`)
    } else if (op.op === 'remove_keyframe') {
      removeKeyframeCount++
    } else if (op.op === 'clear_keyframes') {
      if (op.property) {
        keyframeDescriptions.push(`clear keyframes for ${op.property}`)
      } else {
        clearKeyframeCount++
      }
    } else if (op.op === 'set_audio_fade') {
      const partsFade: string[] = []
      if (op.fadeIn !== undefined && op.fadeIn > 0) partsFade.push(`in ${op.fadeIn.toFixed(1)}s`)
      if (op.fadeOut !== undefined && op.fadeOut > 0) partsFade.push(`out ${op.fadeOut.toFixed(1)}s`)
      if (partsFade.length === 0) {
        keyframeDescriptions.push(`disable audio fade`)
      } else {
        keyframeDescriptions.push(`set audio fade (${partsFade.join(', ')})`)
      }
    } else if (op.op === 'normalize_audio') {
      const deltaDb = op.gainDb !== undefined
        ? op.gainDb
        : op.currentLufs !== undefined
          ? (op.targetLufs ?? -14) - op.currentLufs
          : undefined
      const deltaStr = deltaDb !== undefined ? ` (${deltaDb > 0 ? '+' : ''}${deltaDb.toFixed(1)} dB)` : ''
      keyframeDescriptions.push(`normalize audio clip "${op.clipId}" to ${op.targetLufs ?? -14} LUFS${deltaStr}`)
    } else if (op.op === 'duck_audio') {
      const duckDb = op.duckingDb ?? -12
      keyframeDescriptions.push(`auto-duck music clip "${op.musicClipId}" (${duckDb} dB) against ${op.speechIntervals.length} speech segments`)
    } else if (op.op === 'set_timeline_dimensions') {
      const fpsStr = op.fps ? ` @ ${op.fps}fps` : ''
      timelineDimensionChanges.push(`change dimensions to ${op.width}x${op.height}${fpsStr}`)
    } else if (op.op === 'set_timeline_background') {
      if (op.background.type === 'blur') {
        const blurVal = op.background.blur ?? 40
        timelineDimensionChanges.push(`set timeline blurred background (${blurVal}%)`)
      } else if (op.background.type === 'image') {
        timelineDimensionChanges.push('set timeline background image')
      } else {
        timelineDimensionChanges.push(`set timeline background color to ${op.background.color || '#000000'}`)
      }
    } else if (op.op === 'set_canvas') {
      const canvasParts: string[] = []
      if (op.width !== undefined && op.height !== undefined) {
        const fpsStr = op.fps ? ` @ ${op.fps}fps` : ''
        canvasParts.push(`dimensions ${op.width}x${op.height}${fpsStr}`)
      } else {
        if (op.width !== undefined) canvasParts.push(`width ${op.width}px`)
        if (op.height !== undefined) canvasParts.push(`height ${op.height}px`)
        if (op.fps !== undefined) canvasParts.push(`fps ${op.fps}fps`)
      }
      if (op.background) {
        if (op.background.type === 'blur') {
          const blurVal = op.background.blur ?? 40
          canvasParts.push(`blur background (${blurVal}%)`)
        } else if (op.background.type === 'image') {
          canvasParts.push('image background')
        } else {
          canvasParts.push(`color background ${op.background.color || '#000000'}`)
        }
      }
      timelineDimensionChanges.push(`set canvas (${canvasParts.join(', ')})`)
    } else if (op.op === 'set_mask') {
      if (!op.mask || op.mask.enabled === false) {
        maskChanges.push(`remove mask for clip "${op.clipId}"`)
      } else {
        const shapeName = op.mask.shape === 'rectangle' ? 'rectangle' : (op.mask.shape === 'ellipse' ? 'ellipse' : 'linear')
        const featherStr = op.mask.feather ? `, feather ${op.mask.feather}%` : ''
        const invertStr = op.mask.invert ? ', inverted' : ''
        maskChanges.push(`set mask shape ${shapeName} (${op.mask.width}%x${op.mask.height}%${featherStr}${invertStr}) for clip "${op.clipId}"`)
      }
    } else if (op.op === 'set_chroma_key') {
      if (!op.chromaKey || op.chromaKey.enabled === false) {
        chromaKeyChanges.push(`remove chroma key for clip "${op.clipId}"`)
      } else {
        const { color = '#00FF00', similarity = 30, smoothness = 10, spill = 10 } = op.chromaKey
        chromaKeyChanges.push(`chroma key color ${color} (similarity ${similarity}%, smoothness ${smoothness}%, spill ${spill}%) for clip "${op.clipId}"`)
      }
    } else if (op.op === 'set_blend_mode') {
      blendModeChanges.push(`set blend mode ${op.blendMode} for clip "${op.clipId}"`)
    } else if (op.op === 'update_clip') {
      // Name the fields: 'a clip changed' tells the reviewer nothing about what.
      for (const field of Object.keys(op.patch || {})) {
        if (!updatedFields.includes(field)) updatedFields.push(field)
      }
    } else if (op.op === 'add_marker') {
      addMarkerCount++
    } else if (op.op === 'delete_marker') {
      deleteMarkerCount++
    } else if (op.op === 'update_marker') {
      updateMarkerCount++
    } else if (op.op === 'freeze_frame') {
      freezeFrameCount++
    } else if (op.op === 'punch_in_cut') {
      const scaleStr = op.scale ? `${op.scale}%` : '115%'
      keyframeDescriptions.push(`punch-in (${scaleStr}) clip "${op.clipId}"`)
    } else if (op.op === 'punch_in_sequence') {
      const scaleStr = op.scale ? `${op.scale}%` : '115%'
      keyframeDescriptions.push(`alternating punch-in 100% ↔ ${scaleStr} on track #${op.trackIndex ?? 0}`)
    } else if (op.op === 'create_highlight_short') {
      const dur = (op.endTime - op.startTime).toFixed(1)
      const hookMsg = op.hookText ? ` with hook "${op.hookText}"` : ''
      keyframeDescriptions.push(`create 9:16 Short (${dur}s)${hookMsg}`)
    } else if (op.op === 'duplicate_timeline') {
      const nameMsg = op.name ? ` "${op.name}"` : ''
      const tagMsg = op.variantTag ? ` [${op.variantTag}]` : ''
      keyframeDescriptions.push(`duplicate timeline variant${nameMsg}${tagMsg}`)
    } else if (op.op === 'switch_timeline') {
      keyframeDescriptions.push(`switch to timeline "${op.timelineId}"`)
    } else if (op.op === 'delete_timeline') {
      keyframeDescriptions.push(`delete timeline "${op.timelineId}"`)
    } else if (op.op === 'set_timeline_variant') {
      const tagMsg = op.variantTag ? ` tag="${op.variantTag}"` : ''
      const nameMsg = op.name ? ` name="${op.name}"` : ''
      keyframeDescriptions.push(`update variant info${nameMsg}${tagMsg}`)
    } else {
      otherCount++
    }
  }

  // Calculate simulated V1 duration
  // If patch is applied on a clone, calculate exact result
  let simulatedState = state
  try {
    const simResult = executePatchOperations(simulatedState, patch.operations)
    simulatedState = simResult
  } catch {
    // Fallback if simulation encounters error
  }

  const v1DurationAfter = getV1Duration(simulatedState)
  const durationDiff = v1DurationBefore - v1DurationAfter

  const parts: string[] = []

  if (patch.description) {
    parts.push(patch.description)
  }

  if (cutRangeCount > 0) {
    parts.push(`cut ${cutRangeCount} ranges (${cutRangeTotalSec.toFixed(1)}s)`)
  }
  if (deleteClipCount > 0) {
    parts.push(`delete ${deleteClipCount} clips`)
  }
  if (splitCount > 0) {
    parts.push(`split ${splitCount} points`)
  }
  if (insertClipCount > 0) {
    parts.push(`insert ${insertClipCount} clips`)
  }
  if (addSubtitleCount > 0) {
    parts.push(`add ${addSubtitleCount} subtitles`)
  }
  if (importSrtCount > 0) {
    parts.push(`import ${srtCuesTotal > 0 ? srtCuesTotal : importSrtCount} subtitles from SRT`)
  }
  if (addTextCount > 0) {
    parts.push(`add ${addTextCount} text clips`)
  }
  if (applyTextPresetCount > 0) {
    parts.push(`apply ${applyTextPresetCount} text presets (${textPresetsApplied.join(', ')})`)
  }
  if (applyTextAnimCount > 0) {
    parts.push(`apply ${applyTextAnimCount} text animations (${textAnimsApplied.join(', ')})`)
  }
  if (addStickerCount > 0) {
    const list = stickerNamesApplied.slice(0, 3).join(', ')
    const more = stickerNamesApplied.length > 3 ? ` and ${stickerNamesApplied.length - 3} more` : ''
    parts.push(`add ${addStickerCount} stickers (${list}${more})`)
  }
  if (setTransitionCount > 0) {
    parts.push(`set ${setTransitionCount} transitions`)
  }
  if (removeTransitionCount > 0) {
    parts.push(`remove ${removeTransitionCount} transitions`)
  }
  if (addSubTrackCount > 0) {
    parts.push(`add ${addSubTrackCount} subtitle tracks`)
  }
  if (setFilterCount > 0) {
    if (filterNamesApplied.length === 1) {
      parts.push(`apply filter ${filterNamesApplied[0]}`)
    } else {
      parts.push(`apply ${setFilterCount} filters (${filterNamesApplied.join(', ')})`)
    }
  }
  if (removeFilterCount > 0) {
    parts.push(`remove ${removeFilterCount} filters`)
  }
  if (detachAudioCount > 0) {
    parts.push(`detach audio from ${detachAudioCount} clips`)
  }
  if (keyframeDescriptions.length > 0) {
    parts.push(keyframeDescriptions.join(', '))
  }
  if (removeKeyframeCount > 0) {
    parts.push(`remove ${removeKeyframeCount} keyframes`)
  }
  if (clearKeyframeCount > 0) {
    parts.push(`clear all keyframes (${clearKeyframeCount} clips)`)
  }
  if (updatedFields.length > 0) {
    parts.push(`update ${updatedFields.join(', ')} of clip`)
  }
  if (timelineDimensionChanges.length > 0) {
    parts.push(timelineDimensionChanges.join(', '))
  }
  if (maskChanges.length > 0) {
    parts.push(maskChanges.join(', '))
  }
  if (chromaKeyChanges.length > 0) {
    parts.push(chromaKeyChanges.join(', '))
  }
  if (blendModeChanges.length > 0) {
    parts.push(blendModeChanges.join(', '))
  }
  if (addMarkerCount > 0) {
    parts.push(`add ${addMarkerCount} markers`)
  }
  if (deleteMarkerCount > 0) {
    parts.push(`delete ${deleteMarkerCount} markers`)
  }
  if (updateMarkerCount > 0) {
    parts.push(`update ${updateMarkerCount} markers`)
  }
  if (freezeFrameCount > 0) {
    parts.push(`freeze ${freezeFrameCount} frames`)
  }
  if (insertBrollCount > 0) {
    parts.push(`insert ${insertBrollCount} B-roll clips`)
  }
  if (otherCount > 0) {
    parts.push(`${otherCount} other operations`)
  }

  const summary = parts.length > 0 ? parts.join(', ') : `${patch.operations.length} operations`

  let v1Transition = `V1: ${formatDurationMmSs(v1DurationBefore)}`
  if (durationDiff > 0.05) {
    v1Transition = `V1 shortened from ${formatDurationMmSs(v1DurationBefore)} to ${formatDurationMmSs(v1DurationAfter)} (-${durationDiff.toFixed(1)}s)`
  } else if (durationDiff < -0.05) {
    v1Transition = `V1 lengthened from ${formatDurationMmSs(v1DurationBefore)} to ${formatDurationMmSs(v1DurationAfter)} (+${Math.abs(durationDiff).toFixed(1)}s)`
  }

  return `${summary}; ${v1Transition}`
}

// ── 5. Internal Patch Execution ────────────────────────────────────────────

function applyCutRange(state: EditorState, startTime: number, endTime: number): EditorState {
  const clips = selectClips(state)
  // Find clips overlapping [startTime, endTime]
  const overlapping = clips.filter(c => c.startTime < endTime && c.startTime + c.duration > startTime)
  if (overlapping.length === 0) return state

  let current = state

  // Step 1: Split at endTime first (downstream)
  const splitAtEnd = overlapping.filter(
    c => c.startTime < endTime && c.startTime + c.duration > endTime,
  )
  for (const c of splitAtEnd) {
    current = splitClipsAtTime(current, [c.id], endTime)
  }

  // Step 2: Split at startTime (upstream)
  const clipsAfterEndSplit = selectClips(current)
  const splitAtStart = clipsAfterEndSplit.filter(
    c => c.startTime < startTime && c.startTime + c.duration > startTime,
  )
  for (const c of splitAtStart) {
    current = splitClipsAtTime(current, [c.id], startTime)
  }

  // Step 3: Delete clips fully within [startTime, endTime]
  const clipsAfterSplits = selectClips(current)
  const clipsToDelete = clipsAfterSplits.filter(
    c => c.startTime >= startTime - 0.01 && c.startTime + c.duration <= endTime + 0.01,
  )

  if (clipsToDelete.length > 0) {
    current = deleteClips(current, clipsToDelete.map(c => c.id))
  }

  return current
}

function executePatchOperations(state: EditorState, operations: EditPatchOperation[]): EditorState {
  let current = state

  const cutOps = operations.filter((op): op is Extract<EditPatchOperation, { op: 'cut_range' }> => op.op === 'cut_range')
  const nonCutOps = operations.filter(op => op.op !== 'cut_range')

  // 1. Execute cut ranges descending by startTime to avoid timestamp shifts in upstream cuts
  const sortedCutOps = [...cutOps].sort((a, b) => b.startTime - a.startTime)
  for (const cutOp of sortedCutOps) {
    current = applyCutRange(current, cutOp.startTime, cutOp.endTime)
  }

  // 2. Execute non-cut operations in sequence
  for (const op of nonCutOps) {
    switch (op.op) {
      case 'split_clip':
        current = splitClipsAtTime(current, [op.clipId], op.splitTime)
        break
      case 'delete_clips':
        current = deleteClips(current, op.clipIds)
        break
      case 'delete_clip':
        current = deleteClips(current, [op.clipId])
        break
      case 'move_clip':
        current = moveClips(current, { clipIds: [op.clipId], deltaTime: op.deltaTime })
        break
      case 'slip_clip':
        current = slipClip(current, { clipId: op.clipId, deltaTime: op.delta })
        break
      case 'slide_clip':
        current = slideClip(current, { clipId: op.clipId, deltaTime: op.delta })
        break
      case 'update_clip': {
        const timeline = selectActiveTimeline(current)
        const target = timeline?.clips.find(clip => clip.id === op.clipId)
        if (!target) {
          throw new Error(`Clip "${op.clipId}" không tồn tại trên timeline`)
        }
        const merged = mergeClipPatch(target as unknown as Record<string, unknown>, op.patch)
        current = updateClip(current, op.clipId, merged as never)
        break
      }
      case 'insert_clip': {
        const baseAsset = current.editorModel.assets.find(a => a.id === op.assetId)
        if (!baseAsset) {
          throw new Error(`Asset ID "${op.assetId}" does not exist in project assets`)
        }
        const assetToInsert = op.duration !== undefined ? { ...baseAsset, duration: op.duration } : baseAsset
        current = insertAssetsToTimeline(current, {
          assets: [assetToInsert],
          trackIndex: op.trackIndex,
          startTime: op.startTime,
        })
        break
      }
      case 'add_subtitle': {
        const activeTl = current.editorModel.timelines.find(t => t.id === current.editorModel.activeTimelineId)
        let subTrackIdx = op.trackIndex
        if (subTrackIdx === undefined) {
          const found = activeTl?.tracks.findIndex(t => t.type === 'subtitle') ?? -1
          subTrackIdx = found >= 0 ? found : 0
        }
        let styleOverride = op.style as any
        if (op.preset) {
          styleOverride = applySubtitlePreset(styleOverride, op.preset)
        }
        current = addSubtitle(current, {
          text: op.text,
          startTime: op.startTime,
          endTime: op.endTime,
          trackIndex: subTrackIdx,
          style: styleOverride,
        })
        break
      }
      case 'import_srt': {
        let cues = parseSrt(op.content)
        if (op.chunk) {
          cues = chunkSrtCues(cues, {
            minWords: op.minWords,
            maxWords: op.maxWords,
            maxChars: op.maxChars,
          })
        }
        let styleOverride: any
        if (op.preset) {
          styleOverride = applySubtitlePreset({}, op.preset)
        }
        current = importSrtCues(current, cues, {
          targetTrackIndex: op.targetTrackIndex,
          style: styleOverride,
        })
        break
      }
      case 'chunk_subtitles': {
        const activeTl = current.editorModel.timelines.find(t => t.id === current.editorModel.activeTimelineId)
        if (!activeTl) break
        const existingSubs = activeTl.subtitles || []
        if (existingSubs.length === 0) break

        let targetTrackIdx = op.trackIndex
        if (targetTrackIdx === undefined) {
          const found = activeTl.tracks.findIndex(t => t.type === 'subtitle')
          targetTrackIdx = found >= 0 ? found : (existingSubs.length > 0 ? existingSubs[0].trackIndex : 0)
        }

        const subsOnTrack = existingSubs.filter(s => s.trackIndex === targetTrackIdx)
        if (subsOnTrack.length === 0) break

        const srtCues: SrtCue[] = subsOnTrack.map((s, idx) => ({
          index: idx + 1,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text,
        }))

        const chunked = chunkSrtCues(srtCues, {
          minWords: op.minWords,
          maxWords: op.maxWords,
          maxChars: op.maxChars,
        })

        let styleOverride: any
        if (op.preset) {
          styleOverride = applySubtitlePreset({}, op.preset)
        }

        current = importSrtCues(current, chunked, {
          targetTrackIndex: targetTrackIdx,
          style: styleOverride,
        })
        break
      }
      case 'add_text': {
        current = addTextClip(current, {
          style: {
            text: op.text,
            ...(op.style as any || {}),
          },
          startTime: op.startTime,
          trackIndex: op.trackIndex,
          preset: op.preset,
          animation: op.animation,
        })
        break
      }
      case 'apply_text_preset': {
        current = applyTextPresetToClip(current, op.clipId, op.preset)
        break
      }
      case 'apply_text_animation': {
        current = applyTextAnimationToClip(current, op.clipId, op.animation)
        break
      }
      case 'add_sticker': {
        current = addStickerClip(current, {
          stickerId: op.stickerId,
          startTime: op.startTime,
          duration: op.duration,
          trackIndex: op.trackIndex,
          scale: op.scale,
          positionX: op.positionX,
          positionY: op.positionY,
          rotation: op.rotation,
          opacity: op.opacity,
        })
        break
      }
      case 'set_transition': {
        const timeline = selectActiveTimeline(current)
        if (!timeline) break
        const result = setTransitionAtCut(
          timeline,
          op.leftClipId,
          op.rightClipId,
          op.type,
          op.duration ?? DEFAULT_TRANSITION_DURATION,
          () => makeId('transition'),
        )
        // Validation already rejected the impossible cases; anything left is a
        // race with an earlier operation in the same patch, and skipping beats
        // writing a half-applied overlap.
        if (result.ok) current = replaceActiveTimeline(current, () => result.timeline)
        break
      }
      case 'remove_transition': {
        const timeline = selectActiveTimeline(current)
        if (!timeline) break
        const existing = findTransitionAtCut(timeline, op.leftClipId, op.rightClipId)
        if (existing) {
          current = replaceActiveTimeline(current, current => removeTransitionById(current, existing.id))
        }
        break
      }
      case 'add_subtitle_track': {
        current = addSubtitleTrack(current)
        break
      }
      case 'set_filter': {
        current = setClipFilter(current, op.clipId, op.filterId, op.intensity)
        break
      }
      case 'remove_filter': {
        current = removeClipFilter(current, op.clipId)
        break
      }
      case 'add_filter_clip': {
        current = addFilterClip(current, {
          filterId: op.filterId,
          intensity: op.intensity,
          startTime: op.startTime,
          duration: op.duration,
          trackIndex: op.trackIndex,
        })
        break
      }
      case 'detach_audio': {
        current = detachAudio(current, op.clipId)
        break
      }
      case 'set_keyframe': {
        current = setKeyframe(current, op.clipId, op.property, op.t, op.value, op.easing)
        break
      }
      case 'set_keyframes': {
        const points = op.points.map(p => ({
          t: p.t,
          value: p.value,
          easing: p.easing ?? 'linear',
        }))
        current = setKeyframePoints(current, op.clipId, op.property, points)
        break
      }
      case 'remove_keyframe': {
        current = removeKeyframeAt(current, op.clipId, op.property, op.t)
        break
      }
      case 'clear_keyframes': {
        current = clearKeyframes(current, op.clipId, op.property)
        break
      }
      case 'set_audio_fade': {
        current = setAudioFade(current, op.clipId, op.fadeIn, op.fadeOut)
        break
      }
      case 'normalize_audio': {
        current = normalizeClipAudio(current, op.clipId, op.targetLufs, op.currentLufs, op.gainDb)
        break
      }
      case 'duck_audio': {
        current = duckClipAudio(current, op.musicClipId, op.speechIntervals, {
          duckingDb: op.duckingDb,
          attack: op.attack,
          release: op.release,
        })
        break
      }
      case 'set_timeline_dimensions': {
        const targetTimelineId = op.timelineId || current.editorModel.activeTimelineId
        if (targetTimelineId) {
          current = setTimelineSettings(current, targetTimelineId, {
            width: op.width,
            height: op.height,
            fps: op.fps,
          })
        }
        break
      }
      case 'set_timeline_background': {
        const targetTimelineId = op.timelineId || current.editorModel.activeTimelineId
        if (targetTimelineId) {
          current = setTimelineBackground(current, targetTimelineId, op.background)
        }
        break
      }
      case 'set_canvas': {
        const targetTimelineId = op.timelineId || current.editorModel.activeTimelineId
        if (targetTimelineId) {
          current = setTimelineSettings(current, targetTimelineId, {
            width: op.width,
            height: op.height,
            fps: op.fps,
            background: op.background,
          })
        }
        break
      }
      case 'set_mask': {
        current = setClipMask(current, op.clipId, op.mask ?? null)
        break
      }
      case 'set_chroma_key': {
        current = setClipChromaKey(current, op.clipId, op.chromaKey ?? null)
        break
      }
      case 'set_blend_mode': {
        current = setClipBlendMode(current, op.clipId, op.blendMode)
        break
      }
      case 'add_marker': {
        current = addMarker(current, {
          time: op.time,
          label: op.label,
          color: op.color,
          id: op.id,
        })
        break
      }
      case 'delete_marker': {
        current = deleteMarker(current, op.markerId)
        break
      }
      case 'update_marker': {
        current = updateMarker(current, op.markerId, {
          ...(op.time !== undefined ? { time: op.time } : {}),
          ...(op.label !== undefined ? { label: op.label } : {}),
          ...(op.color !== undefined ? { color: op.color } : {}),
        })
        break
      }
      case 'freeze_frame': {
        const timeline = selectActiveTimeline(current)
        const targetClip = timeline?.clips.find(c => c.id === op.clipId)
        if (!targetClip) {
          throw new Error(`Clip "${op.clipId}" không tồn tại trên timeline`)
        }

        let asset = current.editorModel.assets.find(a => a.id === op.imageAssetId)
        if (!asset && op.imagePath) {
          asset = current.editorModel.assets.find(a => a.path === op.imagePath)
        }
        if (!asset) {
          // Create or mock image asset for freeze frame
          const assetId = op.imageAssetId || makeId('asset')
          const assetPath = op.imagePath || targetClip.asset?.path || `freeze_${targetClip.id}.jpg`
          asset = {
            id: assetId,
            type: 'image',
            path: assetPath,
            prompt: `Freeze frame of clip ${targetClip.id}`,
            resolution: targetClip.asset?.resolution || '1920x1080',
            duration: op.duration ?? 2.0,
            createdAt: Date.now(),
          }
        }

        current = freezeFrame(current, {
          clipId: op.clipId,
          time: op.time,
          duration: op.duration ?? 2.0,
          imageAsset: asset,
        })
        break
      }
      case 'punch_in_cut': {
        current = punchInClip(current, op.clipId, {
          scale: op.scale,
          positionX: op.positionX,
          positionY: op.positionY,
        })
        break
      }
      case 'punch_in_sequence': {
        current = punchInSequence(current, {
          trackIndex: op.trackIndex,
          scale: op.scale,
          startWithZoom: op.startWithZoom,
        })
        break
      }
      case 'create_highlight_short': {
        current = createHighlightShort(current, {
          sourceClipId: op.sourceClipId,
          startTime: op.startTime,
          endTime: op.endTime,
          hookText: op.hookText,
          hookPreset: op.hookPreset,
          hookDuration: op.hookDuration,
          targetDimensions: op.targetDimensions,
        })
        break
      }
      case 'insert_broll': {
        current = insertBrollClip(current, {
          assetId: op.assetId,
          assetPath: op.assetPath,
          startTime: op.startTime,
          duration: op.duration,
          trackIndex: op.trackIndex,
          fadeIn: op.fadeIn,
          fadeOut: op.fadeOut,
          muteAudio: op.muteAudio,
        })
        break
      }
      case 'duplicate_timeline': {
        const targetId = op.timelineId || current.editorModel.activeTimelineId || current.editorModel.timelines[0]?.id
        if (targetId) {
          current = duplicateTimeline(current, targetId, op.name, op.variantTag)
        }
        break
      }
      case 'switch_timeline': {
        current = switchActiveTimeline(current, op.timelineId)
        break
      }
      case 'delete_timeline': {
        current = deleteTimeline(current, op.timelineId)
        break
      }
      case 'set_timeline_variant': {
        const targetId = op.timelineId || current.editorModel.activeTimelineId || current.editorModel.timelines[0]?.id
        if (targetId) {
          current = setTimelineVariantInfo(current, targetId, {
            name: op.name,
            variantTag: op.variantTag,
            description: op.description,
          })
        }
        break
      }
    }
  }
  return current
}

// ── 6. Apply Patch (Transactional) ─────────────────────────────────────────

/**
 * Applies an EditPatch to the EditorState inside an atomic transaction.
 *
 * If the patch is invalid or execution fails validation, state remains unchanged
 * and an error is returned.
 * If successful, exactly ONE undo step is created.
 */
export function applyPatch(state: EditorState, rawPatch: unknown): PatchApplyResult {
  const validation = validateEditPatch(state, rawPatch)
  if (!validation.valid) {
    return {
      success: false,
      state,
      error: validation.error,
    }
  }

  const patch = validation.data
  const description = describePatch(state, patch)

  // Begin transaction
  const tx = beginTransaction(state)

  try {
    const modifiedTx = executePatchOperations(tx, patch.operations)
    const commitResult = commitTransaction(modifiedTx)

    if (!commitResult.success) {
      return {
        success: false,
        state: commitResult.state,
        error: commitResult.error,
        validationErrors: commitResult.validationErrors,
      }
    }

    return {
      success: true,
      state: commitResult.state,
      description,
      appliedCount: patch.operations.length,
    }
  } catch (err) {
    return {
      success: false,
      state,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Applies an EditPatch directly to EditorState and returns the updated state.
 * Throws an Error if the patch is invalid or violates timeline invariants.
 */
export function applyEditPatchToState(state: EditorState, patch: EditPatch): EditorState {
  const result = applyPatch(state, patch)
  if (!result.success) {
    throw new Error(result.error || 'Failed to apply edit patch')
  }
  return result.state
}

// ── 7. Ambiguity & Instruction Intent Evaluation ────────────────────────────

export interface InstructionEvaluation {
  action: 'proceed' | 'clarify'
  reason?: string
  clarificationQuestion?: string
}

/**
 * Evaluates whether an editing instruction is actionable or ambiguously vague
 * (e.g. "làm cho nó hay hơn", "make it better").
 *
 * Enforces the core agent principle: "Không đoán thay người dùng. Ticket nào mơ hồ thì hỏi, đừng tự chọn."
 */
export function evaluateEditingInstruction(instruction: string): InstructionEvaluation {
  const trimmed = instruction.trim().toLowerCase()
  if (!trimmed) {
    return {
      action: 'clarify',
      reason: 'EMPTY_INSTRUCTION',
      clarificationQuestion: 'Vui lòng cung cấp yêu cầu chỉnh sửa cụ thể.',
    }
  }

  // Detect purely qualitative or subjective requests without concrete parameters
  const vaguePatterns = [
    /^(làm\s+(cho\s+)?nó\s+)?(hay|đẹp|tốt|xịn|mượt|chuyên nghiệp)\s+hơn/i,
    /^(hãy\s+)?chỉnh\s+sửa\s+giùm(\s+tôi)?$/i,
    /^(make\s+it\s+)?(better|nicer|cooler|prettier|awesome|pop|cleaner)$/i,
    /^edit\s+(this|video)(\s+please)?$/i,
    /^cắt\s+bớt(\s+đi)?$/i,
  ]

  for (const pattern of vaguePatterns) {
    if (pattern.test(trimmed)) {
      return {
        action: 'clarify',
        reason: 'AMBIGUOUS_OR_SUBJECTIVE',
        clarificationQuestion:
          'Yêu cầu chưa rõ ràng: Bạn muốn thực hiện thao tác nào? (Ví dụ: cắt khoảng lặng, ghép thêm clip, hay nhập phụ đề từ SRT?)',
      }
    }
  }

  return { action: 'proceed' }
}
