export const APARTMENTS = [
  'St. tv', 'St. th',
  '1. tv', '1. th',
  '2. tv', '2. th',
  '3. tv', '3. th',
  '4. tv', '4. th',
] as const

export type Apartment = (typeof APARTMENTS)[number]

export function isApartment(value: unknown): value is Apartment {
  return typeof value === 'string' && (APARTMENTS as readonly string[]).includes(value)
}

const COLOR_MAP: Record<Apartment, string> = {
  'St. tv': '#ef4444', 'St. th': '#f97316',
  '1. tv':  '#eab308', '1. th':  '#84cc16',
  '2. tv':  '#10b981', '2. th':  '#06b6d4',
  '3. tv':  '#3b82f6', '3. th':  '#8b5cf6',
  '4. tv':  '#ec4899', '4. th':  '#a855f7',
}

export function apartmentColor(apartment: Apartment): string {
  return COLOR_MAP[apartment]
}
