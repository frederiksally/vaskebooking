import { describe, it, expect } from 'vitest'
import { APARTMENTS, isApartment, apartmentColor } from '@/lib/apartments'

describe('apartments', () => {
  it('has all 10 apartments in expected order', () => {
    expect(APARTMENTS).toEqual([
      'St. tv', 'St. th',
      '1. tv', '1. th',
      '2. tv', '2. th',
      '3. tv', '3. th',
      '4. tv', '4. th',
    ])
  })

  it('isApartment narrows correctly', () => {
    expect(isApartment('1. tv')).toBe(true)
    expect(isApartment('5. tv')).toBe(false)
    expect(isApartment('')).toBe(false)
  })

  it('every apartment has a unique color', () => {
    const colors = APARTMENTS.map(apartmentColor)
    expect(new Set(colors).size).toBe(APARTMENTS.length)
  })
})
