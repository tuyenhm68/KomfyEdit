import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useEditorActions, useEditorStore } from './editor-store'
import { selectLastRejectedEdit } from './editor-selectors'

/**
 * Says why an edit was refused.
 *
 * The timeline validator turns down changes that would break an invariant, and
 * the editor then keeps the old state. Without this the control just appeared
 * dead: dragging the speed slider on a clip with another clip after it on the
 * main track did nothing at all, with no clue as to why.
 */

/**
 * Plain wording for the rules a user can actually run into. Anything else falls
 * back to the validator's own message, which is precise if technical — better
 * than silence.
 */
const FRIENDLY_MESSAGE: Record<string, string> = {
  V1_NOT_SEAMLESS:
    'Clips on the main track sit end to end. This change would have left a gap or an overlap.',
  LOCKED_TRACK_MODIFIED:
    'That track is locked. Unlock it to change what is on it.',
  CLIP_INVALID_TRACK:
    'That clip points at a track which is not there any more.',
  SUBTITLE_INVALID_TRACK:
    'That subtitle points at a track which is not there any more.',
  INVALID_TIMING:
    'The start time or duration of that clip is not a usable number.',
}

const DISMISS_AFTER_MS = 6000

export function RejectedEditNotice() {
  const rejected = useEditorStore(selectLastRejectedEdit)
  const { clearRejectedEdit } = useEditorActions()

  useEffect(() => {
    if (!rejected) return
    const timer = setTimeout(() => clearRejectedEdit(), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [rejected, clearRejectedEdit])

  if (!rejected) return null

  return (
    <div
      role="status"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-start gap-2.5 max-w-md px-3.5 py-2.5 rounded-lg bg-zinc-900/95 border border-amber-500/40 shadow-lg backdrop-blur-sm"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs text-white leading-snug">
          {FRIENDLY_MESSAGE[rejected.rule] ?? rejected.message}
        </p>
        <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">{rejected.rule}</p>
      </div>
      <button
        type="button"
        onClick={() => clearRejectedEdit()}
        className="flex-shrink-0 text-zinc-500 hover:text-white transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
