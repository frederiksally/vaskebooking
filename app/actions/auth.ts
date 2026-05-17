'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { APARTMENTS } from '@/lib/apartments'
import { setSession, clearSession, newDeviceId, getSession } from '@/lib/auth'

const LoginSchema = z.object({
  apartment: z.enum(APARTMENTS),
  passcode: z.string().min(1),
})

export type ActionResult = { ok: true } | { ok: false; code: string }

export async function login(form: FormData): Promise<ActionResult> {
  const parsed = LoginSchema.safeParse({
    apartment: form.get('apartment'),
    passcode: form.get('passcode'),
  })
  if (!parsed.success) return { ok: false, code: 'INVALID_APARTMENT' }
  if (parsed.data.passcode !== process.env.BUILDING_PASSCODE) {
    return { ok: false, code: 'INVALID_PASSCODE' }
  }
  const existing = await getSession()
  const deviceId = existing?.deviceId ?? newDeviceId()
  await setSession(parsed.data.apartment, deviceId)
  redirect('/')
}

export async function changeApartment(form: FormData): Promise<ActionResult> {
  return await login(form)
}

export async function logout(): Promise<void> {
  await clearSession()
  redirect('/onboarding')
}
