import { useMemo, useState } from 'react'
import { AlertCircle, Check, Crosshair } from 'lucide-react'
import type { EditPilotConfirmAction, EditPilotConfirmRequest } from '@core/editpilot-confirm'
import { useTranslation } from '../../i18n/I18nContext'

/* ────────────────────────────────────────────────────────────────
   Confirmation card

   The agent is suspended while this is on screen — its `ask_confirm`
   tool call does not return until a button here is pressed. So the
   card has to be answerable: what was found, how much of it, and one
   button per way out, presented inline in the thread above the task list
   that is waiting on it.

   Answerable means more than readable. An item that carries a timeline
   position can be jumped to, so the user judges the spot by watching it
   rather than by trusting a timecode; and when the list is a list of
   things about to be removed, each row can be struck off, so the answer
   is "these two, not that one" instead of all-or-nothing.
   ──────────────────────────────────────────────────────────────── */

export interface EditPilotConfirmCardProps {
  request: EditPilotConfirmRequest
  /** The button already pressed, if this question has been answered. */
  answeredActionId?: string
  /** True once the run ended without an answer — the buttons no longer lead anywhere. */
  expired?: boolean
  /** Item numbers left ticked when it was answered, for the settled view. */
  answeredItemNumbers?: number[]
  /** Move the playhead to a position an item points at. */
  onSeek?: (timeSec: number) => void
  onAnswer: (action: EditPilotConfirmAction, selectedItemNumbers?: number[]) => void
}

function buttonClass(style: EditPilotConfirmAction['style']): string {
  if (style === 'danger') return 'bg-red-600 text-white hover:bg-red-500'
  if (style === 'secondary') return 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
  return 'bg-accent text-zinc-950 hover:bg-accent-dark'
}

export function EditPilotConfirmCard({
  request,
  answeredActionId,
  expired,
  answeredItemNumbers,
  onSeek,
  onAnswer,
}: EditPilotConfirmCardProps) {
  const { t } = useTranslation()
  const settled = Boolean(answeredActionId) || expired
  const answered = request.actions.find(action => action.id === answeredActionId)
  const items = request.items ?? []
  const selectable = Boolean(request.selectable) && items.length > 0

  // Everything starts ticked: the card asks the user to take entries *off* a
  // list the agent already proposed, not to build one from nothing.
  const [deselected, setDeselected] = useState<ReadonlySet<number>>(() => new Set())
  const selectedNumbers = useMemo(
    () => items.map((_, index) => index + 1).filter(number => !deselected.has(number)),
    [items, deselected],
  )

  // Once answered, show what was actually sent rather than the live state.
  const keptNumbers = settled ? answeredItemNumbers : selectedNumbers
  const isKept = (number: number) => !keptNumbers || keptNumbers.includes(number)

  const toggle = (number: number) => {
    setDeselected(prev => {
      const next = new Set(prev)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-3 py-2 text-[12.5px] font-medium text-zinc-100">
        {request.title}
      </div>

      {request.message && (
        <p className="px-3 pt-2 text-[12px] leading-relaxed text-zinc-400">{request.message}</p>
      )}

      {items.length > 0 && (
        <ul className="max-h-[240px] overflow-y-auto px-3 py-2">
          {items.map((item, position) => {
            const number = position + 1
            const kept = isKept(number)
            const seekTo = item.startSec
            const canSeek = typeof seekTo === 'number' && Boolean(onSeek)

            return (
              <li
                key={`${item.label}-${position}`}
                className={`flex items-center gap-2 border-b border-zinc-800/70 py-1.5 text-[12px] last:border-b-0 ${
                  kept ? '' : 'opacity-40'
                }`}
              >
                {selectable && !settled ? (
                  <input
                    type="checkbox"
                    checked={kept}
                    onChange={() => toggle(number)}
                    aria-label={item.label}
                    className="h-3.5 w-3.5 flex-shrink-0 accent-accent"
                  />
                ) : (
                  <span className="w-5 flex-shrink-0 text-right text-[11px] tabular-nums text-zinc-600">
                    {number}
                  </span>
                )}

                {canSeek ? (
                  <button
                    type="button"
                    onClick={() => onSeek?.(seekTo as number)}
                    title={t('editpilot.seekToItem')}
                    className={`group flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                      item.highlight
                        ? 'bg-accent/20 text-accent hover:bg-accent/30'
                        : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                    }`}
                  >
                    <Crosshair className="h-3 w-3 flex-shrink-0 opacity-60 group-hover:opacity-100" />
                    <span className="truncate">{item.label}</span>
                  </button>
                ) : (
                  <span
                    className={`truncate rounded px-1.5 py-0.5 ${
                      item.highlight ? 'bg-accent/20 text-accent' : 'bg-zinc-800 text-zinc-200'
                    }`}
                  >
                    {item.label}
                  </span>
                )}

                {item.detail && <span className="truncate text-[11px] text-zinc-500">{item.detail}</span>}
              </li>
            )
          })}
        </ul>
      )}

      {request.omittedItemCount ? (
        <p className="px-3 pb-1 text-[11px] text-zinc-500">
          {t('editpilot.moreItems', { count: request.omittedItemCount })}
        </p>
      ) : null}

      <div className="flex items-center gap-2 px-3 py-2">
        {settled ? (
          <span className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
            {answered ? (
              <>
                <Check className="h-3.5 w-3.5 text-accent" />
                {t('editpilot.chosen', { label: answered.label })}
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-zinc-500" />
                {t('editpilot.expired')}
              </>
            )}
          </span>
        ) : (
          <>
            {selectable && (
              <span className="text-[11px] text-zinc-500">
                {t('editpilot.selectedCount', { selected: selectedNumbers.length, total: items.length })}
              </span>
            )}
            <div className="flex-1" />
            {request.actions.map(action => (
              <button
                key={action.id}
                onClick={() => onAnswer(action, selectable ? selectedNumbers : undefined)}
                className={`rounded-[4px] px-3 py-1 text-[12px] font-medium transition-colors ${buttonClass(action.style)}`}
              >
                {action.label}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
