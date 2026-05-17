// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(async () => ({ apartment: '1. tv', deviceId: 'd1' })),
}))

const mockTx = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}
vi.mock('@/db', () => {
  // Schema is a permissive proxy so any `schema.foo.bar` access returns a stub
  // without us needing to mirror the Drizzle table objects in tests.
  const schemaStub: Record<string, unknown> = new Proxy(
    {},
    {
      get: () =>
        new Proxy(
          {},
          { get: (_t, p) => (typeof p === 'string' ? `__col_${p}__` : p) },
        ),
    },
  )
  return {
    db: { transaction: vi.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)) },
    schema: schemaStub,
  }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createBooking } from '@/app/actions/bookings'

describe('createBooking', () => {
  beforeEach(() => {
    mockTx.select.mockReset()
    mockTx.insert.mockReset()
    mockTx.delete.mockReset()
  })

  it('rejects when apartment already has 3 bookings on that date', async () => {
    mockTx.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) }),
    })
    const res = await createBooking({ date: '2026-05-18', hour: 14 })
    expect(res).toEqual({ ok: false, code: 'MAX_3H_PER_DAY' })
  })

  it('returns SLOT_TAKEN on unique violation', async () => {
    mockTx.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    })
    mockTx.insert.mockReturnValue({
      values: () => ({ returning: () => Promise.reject(Object.assign(new Error('unique'), { code: '23505' })) }),
    })
    const res = await createBooking({ date: '2026-05-18', hour: 14 })
    expect(res).toEqual({ ok: false, code: 'SLOT_TAKEN' })
  })
})
