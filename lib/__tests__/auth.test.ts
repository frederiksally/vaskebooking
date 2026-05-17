// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { signDeviceId, verifyDeviceId } from '@/lib/auth'

describe('auth signed cookie', () => {
  it('round-trips a device id', async () => {
    const secret = '0'.repeat(64)
    const signed = await signDeviceId('abc-123', secret)
    expect(await verifyDeviceId(signed, secret)).toBe('abc-123')
  })

  it('returns null for tampered token', async () => {
    const secret = '0'.repeat(64)
    const signed = await signDeviceId('abc-123', secret)
    expect(await verifyDeviceId(signed + 'x', secret)).toBe(null)
  })

  it('returns null for wrong secret', async () => {
    const signed = await signDeviceId('abc-123', '0'.repeat(64))
    expect(await verifyDeviceId(signed, '1'.repeat(64))).toBe(null)
  })
})
