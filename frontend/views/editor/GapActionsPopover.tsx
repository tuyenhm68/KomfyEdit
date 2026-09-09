import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronsLeftRight, X } from 'lucide-react'
import { useTranslation } from '../../i18n/I18nContext'

export interface GapActionsPopoverProps {
  selectedGap: { trackIndex: number; startTime: number; endTime: number }
  /** Screen-space anchor of the gap block, or null before it has been measured. */
  anchorPosition: { x: number; gapTop: number; gapBottom: number } | null
  onCloseGap: () => void
  onDismiss: () => void
}

const POPOVER_MARGIN = 8

/**
 * Small popover shown when an empty span between clips is selected. Offers the
 * ripple-style "Close Gap" edit and nothing else.
 */
export function GapActionsPopover({ selectedGap, anchorPosition, onCloseGap, onDismiss }: GapActionsPopoverProps) {
  const { t } = useTranslation()
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const element = popoverRef.current
    if (!element || !anchorPosition) {
      setPosition(null)
      return
    }

    const rect = element.getBoundingClientRect()
    const left = Math.min(
      Math.max(POPOVER_MARGIN, anchorPosition.x - rect.width / 2),
      window.innerWidth - rect.width - POPOVER_MARGIN,
    )
    // Prefer below the gap; flip above when there is not enough room.
    const below = anchorPosition.gapBottom + POPOVER_MARGIN
    const top = below + rect.height > window.innerHeight - POPOVER_MARGIN
      ? Math.max(POPOVER_MARGIN, anchorPosition.gapTop - rect.height - POPOVER_MARGIN)
      : below

    setPosition({ left, top })
  }, [anchorPosition])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  if (!anchorPosition) return null

  const gapDuration = selectedGap.endTime - selectedGap.startTime

  return (
    <div
      ref={popoverRef}
      className="fixed z-[70] flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 shadow-2xl"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        visibility: position ? 'visible' : 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-[10px] tabular-nums text-zinc-400">{t('timeline.gapDuration', { duration: gapDuration.toFixed(2) })}</span>
      <button
        onClick={onCloseGap}
        className="flex items-center gap-1.5 rounded-lg bg-blue-600/20 px-2 py-1 text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-600/40"
      >
        <ChevronsLeftRight className="h-3 w-3" />
        {t('timeline.closeGap')}
      </button>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
        title={t('timeline.dismiss')}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
