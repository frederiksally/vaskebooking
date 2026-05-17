'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { apartmentColor, type Apartment } from '@/lib/apartments'
import { isPastSlot } from '@/lib/time'
import { createBooking, cancelBooking } from '@/app/actions/bookings'
import { watchSlot } from '@/app/actions/push'
import { DANISH_MESSAGES, type RuleCode } from '@/lib/errors'
import { BookingDialog } from './booking-dialog'
import type { BookingLite } from './calendar'

interface Props {
  apartment: Apartment
  date: string
  dayBookings: BookingLite[]
  focusHour: number | null
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7) // 7..21

type ConfirmAction =
  | { kind: 'book'; hour: number }
  | { kind: 'cancel'; hour: number; bookingId: string }
  | { kind: 'watch'; hour: number }

export function SlotList({ apartment, date, dayBookings, focusHour }: Props) {
  const myCount = dayBookings.filter((b) => b.apartment === apartment).length
  const [pending, start] = useTransition()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const focusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusHour])

  function handleClick(hour: number) {
    if (isPastSlot(date, hour)) return
    const b = dayBookings.find((x) => x.hour === hour)
    if (!b) {
      if (myCount >= 3) { toast(DANISH_MESSAGES.MAX_3H_PER_DAY); return }
      setConfirmAction({ kind: 'book', hour })
    } else if (b.apartment === apartment) {
      setConfirmAction({ kind: 'cancel', hour, bookingId: b.id })
    } else {
      setConfirmAction({ kind: 'watch', hour })
    }
  }

  async function confirm() {
    if (!confirmAction) return
    start(async () => {
      let res: { ok: boolean; code?: string }
      if (confirmAction.kind === 'book') res = await createBooking({ date, hour: confirmAction.hour })
      else if (confirmAction.kind === 'cancel') res = await cancelBooking({ id: confirmAction.bookingId })
      else res = await watchSlot({ date, hour: confirmAction.hour })

      if (!res.ok) toast.error(DANISH_MESSAGES[res.code as RuleCode] ?? 'Ukendt fejl')
      else if (confirmAction.kind === 'book') toast.success('Booket')
      else if (confirmAction.kind === 'cancel') toast.success('Annulleret')
      else toast.success('Du får besked hvis tiden bliver ledig')
      setConfirmAction(null)
    })
  }

  return (
    <>
      <ul className="space-y-1">
        {HOURS.map((h) => {
          const b = dayBookings.find((x) => x.hour === h)
          const past = isPastSlot(date, h)
          const mine = b?.apartment === apartment
          const isFocus = focusHour === h
          const label = `${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`

          return (
            <li key={h}>
              <Button
                ref={isFocus ? focusRef : null}
                variant={mine ? 'default' : b ? 'secondary' : 'outline'}
                disabled={past || (!b && myCount >= 3)}
                onClick={() => handleClick(h)}
                className={`w-full justify-between ${isFocus ? 'ring-2 ring-primary' : ''}`}
              >
                <span>{label}</span>
                {b && (
                  <span className="flex items-center gap-2 text-xs">
                    <span className="size-2 rounded-full" style={{ background: apartmentColor(b.apartment as Apartment) }} />
                    {b.apartment}
                  </span>
                )}
                {!b && !past && <span className="text-xs text-muted-foreground">ledig</span>}
                {past && <span className="text-xs text-muted-foreground">forbi</span>}
              </Button>
            </li>
          )
        })}
      </ul>

      <BookingDialog
        action={confirmAction}
        date={date}
        apartment={apartment}
        booker={confirmAction ? dayBookings.find((b) => b.hour === confirmAction.hour)?.apartment : undefined}
        pending={pending}
        onConfirm={confirm}
        onClose={() => setConfirmAction(null)}
      />
    </>
  )
}
