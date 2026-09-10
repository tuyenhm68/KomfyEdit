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

  /**
   * A range the user can jump to is a range they can judge, and a list they can
   * strike entries off is an answer narrower than yes. Both hang off the item
   * carrying a timeline position.
   */
  it('keeps the timeline position an item points at', () => {
    const request = normalizeConfirmRequest({
      requestId: 'req_seek',
      title: 'Cắt 2 khoảng lặng',
      items: [
        { label: '1. 00:16 - 00:18', detail: '2,4 giây', startSec: 16.1, endSec: 18.5 },
        { label: '2. 00:29 - 00:31', detail: '2,7 giây', startSec: 29.1, endSec: 31.8 },
      ],
    })

    expect(editPilotConfirmRequestSchema.safeParse(request).success).toBe(true)
    expect(request.items?.[0].startSec).toBe(16.1)
    expect(request.items?.[1].endSec).toBe(31.8)
  })

  it('makes a list of timeline ranges tickable without being asked', () => {
    const request = normalizeConfirmRequest({
      requestId: 'req_sel',
      title: 'Cắt 2 khoảng lặng',
      items: [
        { label: '1', startSec: 16.1 },
        { label: '2', startSec: 29.1 },
      ],
    })
    expect(request.selectable).toBe(true)
  })

  it('leaves a plain question alone — nothing to tick off a yes/no', () => {
    const request = normalizeConfirmRequest({
      requestId: 'req_plain',
      title: 'Đổi khung hình sang 9:16?',
      items: [{ label: 'Timeline 1' }],
    })
    expect(request.selectable).toBeUndefined()
  })

  it('lets the agent overrule the guess in either direction', () => {
    const off = normalizeConfirmRequest({
      requestId: 'req_off',
      title: 'x',
      items: [{ label: '1', startSec: 1 }],
      selectable: false,
    })
    expect(off.selectable).toBeUndefined()

    const on = normalizeConfirmRequest({
      requestId: 'req_on',
      title: 'x',
      items: [{ label: 'Clip A' }, { label: 'Clip B' }],
      selectable: true,
    })
    expect(on.selectable).toBe(true)
  })
})
