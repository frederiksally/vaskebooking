'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fmtSlotDanish } from '@/lib/time'
import type { Apartment } from '@/lib/apartments'

type ActionKind = 'book' | 'cancel' | 'watch'

interface Props {
  action: { kind: ActionKind; hour: number } | null
  date: string
  apartment: Apartment
  booker?: string
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}

export function BookingDialog({ action, date, apartment, booker, pending, onConfirm, onClose }: Props) {
  if (!action) return null
  const slot = fmtSlotDanish(date, action.hour)

  const titleMap: Record<ActionKind, string> = {
    book: 'Book vasketid?',
    cancel: 'Annullér booking?',
    watch: 'Få besked hvis ledig?',
  }
  const ctaMap: Record<ActionKind, string> = {
    book: 'Bekræft booking',
    cancel: 'Annullér booking',
    watch: 'Giv mig besked',
  }
  const descMap: Record<ActionKind, string> = {
    book: `${slot} for ${apartment}`,
    cancel: `${slot}. Naboer der venter på denne tid får besked hvis du annullerer.`,
    watch: `${slot} er booket af ${booker ?? '?'}.`,
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleMap[action.kind]}</DialogTitle>
          <DialogDescription>{descMap[action.kind]}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Luk</Button>
          <Button onClick={onConfirm} disabled={pending}>{pending ? '…' : ctaMap[action.kind]}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
