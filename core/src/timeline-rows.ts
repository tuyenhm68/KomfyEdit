/**
 * Which track row a pointer is over, during a drag.
 *
 * The drag used to derive this from `Math.round(deltaY / averageTrackHeight)`.
 * Rows are not all the same height — a subtitle row is half a video row — so
 * the average matches no row in particular: the further you drag, the further
 * the computed row drifts from the one under the cursor, and near a boundary
 * the rounding flips back and forth on a pixel of mouse noise. That is the
 * clip visibly jumping up and down mid-drag.
 *
 * Hit-testing the real boxes fixes the drift; the hysteresis fixes the flicker.
 */

export interface TimelineRowBox {
  /** Top of the row in track-container content coordinates. */
  top: number
  height: number
}

/**
 * The row containing `y`, in display order.
 *
 * Above the first row and below the last one it keeps counting in whole rows —
 * negative above the top, past the end below the bottom — because the drag
 * reads "one row above the topmost video track" as a request for a new track.
 */
export function rowIndexAtY(rows: TimelineRowBox[], y: number): number {
  if (rows.length === 0) return 0

  const first = rows[0]
  if (y < first.top) {
    return -Math.ceil((first.top - y) / Math.max(1, first.height))
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (y >= row.top && y < row.top + row.height) return i
  }

  const last = rows[rows.length - 1]
  const lastBottom = last.top + last.height
  return rows.length - 1 + Math.ceil((y - lastBottom + 1) / Math.max(1, last.height))
}

/**
 * The same, but sticky: while the pointer is within `hysteresis` pixels of the
 * row it already picked, that row wins. Without it a pointer resting on a
 * boundary retargets on every jitter of the mouse, and the clip flickers
 * between two tracks.
 */
export function stableRowIndexAtY(
  rows: TimelineRowBox[],
  y: number,
  previous: number | null,
  hysteresis = 6,
): number {
  const raw = rowIndexAtY(rows, y)
  if (previous === null || raw === previous) return raw
  // Only rows that actually exist have a box to stick to; an extrapolated row
  // above or below the stack has nothing to hold on to.
  const box = rows[previous]
  if (!box) return raw
  if (y >= box.top - hysteresis && y < box.top + box.height + hysteresis) return previous
  return raw
}

/** Row heights the timeline draws with, one per kind of track. */
export interface TimelineRowHeights {
  video: number
  audio: number
  subtitle: number
  sticker: number
}

/**
 * How tall a track's row is.
 *
 * Sticker rows are deliberately shorter: they carry a small overlay, not
 * footage, so giving them a full video row wastes vertical space in a timeline
 * that often has several of them.
 *
 * One function rather than the ternary repeated at every call site — the
 * heights are read in four places, and a new kind used to mean finding all
 * four.
 */
export function trackRowHeight(
  track: { kind?: string; type?: string } | undefined,
  heights: TimelineRowHeights,
): number {
  if (!track) return heights.video
  if (track.type === 'subtitle') return heights.subtitle
  if (track.kind === 'audio') return heights.audio
  if (track.kind === 'sticker') return heights.sticker
  return heights.video
}
