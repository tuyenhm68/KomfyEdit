import type { Project, Timeline, TimelineClip, Track } from './project-model'
import type { EditorModel } from './editor-state'
import { DEFAULT_TRACKS } from './project-model'
import { migrateClip, migrateTracks, mainVideoTrackIndex, packMainVideoTrack, pruneEmptyTracks } from './video-editor-utils'
import { pruneOrphanTransitions } from './timeline-transitions'

/**
 * Pull back clips whose `trackIndex` points at a track that is not there.
 *
 * Nothing should produce one, but a project saved while a track write was lost
 * carries clips that render nowhere and look deleted. Re-home them on a real
 * track rather than leaving them invisible.
 */
function reattachOrphanClips(tracks: Track[], clips: TimelineClip[]): TimelineClip[] {
  const mainVideo = mainVideoTrackIndex(tracks)
  const firstAudio = tracks.findIndex(track => track.kind === 'audio')
  let changed = false
  const next = clips.map(clip => {
    if (tracks[clip.trackIndex]) return clip
    const fallback = clip.type === 'audio' && firstAudio >= 0 ? firstAudio : mainVideo
    if (fallback < 0) return clip
    changed = true
    return { ...clip, trackIndex: fallback }
  })
  return changed ? next : clips
}

function normalizeTimeline(timeline: Timeline): Timeline {
  let sourceTracks = timeline.tracks.length > 0
    ? timeline.tracks
    : DEFAULT_TRACKS.map(track => ({ ...track }))

  // Video track 1 (V1) is mandatory and must always exist
  const hasVideoTrack = sourceTracks.some(t => t.kind === 'video' && t.type !== 'subtitle')
  if (!hasVideoTrack) {
    sourceTracks = [
      { id: 'track-v1', name: 'V1', muted: false, locked: false, sourcePatched: true, kind: 'video' },
      ...sourceTracks,
    ]
  }

  const tracks = migrateTracks(sourceTracks)
  // Drop transitions that describe an overlap the clips no longer have, so a
  // project damaged by an older build heals when it is opened instead of
  // carrying a dead record for the rest of its life. Pruning after the pack,
  // because the pack is what puts the V1 overlaps back.
  const packedClips = packMainVideoTrack(tracks, reattachOrphanClips(tracks, timeline.clips.map(migrateClip)), timeline.transitions ?? [])
  // Opening a project is where a trail of empty rows gets cleaned up: an
  // overlay that was cleared, a spare audio row, a sticker row whose sticker
  // is gone. Only the first video track and the subtitle rows are kept.
  const withTrailing = pruneEmptyTracks(tracks, packedClips, timeline.subtitles || [])

  return pruneOrphanTransitions({
    ...timeline,
    tracks: withTrailing.tracks,
    clips: withTrailing.clips,
    subtitles: withTrailing.subtitles,
    markers: timeline.markers || [],
  })
}

export function getEditorModel(project: Project): EditorModel {
  const timelines = project.timelines.map(normalizeTimeline)
  return {
    assets: project.assets,
    bins: project.bins,
    timelines,
    activeTimelineId: project.activeTimelineId ?? timelines[0]?.id ?? null,
  }
}

export function updatedProject(fromProject: Project, editorModel: EditorModel): Project {
  return {
    ...fromProject,
    assets: editorModel.assets,
    bins: editorModel.bins,
    timelines: editorModel.timelines,
    activeTimelineId: editorModel.activeTimelineId ?? editorModel.timelines[0]?.id,
    updatedAt: Date.now(),
  }
}
