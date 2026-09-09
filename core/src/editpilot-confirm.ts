import { z } from 'zod'

/**
 * The mid-run confirmation prompt: what the agent asks, and what comes back.
 *
 * An agent that only talks cannot stop and ask — its reply is a monologue, and
 * by the time the user reads "shall I delete these?" the run is already over.
 * So the question travels the other way, as a blocking MCP call: the agent
 * calls `ask_confirm`, the live bridge parks that call, the panel draws the
 * card, and the answer is the tool's return value. The agent is suspended in
 * the meantime, which is the point — nothing is deleted while the user thinks.
 *
 * The shape stays deliberately generic (title, items, buttons) so the agent
 * decides what it is asking about; the panel only decides how it looks.
 */

export const editPilotConfirmItemSchema = z.object({
  /** Short primary text — the word, the clip name, the range. */
  label: z.string(),
  /** Secondary text shown next to it, e.g. a duration or a timecode. */
  detail: z.string().optional(),
  /** Draws the eye to items the action will actually touch. */
  highlight: z.boolean().optional(),
})

export type EditPilotConfirmItem = z.infer<typeof editPilotConfirmItemSchema>

export const editPilotConfirmActionSchema = z.object({
  /** Returned to the agent verbatim, so it knows which button was pressed. */
  id: z.string(),
  label: z.string(),
  style: z.enum(['primary', 'danger', 'secondary']).optional(),
})

export type EditPilotConfirmAction = z.infer<typeof editPilotConfirmActionSchema>

export const editPilotConfirmRequestSchema = z.object({
  requestId: z.string(),
  title: z.string(),
  message: z.string().optional(),
  items: z.array(editPilotConfirmItemSchema).optional(),
  actions: z.array(editPilotConfirmActionSchema).min(1),
  /** Which checklist item is blocked, so the card and the plan line up. */
  taskIndex: z.number().int().positive().optional(),
  /** Truncated count, when the agent listed more than the panel will draw. */
  omittedItemCount: z.number().int().nonnegative().optional(),
})

export type EditPilotConfirmRequest = z.infer<typeof editPilotConfirmRequestSchema>

/** The user's answer, or the reason there is not one. */
export const editPilotConfirmAnswerSchema = z.object({
  requestId: z.string(),
  /** The `id` of the pressed button; absent when nothing was pressed. */
  actionId: z.string().optional(),
  /** The panel closed or the run was stopped before an answer came. */
  dismissed: z.boolean().optional(),
})

export type EditPilotConfirmAnswer = z.infer<typeof editPilotConfirmAnswerSchema>

/**
 * A list long enough to scroll past is not a question any more. The agent is
 * free to pass every match it found; the card shows the first slice and says
 * how many it is standing in for.
 */
export const MAX_CONFIRM_ITEMS = 40

export const DEFAULT_CONFIRM_ACTIONS: EditPilotConfirmAction[] = [
  { id: 'confirm', label: 'Xác nhận', style: 'primary' },
  { id: 'cancel', label: 'Huỷ', style: 'secondary' },
]

export interface NormalizeConfirmInput {
  requestId: string
  title?: unknown
  message?: unknown
  items?: unknown
  actions?: unknown
  taskIndex?: unknown
}

/**
 * Turns whatever the agent passed into a request the panel can draw: fills in
 * the default buttons, caps the item list, and drops entries that carry no
 * label. Written to be forgiving — a malformed argument should still produce a
 * usable question rather than failing the tool call mid-run.
 */
export function normalizeConfirmRequest(input: NormalizeConfirmInput): EditPilotConfirmRequest {
  const rawItems = Array.isArray(input.items) ? input.items : []
  const items: EditPilotConfirmItem[] = []
  for (const candidate of rawItems) {
    const parsed = editPilotConfirmItemSchema.safeParse(
      typeof candidate === 'string' ? { label: candidate } : candidate,
    )
    if (parsed.success && parsed.data.label.trim()) items.push(parsed.data)
  }

  const rawActions = Array.isArray(input.actions) ? input.actions : []
  const actions: EditPilotConfirmAction[] = []
  for (const candidate of rawActions) {
    const parsed = editPilotConfirmActionSchema.safeParse(candidate)
    if (parsed.success && parsed.data.id.trim() && parsed.data.label.trim()) actions.push(parsed.data)
  }

  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim()
    : 'Cần bạn xác nhận'
  const message = typeof input.message === 'string' && input.message.trim()
    ? input.message.trim()
    : undefined
  const taskIndex = typeof input.taskIndex === 'number' && Number.isInteger(input.taskIndex) && input.taskIndex > 0
    ? input.taskIndex
    : undefined

  return {
    requestId: input.requestId,
    title,
    ...(message ? { message } : {}),
    ...(items.length > 0 ? { items: items.slice(0, MAX_CONFIRM_ITEMS) } : {}),
    ...(items.length > MAX_CONFIRM_ITEMS ? { omittedItemCount: items.length - MAX_CONFIRM_ITEMS } : {}),
    actions: actions.length > 0 ? actions : DEFAULT_CONFIRM_ACTIONS,
    ...(taskIndex ? { taskIndex } : {}),
  }
}

/** How long a parked question waits before the agent is told nobody answered. */
export const CONFIRM_TIMEOUT_MS = 5 * 60 * 1000
