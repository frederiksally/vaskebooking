'use client'

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { toast } from 'sonner'
import { fmtSlotDanish } from '@/lib/time'
import { cancelBooking } from '@/app/actions/bookings'
import { unwatchSlot } from '@/app/actions/push'
import { DANISH_MESSAGES, type RuleCode } from '@/lib/errors'

interface BookingRow { id: string; apartment: string; date: string; hour: number }
interface WatchRow { id: string; date: string; hour: number; booker?: string }

export function BookingsClient({
  upcoming,
  history,
  watches,
}: {
  upcoming: BookingRow[]
  history: BookingRow[]
  watches: WatchRow[]
}) {
  const [pending, start] = useTransition()

  function onCancel(id: string) {
    start(async () => {
      const res = await cancelBooking({ id })
      if (!res.ok) toast.error(DANISH_MESSAGES[res.code as RuleCode] ?? 'Ukendt fejl')
      else toast.success('Annulleret')
    })
  }

  function onUnwatch(date: string, hour: number) {
    start(async () => {
      await unwatchSlot({ date, hour })
      toast('Vagt fjernet')
    })
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Card>
        <CardHeader><CardTitle>Mine bookinger</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Ingen kommende bookinger.</p>}
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">{fmtSlotDanish(b.date, b.hour)}</span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCancel(b.id)}>Annullér</Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Vagter</CardTitle></CardHeader>
        <CardContent>
          {watches.length === 0 && <p className="text-sm text-muted-foreground">Ingen vagter.</p>}
          <ul className="space-y-2">
            {watches.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-md border p-2">
                <span className="text-sm">
                  {fmtSlotDanish(w.date, w.hour)}{w.booker ? ` · booket af ${w.booker}` : ' · ledig'}
                </span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => onUnwatch(w.date, w.hour)}>Stop</Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Accordion>
        <AccordionItem value="history">
          <AccordionTrigger>Historik (sidste 30)</AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-1">
              {history.map((b) => (
                <li key={b.id} className="text-sm text-muted-foreground">{fmtSlotDanish(b.date, b.hour)}</li>
              ))}
              {history.length === 0 && <p className="text-sm">Ingen historik.</p>}
            </ul>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
