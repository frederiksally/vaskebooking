'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { APARTMENTS, type Apartment, apartmentColor } from '@/lib/apartments'
import { login } from '@/app/actions/auth'
import { DANISH_MESSAGES } from '@/lib/errors'
import type { RuleCode } from '@/lib/errors'

export function OnboardingForm() {
  const [apt, setApt] = useState<Apartment | null>(null)
  const [pending, start] = useTransition()

  async function onSubmit(form: FormData) {
    if (!apt) { toast.error('Vælg en lejlighed'); return }
    form.set('apartment', apt)
    start(async () => {
      const res = await login(form)
      // login() redirects on success, so we only land here on error
      if (res && !res.ok) {
        const msg = DANISH_MESSAGES[res.code as RuleCode] ?? 'Ukendt fejl'
        toast.error(msg)
      }
    })
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Velkommen til Vaskebooking</h1>
      <div>
        <Label className="mb-2 block">Vælg din lejlighed</Label>
        <div className="grid grid-cols-2 gap-2">
          {APARTMENTS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setApt(a)}
              className={`flex items-center gap-2 rounded-lg border p-3 text-left transition ${
                apt === a ? 'border-primary bg-primary/5' : 'hover:bg-accent'
              }`}
            >
              <span className="size-3 rounded-full" style={{ background: apartmentColor(a) }} />
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="passcode">Bygningens kode</Label>
        <Input id="passcode" name="passcode" type="password" inputMode="numeric" autoComplete="off" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Logger ind…' : 'Log ind'}</Button>
    </form>
  )
}
