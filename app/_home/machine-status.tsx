'use client'

import { useSyncExternalStore } from 'react'
import { isoDateInCph, slotStartUtc } from '@/lib/time'
import { apartmentColor, type Apartment } from '@/lib/apartments'
import type { BookingLite } from './calendar'

interface Props {
  bookings: BookingLite[]
}

interface Status {
  kind: 'running' | 'finishing' | 'free'
  apartment?: Apartment
  // The hh:mm string the user sees ("15:00")
  until: string
}

const FINISHING_THRESHOLD_MIN = 10

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function hourToHHMM(h: number): string {
  return `${pad(h)}:00`
}

function computeStatus(bookings: BookingLite[], now: Date): Status {
  const todayIso = isoDateInCph(now)
  const todays = bookings
    .filter((b) => b.date === todayIso)
    .sort((a, b) => a.hour - b.hour)

  // Active booking = the one whose [hour, hour+1) contains `now`.
  const active = todays.find((b) => {
    const start = slotStartUtc(b.date, b.hour).getTime()
    const end = start + 60 * 60 * 1000
    return now.getTime() >= start && now.getTime() < end
  })

  if (active) {
    const endMs = slotStartUtc(active.date, active.hour).getTime() + 60 * 60 * 1000
    const minsLeft = Math.ceil((endMs - now.getTime()) / 60_000)
    return {
      kind: minsLeft <= FINISHING_THRESHOLD_MIN ? 'finishing' : 'running',
      apartment: active.apartment as Apartment,
      until: hourToHHMM(active.hour + 1),
    }
  }

  // Free — find the next booking later today.
  const next = todays.find((b) => slotStartUtc(b.date, b.hour).getTime() > now.getTime())
  return {
    kind: 'free',
    until: next ? hourToHHMM(next.hour) : '',
  }
}

// A shared "current minute" clock exposed through useSyncExternalStore. The
// server snapshot is null (so we render nothing and avoid hydration drift); the
// client snapshot is the current time, refreshed every minute and whenever the
// tab becomes visible. A single interval is shared across all subscribers.
const clock = {
  listeners: new Set<() => void>(),
  interval: null as ReturnType<typeof setInterval> | null,
  onVisible: null as (() => void) | null,
  now: null as Date | null,
  emit() {
    clock.now = new Date()
    for (const l of clock.listeners) l()
  },
  subscribe(listener: () => void): () => void {
    if (clock.listeners.size === 0) {
      clock.now = new Date()
      clock.interval = setInterval(() => clock.emit(), 60_000)
      clock.onVisible = () => document.visibilityState === 'visible' && clock.emit()
      document.addEventListener('visibilitychange', clock.onVisible)
    }
    clock.listeners.add(listener)
    return () => {
      clock.listeners.delete(listener)
      if (clock.listeners.size === 0) {
        if (clock.interval) clearInterval(clock.interval)
        if (clock.onVisible) document.removeEventListener('visibilitychange', clock.onVisible)
        clock.interval = null
        clock.onVisible = null
        clock.now = null
      }
    }
  },
}

export function MachineStatus({ bookings }: Props) {
  const now = useSyncExternalStore(
    (l) => clock.subscribe(l),
    () => clock.now,
    () => null,
  )

  // Render nothing on the server / first paint to avoid hydration drift.
  if (!now) return null

  const status = computeStatus(bookings, now)

  if (status.kind === 'free') {
    const tail = status.until ? ` indtil ${status.until}` : ' resten af dagen'
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <span className="size-2.5 rounded-full bg-emerald-500" />
        <p className="text-sm">
          <span className="font-medium">Maskinen er ledig</span>
          <span className="text-muted-foreground">{tail}</span>
        </p>
      </div>
    )
  }

  const finishing = status.kind === 'finishing'
  const ringClass = finishing
    ? 'border-amber-500/30 bg-amber-500/10'
    : 'border-foreground/10 bg-muted/40'
  const dotPulse = finishing ? 'animate-pulse bg-amber-500' : 'bg-foreground/60'

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${ringClass}`}>
      <span className={`size-2.5 rounded-full ${dotPulse}`} />
      <p className="text-sm">
        <span className="font-medium">{finishing ? 'Snart færdig' : 'Vasker nu'}</span>
        <span className="text-muted-foreground">
          {' · '}
          <span
            className="inline-block size-2 translate-y-px rounded-full align-middle"
            style={status.apartment ? { background: apartmentColor(status.apartment) } : undefined}
          />
          {' '}{status.apartment} indtil {status.until}
        </span>
      </p>
    </div>
  )
}
