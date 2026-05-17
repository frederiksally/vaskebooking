'use client'

import { useMemo, useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { da } from 'date-fns/locale'
import { todayInCph, fmtDayDanish, isoDateInCph } from '@/lib/time'
import type { Apartment } from '@/lib/apartments'
import { SlotList } from './slot-button'

export interface BookingLite { id: string; apartment: string; date: string; hour: number }

interface Props {
  apartment: Apartment
  bookings: BookingLite[]
  focus: { date: string; hour: number } | null
}

export function HomeClient({ apartment, bookings, focus }: Props) {
  const today = todayInCph()
  const [selected, setSelected] = useState<Date>(() => focus ? new Date(focus.date + 'T12:00:00') : new Date(today + 'T12:00:00'))
  const dateStr = useMemo(() => isoDateInCph(selected), [selected])

  const fullyBookedDates = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const b of bookings) counts[b.date] = (counts[b.date] ?? 0) + 1
    return Object.entries(counts).filter(([, n]) => n >= 15).map(([d]) => new Date(d + 'T12:00:00'))
  }, [bookings])

  const dayBookings = bookings.filter((b) => b.date === dateStr)

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6 md:grid-cols-[auto_1fr] md:gap-10 lg:gap-12">
      <Calendar
        mode="single"
        selected={selected}
        onSelect={(d) => d && setSelected(d)}
        locale={da}
        weekStartsOn={1}
        modifiers={{ booked: fullyBookedDates }}
        modifiersClassNames={{ booked: 'line-through opacity-60' }}
        disabled={(d) => {
          const iso = isoDateInCph(d)
          if (iso < today) return true
          const horizon = new Date(today + 'T12:00:00'); horizon.setDate(horizon.getDate() + 14)
          return iso > isoDateInCph(horizon)
        }}
      />

      <div>
        <h2 className="mb-3 text-lg font-medium first-letter:uppercase">{fmtDayDanish(dateStr)}</h2>
        <SlotList
          apartment={apartment}
          date={dateStr}
          dayBookings={dayBookings}
          focusHour={focus?.date === dateStr ? focus.hour : null}
        />
      </div>
    </div>
  )
}
