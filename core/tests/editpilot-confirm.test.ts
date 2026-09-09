import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONFIRM_ACTIONS,
  MAX_CONFIRM_ITEMS,
  editPilotConfirmRequestSchema,
  normalizeConfirmRequest,
} from '../src/editpilot-confirm'

describe('normalizeConfirmRequest', () => {
  it('keeps what the agent sent and passes the schema', () => {
    const request = normalizeConfirmRequest({
      requestId: 'req_1',
      title: 'Filler words detected',
      message: 'Xoá 3 từ đệm?',
      items: [
        { label: 'Pauses', detail: '0.7s', highlight: true },
        { label: 'doesn\'t rebuild me.' },
      ],
      actions: [{ id: 'delete', label: 'Delete', style: 'danger' }],
      taskIndex: 1,
    })

    expect(editPilotConfirmRequestSchema.safeParse(request).success).toBe(true)
    expect(request.items).toHaveLength(2)
    expect(request.actions).toEqual([{ id: 'delete', label: 'Delete', style: 'danger' }])
    expect(request.taskIndex).toBe(1)
  })

  it('offers confirm/cancel when the agent named no buttons', () => {
    const request = normalizeConfirmRequest({ requestId: 'req_2', title: 'Xoá clip?' })
    expect(request.actions).toEqual(DEFAULT_CONFIRM_ACTIONS)
  })

  it('accepts bare strings as items', () => {
    const request = normalizeConfirmRequest({
      requestId: 'req_3',
      title: 'Xoá',
      items: ['một', 'hai'],
    })
    expect(request.items?.map(item => item.label)).toEqual(['một', 'hai'])
  })

  it('caps a long list and reports the remainder', () => {
    const items = Array.from({ length: 365 }, (_, i) => ({ label: `Pause ${i + 1}` }))
    const request = normalizeConfirmRequest({ requestId: 'req_4', title: 'Pauses', items })
    expect(request.items).toHaveLength(MAX_CONFIRM_ITEMS)
    expect(request.omittedItemCount).toBe(365 - MAX_CONFIRM_ITEMS)
  })

  it('leaves out the remainder line when nothing was cut', () => {
    const request = normalizeConfirmRequest({ requestId: 'req_5', title: 'Xoá', items: ['một'] })
    expect(request.omittedItemCount).toBeUndefined()
  })

  it('survives malformed arguments rather than failing the tool call', () => {
    const request = normalizeConfirmRequest({
      requestId: 'req_6',
      title: '   ',
      items: [{ nope: 1 }, { label: '  ' }, { label: 'giữ lại' }],
      actions: [{ id: '', label: 'Trống' }, 'không phải nút'],
      taskIndex: -2,
    })

    expect(editPilotConfirmRequestSchema.safeParse(request).success).toBe(true)
    expect(request.title).toBe('Cần bạn xác nhận')
    expect(request.items?.map(item => item.label)).toEqual(['giữ lại'])
    expect(request.actions).toEqual(DEFAULT_CONFIRM_ACTIONS)
    expect(request.taskIndex).toBeUndefined()
  })

  it('drops an empty item list instead of drawing an empty box', () => {
    const request = normalizeConfirmRequest({ requestId: 'req_7', title: 'Xoá', items: [] })
    expect(request.items).toBeUndefined()
  })
})
