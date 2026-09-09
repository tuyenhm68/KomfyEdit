import { describe, it, expect } from 'vitest'
import { rowIndexAtY, stableRowIndexAtY, type TimelineRowBox } from '../src/timeline-rows'

// A realistic stack: a short subtitle row, two video rows, one audio row.
const ROWS: TimelineRowBox[] = [
  { top: 0, height: 24 },
  { top: 24, height: 56 },
  { top: 80, height: 56 },
  { top: 136, height: 40 },
]

describe('rowIndexAtY', () => {
  it('returns the row the point is inside', () => {
    expect(rowIndexAtY(ROWS, 0)).toBe(0)
    expect(rowIndexAtY(ROWS, 23)).toBe(0)
    expect(rowIndexAtY(ROWS, 24)).toBe(1)
    expect(rowIndexAtY(ROWS, 79)).toBe(1)
    expect(rowIndexAtY(ROWS, 80)).toBe(2)
    expect(rowIndexAtY(ROWS, 175)).toBe(3)
  })

  it('does not drift when rows have different heights', () => {
    // The old average-height maths put y=136 (top of the audio row) at
    // round(136 / 44) = 3 by luck and y=80 at round(80 / 44) = 2 — but y=24,
    // the top of the first video row, came out as 1 only by accident and the
    // error grew with every extra row.
    expect(rowIndexAtY(ROWS, 136)).toBe(3)
    expect(rowIndexAtY(ROWS, 135)).toBe(2)
  })

  it('keeps counting in whole rows above the stack, for the new-track request', () => {
    expect(rowIndexAtY(ROWS, -1)).toBe(-1)
    expect(rowIndexAtY(ROWS, -24)).toBe(-1)
    expect(rowIndexAtY(ROWS, -25)).toBe(-2)
  })

  it('keeps counting past the bottom', () => {
    expect(rowIndexAtY(ROWS, 176)).toBe(4)
    expect(rowIndexAtY(ROWS, 216)).toBe(5)
  })

  it('survives an empty stack', () => {
    expect(rowIndexAtY([], 500)).toBe(0)
  })
})

describe('stableRowIndexAtY', () => {
  it('holds the current row through jitter around a boundary', () => {
    // Pointer resting one pixel over the line between row 1 and row 2.
    expect(stableRowIndexAtY(ROWS, 81, 1)).toBe(1)
    expect(stableRowIndexAtY(ROWS, 78, 1)).toBe(1)
  })

  it('gives way once the pointer is properly inside the next row', () => {
    expect(stableRowIndexAtY(ROWS, 90, 1)).toBe(2)
  })

  it('picks the plain answer with no previous row', () => {
    expect(stableRowIndexAtY(ROWS, 90, null)).toBe(2)
  })

  it('does not stick to a row that is not on screen', () => {
    // An extrapolated row above the stack has no box to hold on to.
    expect(stableRowIndexAtY(ROWS, 30, -1)).toBe(1)
  })
})
