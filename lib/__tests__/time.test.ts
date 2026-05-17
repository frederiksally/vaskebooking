import { describe, it, expect } from 'vitest'
import { slotStartUtc, reminderFireUtc, isPastSlot, fmtSlotDanish, fmtDayDanish, todayInCph, daysFromTodayCph } from '@/lib/time'

describe('time', () => {
  it('slotStartUtc converts CPH local hour to UTC instant', () => {
    // 2026-01-15 14:00 CPH = 13:00 UTC (winter, +01:00)
    expect(slotStartUtc('2026-01-15', 14).toISOString()).toBe('2026-01-15T13:00:00.000Z')
    // 2026-07-15 14:00 CPH = 12:00 UTC (summer, +02:00)
    expect(slotStartUtc('2026-07-15', 14).toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('reminderFireUtc is slot start minus 30 minutes', () => {
    expect(reminderFireUtc('2026-01-15', 14).toISOString()).toBe('2026-01-15T12:30:00.000Z')
  })

  it('isPastSlot is true if slot start is before now', () => {
    const past = new Date('2020-01-01T00:00:00Z')
    const future = new Date('2999-01-01T00:00:00Z')
    expect(isPastSlot('2026-01-15', 14, past)).toBe(false)
    expect(isPastSlot('2026-01-15', 14, future)).toBe(true)
  })

  it('fmtSlotDanish formats correctly', () => {
    expect(fmtSlotDanish('2026-05-19', 14)).toBe('tirsdag 19. maj kl. 14:00–15:00')
  })

  it('fmtDayDanish formats correctly', () => {
    expect(fmtDayDanish('2026-05-19')).toBe('tirsdag 19. maj')
  })

  it('todayInCph returns ISO date string in CPH zone', () => {
    const d = todayInCph(new Date('2026-05-17T22:30:00Z'))
    expect(d).toBe('2026-05-18') // 00:30 CPH next day in summer
  })

  it('daysFromTodayCph counts whole days difference', () => {
    expect(daysFromTodayCph('2026-05-17', new Date('2026-05-17T10:00:00+02:00'))).toBe(0)
    expect(daysFromTodayCph('2026-05-31', new Date('2026-05-17T10:00:00+02:00'))).toBe(14)
  })
})
