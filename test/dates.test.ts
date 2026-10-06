import { describe, expect, it } from 'vitest'
import { defaultTargetDate, formatDateJa } from '../src/calc/dates'

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min)

describe('defaultTargetDate', () => {
  it('平日の15:30以降は翌営業日', () => {
    expect(defaultTargetDate(at(2026, 10, 6, 22, 0))).toBe('2026-10-07') // 火→水
    expect(defaultTargetDate(at(2026, 10, 6, 15, 30))).toBe('2026-10-07')
  })
  it('平日の15:30より前は当日', () => {
    expect(defaultTargetDate(at(2026, 10, 6, 15, 29))).toBe('2026-10-06')
    expect(defaultTargetDate(at(2026, 10, 6, 7, 0))).toBe('2026-10-06')
  })
  it('金曜の夜は月曜', () => {
    expect(defaultTargetDate(at(2026, 10, 2, 22, 33))).toBe('2026-10-05')
  })
  it('土日は時刻によらず月曜', () => {
    expect(defaultTargetDate(at(2026, 10, 3, 10, 0))).toBe('2026-10-05')
    expect(defaultTargetDate(at(2026, 10, 4, 22, 33))).toBe('2026-10-05')
  })
})

it('formatDateJa', () => {
  expect(formatDateJa('2026-10-05')).toBe('10/05（月）')
})
