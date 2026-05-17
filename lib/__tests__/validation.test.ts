import { describe, it, expect } from 'vitest'
import { assertBookable } from '@/lib/validation'
import { RuleError } from '@/lib/errors'

const NOW = new Date('2026-05-17T08:00:00+02:00') // Sunday

describe('validation', () => {
  it('passes for a valid future slot', () => {
    expect(() => assertBookable({
      date: '2026-05-18', hour: 14, sameDayCount: 0, now: NOW,
    })).not.toThrow()
  })

  it('rejects out-of-hours', () => {
    expect(() => assertBookable({ date: '2026-05-18', hour: 6, sameDayCount: 0, now: NOW }))
      .toThrow(RuleError)
    expect(() => assertBookable({ date: '2026-05-18', hour: 22, sameDayCount: 0, now: NOW }))
      .toThrow(RuleError)
  })

  it('rejects past slots', () => {
    expect(() => assertBookable({ date: '2026-05-17', hour: 7, sameDayCount: 0, now: NOW }))
      .toThrow(/PAST_SLOT/)
  })

  it('accepts today if hour is in the future', () => {
    expect(() => assertBookable({ date: '2026-05-17', hour: 14, sameDayCount: 0, now: NOW }))
      .not.toThrow()
  })

  it('rejects > 14 days ahead', () => {
    expect(() => assertBookable({ date: '2026-06-01', hour: 14, sameDayCount: 0, now: NOW }))
      .toThrow(/HORIZON_EXCEEDED/)
  })

  it('accepts exactly 14 days ahead', () => {
    expect(() => assertBookable({ date: '2026-05-31', hour: 14, sameDayCount: 0, now: NOW }))
      .not.toThrow()
  })

  it('accepts the boundary hours 7 and 21', () => {
    expect(() => assertBookable({ date: '2026-05-18', hour: 7, sameDayCount: 0, now: NOW })).not.toThrow()
    expect(() => assertBookable({ date: '2026-05-18', hour: 21, sameDayCount: 0, now: NOW })).not.toThrow()
  })

  it('rejects when sameDayCount >= 3', () => {
    expect(() => assertBookable({ date: '2026-05-18', hour: 14, sameDayCount: 3, now: NOW }))
      .toThrow(/MAX_3H_PER_DAY/)
  })
})
