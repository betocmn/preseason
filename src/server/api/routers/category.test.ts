import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanTestDatabase, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('categoryRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists and fetches subcategories publicly', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')

    await adminCaller.category.create({
      name: 'Authentication',
      slug: 'auth',
      categoryId: group.id,
      description: 'Auth tools',
      icon: 'lock',
      displayOrder: 2,
    })
    await adminCaller.category.create({
      name: 'Database',
      slug: 'database',
      categoryId: group.id,
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

  it('creates, updates, and deletes subcategories as admin', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const group = await caller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')

    const created = await caller.category.create({
      name: 'Payments',
      slug: 'payments',
      categoryId: group.id,
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

  it('lists and manages category groups', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group1 = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 2,
    })
    if (!group1) throw new Error('Expected group to be created')
    await adminCaller.category.createGroup({
      name: 'Salestech',
      slug: 'salestech',
      displayOrder: 1,
    })

    const caller = createTestCaller(null)
    const groups = await caller.category.listGroups()
    expect(groups).toHaveLength(2)
    expect(groups[0]?.slug).toBe('salestech')
    expect(groups[1]?.slug).toBe('devtools')

    const bySlug = await caller.category.getGroupBySlug({ slug: 'devtools' })
    expect(bySlug.name).toBe('Devtools')

    const updated = await adminCaller.category.updateGroup({
      id: group1.id,
      description: 'Developer tools',
    })
    expect(updated.description).toBe('Developer tools')

    const deleted = await adminCaller.category.deleteGroup({ id: group1.id })
    expect(deleted.success).toBe(true)
  })

  it('enforces admin role for mutations', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.category.createGroup({
        name: 'Analytics',
        slug: 'analytics',
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
