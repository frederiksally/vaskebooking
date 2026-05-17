import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { isApartment, type Apartment } from '@/lib/apartments'

const ALG = 'HS256'

function secretKey(raw: string): Uint8Array {
  return new TextEncoder().encode(raw)
}

function requireCookieSecret(): string {
  const s = process.env.COOKIE_SECRET
  if (!s) throw new Error('COOKIE_SECRET environment variable is required')
  return s
}

export async function signDeviceId(deviceId: string, secret: string): Promise<string> {
  return await new SignJWT({ deviceId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .sign(secretKey(secret))
}

export async function verifyDeviceId(token: string, secret: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: [ALG] })
    return typeof payload.deviceId === 'string' ? payload.deviceId : null
  } catch {
    return null
  }
}

export interface Session {
  apartment: Apartment
  deviceId: string
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies()
  const apartment = c.get('apartment')?.value
  const token = c.get('device_id')?.value
  if (!apartment || !token) return null
  if (!isApartment(apartment)) return null
  const deviceId = await verifyDeviceId(token, requireCookieSecret())
  if (!deviceId) return null
  return { apartment, deviceId }
}

export async function setSession(apartment: Apartment, deviceId: string): Promise<void> {
  const c = await cookies()
  const token = await signDeviceId(deviceId, requireCookieSecret())
  const oneYear = 60 * 60 * 24 * 365
  // apartment is httpOnly:false so the client can render "logged in as <apt>"
  // without an extra round-trip. The signed device_id below is the integrity bearer.
  c.set('apartment', apartment, { httpOnly: false, sameSite: 'lax', secure: true, maxAge: oneYear, path: '/' })
  c.set('device_id', token, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: oneYear, path: '/' })
}

export async function clearSession(): Promise<void> {
  const c = await cookies()
  c.delete('apartment')
  c.delete('device_id')
}

export function newDeviceId(): string {
  return crypto.randomUUID()
}
