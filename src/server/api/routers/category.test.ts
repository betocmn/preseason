import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanTestDatabase, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('categoryRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists and fetches categories publicly', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.category.create({
      name: 'Authentication',
      slug: 'auth',
      description: 'Auth tools',
      icon: 'lock',
      displayOrder: 2,
    })
    await adminCaller.category.create({
      name: 'Database',
      slug: 'database',
      description: 'Database tools',
      icon: 'database',
      displayOrder: 1,
    })

    const caller = createTestCaller(null)
    const list = await caller.category.list()
    expect(list).toHaveLength(2)
    expect(list[0]?.slug).toBe('database')
    expect(list[1]?.slug).toBe('auth')

    const bySlug = await caller.category.getBySlug({ slug: 'auth' })
    expect(bySlug.name).toBe('Authentication')
  })

  it('creates, updates, and deletes as admin', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const created = await caller.category.create({
      name: 'Payments',
      slug: 'payments',
      description: 'Payment providers',
      icon: 'credit-card',
      displayOrder: 5,
    })
    if (!created) {
      throw new Error('Expected category to be created')
    }
    expect(created.slug).toBe('payments')

    const updated = await caller.category.update({
      id: created.id,
      description: 'Billing and payment tools',
      displayOrder: 3,
    })
    expect(updated.displayOrder).toBe(3)
    expect(updated.description).toBe('Billing and payment tools')

    const deleted = await caller.category.delete({ id: created.id })
    expect(deleted.success).toBe(true)
  })

  it('enforces admin role for mutations', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.category.create({
        name: 'Analytics',
        slug: 'analytics',
        description: 'Analytics tools',
        icon: 'bar-chart',
        displayOrder: 1,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('returns not found for unknown slug', async () => {
    const caller = createTestCaller(null)
    await expect(caller.category.getBySlug({ slug: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<TRPCError>)
  })
})
