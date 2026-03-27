import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanTestDatabase, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('toolRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists publicly with category filter', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')

    const authCategory = await adminCaller.category.create({
      name: 'Authentication',
      slug: 'auth',
      categoryId: group.id,
      description: 'Auth',
      icon: 'lock',
      displayOrder: 1,
    })
    const dbCategory = await adminCaller.category.create({
      name: 'Database',
      slug: 'database',
      categoryId: group.id,
      description: 'DB',
      icon: 'database',
      displayOrder: 2,
    })
    if (!authCategory || !dbCategory) {
      throw new Error('Expected categories to be created')
    }

    await adminCaller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [authCategory.id],
    })
    await adminCaller.tool.create({
      name: 'Supabase',
      slug: 'supabase',
      categoryIds: [dbCategory.id],
    })

    const caller = createTestCaller(null)
    const authTools = await caller.tool.list({ categorySlug: 'auth', limit: 10, offset: 0 })

    expect(authTools.total).toBe(1)
    expect(authTools.items[0]?.slug).toBe('clerk')
  })

  it('searches by aliases and slug', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')
    const category = await adminCaller.category.create({
      name: 'Authentication',
      slug: 'auth',
      categoryId: group.id,
      description: 'Auth',
      icon: 'lock',
      displayOrder: 1,
    })
    if (!category) {
      throw new Error('Expected category to be created')
    }

    await adminCaller.tool.create({
      name: 'NextAuth.js',
      slug: 'nextauth',
      aliases: ['authjs', 'next-auth'],
      categoryIds: [category.id],
    })

    const caller = createTestCaller(null)
    const aliasSearch = await caller.tool.search({ query: 'authjs', limit: 10 })
    const slugSearch = await caller.tool.search({ query: 'nextauth', limit: 10 })

    expect(aliasSearch[0]?.slug).toBe('nextauth')
    expect(slugSearch[0]?.slug).toBe('nextauth')
  })

  it('searches by fingerprint variants', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')
    const category = await adminCaller.category.create({
      name: 'Authentication',
      slug: 'auth',
      categoryId: group.id,
      description: 'Auth',
      icon: 'lock',
      displayOrder: 1,
    })
    if (!category) throw new Error('Expected category to be created')

    await adminCaller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })

    const caller = createTestCaller(null)
    const fingerprintSearch = await caller.tool.search({ query: 'clerk.dev', limit: 10 })

    expect(fingerprintSearch[0]?.slug).toBe('clerk')
  })

  it('biases search results toward the requested category', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')
    const stateCategory = await adminCaller.category.create({
      name: 'State',
      slug: 'state',
      categoryId: group.id,
      description: 'State',
      icon: 'git-branch',
      displayOrder: 1,
    })
    const jobsCategory = await adminCaller.category.create({
      name: 'Jobs',
      slug: 'jobs',
      categoryId: group.id,
      description: 'Jobs',
      icon: 'clock',
      displayOrder: 2,
    })
    if (!stateCategory || !jobsCategory) throw new Error('Expected categories to be created')

    await adminCaller.tool.create({
      name: 'Flow State',
      slug: 'flow-state',
      categoryIds: [stateCategory.id],
    })
    await adminCaller.tool.create({
      name: 'Flow Jobs',
      slug: 'flow-jobs',
      categoryIds: [jobsCategory.id],
    })

    const caller = createTestCaller(null)
    const ranked = await caller.tool.search({
      query: 'flow',
      categoryId: stateCategory.id,
      limit: 10,
    })

    expect(ranked[0]?.slug).toBe('flow-state')
  })

  it('supports admin CRUD and verify', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')
    const category = await adminCaller.category.create({
      name: 'Payments',
      slug: 'payments',
      categoryId: group.id,
      description: 'Payments',
      icon: 'credit-card',
      displayOrder: 1,
    })
    if (!category) {
      throw new Error('Expected category to be created')
    }

    const created = await adminCaller.tool.create({
      name: 'Stripe',
      slug: 'stripe',
      categoryIds: [category.id],
      isVerified: true,
    })
    expect(created?.slug).toBe('stripe')
    expect(created?.isVerified).toBe(true)

    const updated = await adminCaller.tool.update({
      id: created?.id ?? '',
      description: 'Payment platform',
      aliases: ['stripe-payments'],
      isVerified: false,
    })
    expect(updated.description).toBe('Payment platform')
    expect(updated.isVerified).toBe(false)

    const verified = await adminCaller.tool.verify({ id: created?.id ?? '' })
    expect(verified.isVerified).toBe(true)

    const deleted = await adminCaller.tool.delete({ id: created?.id ?? '' })
    expect(deleted.success).toBe(true)
  })

  it('allows clearing optional fields and categories on update', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Collaboration',
      slug: 'collaboration',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected group to be created')
    const category = await adminCaller.category.create({
      name: 'Project Management',
      slug: 'project-management',
      categoryId: group.id,
      description: 'PM',
      icon: 'briefcase',
      displayOrder: 1,
    })
    if (!category) throw new Error('Expected category to be created')

    const created = await adminCaller.tool.create({
      name: 'Linear',
      slug: 'linear',
      description: 'Issue tracker',
      website: 'https://linear.app',
      logoUrl: '/logos/linear.png',
      aliases: ['linear-app'],
      categoryIds: [category.id],
      isVerified: true,
    })
    if (!created) throw new Error('Expected tool to be created')

    const updated = await adminCaller.tool.update({
      id: created.id,
      description: null,
      website: null,
      logoUrl: null,
      aliases: null,
      categoryIds: [],
    })

    expect(updated.description).toBeNull()
    expect(updated.website).toBeNull()
    expect(updated.logoUrl).toBeNull()
    expect(updated.toolAliases).toHaveLength(0)
    expect(updated.toolCategories).toHaveLength(0)
  })

  it('rejects non-local logo paths', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await expect(
      adminCaller.tool.create({
        name: 'Bad Logo Tool',
        slug: 'bad-logo-tool',
        logoUrl: 'https://example.com/logo.png',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    } satisfies Partial<TRPCError>)
  })

  it('enforces provider-scoped listMine', async () => {
    const { authUser: adminAuth, profile: adminProfile } = await seedUser({ role: 'admin' })
    const { profile: providerOne } = await seedUser({ role: 'provider' })
    const { profile: providerTwo } = await seedUser({ role: 'provider' })
    const adminCaller = createTestCaller(adminAuth)

    await adminCaller.tool.create({
      name: 'ProviderOne Tool',
      slug: 'provider-one-tool',
      providerUserId: providerOne.id,
    })
    await adminCaller.tool.create({
      name: 'ProviderTwo Tool',
      slug: 'provider-two-tool',
      providerUserId: providerTwo.id,
    })

    const providerOneCaller = createTestCaller({
      ...adminAuth,
      id: providerOne.id,
      email: providerOne.email,
    })
    const providerMine = await providerOneCaller.tool.listMine({ limit: 20, offset: 0 })
    expect(providerMine.total).toBe(1)
    expect(providerMine.items[0]?.providerUserId).toBe(providerOne.id)

    const adminMine = await adminCaller.tool.listMine({
      providerUserId: providerTwo.id,
      limit: 20,
      offset: 0,
    })
    expect(adminProfile.role).toBe('admin')
    expect(adminMine.total).toBe(1)
    expect(adminMine.items[0]?.providerUserId).toBe(providerTwo.id)
  })

  it('rejects non-admin mutations', async () => {
    const { authUser } = await seedUser({ role: 'provider' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.tool.create({
        name: 'Blocked',
        slug: 'blocked',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })
})
