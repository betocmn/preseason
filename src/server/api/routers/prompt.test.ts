import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanTestDatabase, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('promptRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists active prompts only', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Active Prompt',
      slug: 'real-estate-website',
      level: 'vibe-coder',
      description: 'active',
      isActive: true,
    })
    await adminCaller.prompt.create({
      title: 'Inactive Prompt',
      slug: 'blog-platform-cms',
      level: 'vibe-coder',
      description: 'inactive',
      isActive: false,
    })

    const caller = createTestCaller(null)
    const prompts = await caller.prompt.listActive()
    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.title).toBe('Active Prompt')
  })

  it('returns prompt content in getBySlug when markdown file exists', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Real Estate Prompt',
      slug: 'real-estate-website',
      level: 'vibe-coder',
      description: 'test',
      isActive: true,
    })

    const caller = createTestCaller(null)
    const prompt = await caller.prompt.getBySlug({
      slug: 'real-estate-website',
      level: 'vibe-coder',
    })
    expect(prompt.slug).toBe('real-estate-website')
    expect(prompt.content).toContain('Create')
  })

  it('lists prompt variants by slug across levels', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Vibe Variant',
      slug: 'job-board',
      level: 'vibe-coder',
      isActive: true,
    })
    await adminCaller.prompt.create({
      title: 'Experienced Variant',
      slug: 'job-board',
      level: 'software-dev-experienced',
      isActive: true,
    })

    const caller = createTestCaller(null)
    const variants = await caller.prompt.listBySlug({ slug: 'job-board' })

    expect(variants).toHaveLength(2)
    expect(variants.map((variant) => variant.level).sort()).toEqual([
      'software-dev-experienced',
      'vibe-coder',
    ])
  })

  it('supports admin update and toggleActive', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const created = await caller.prompt.create({
      title: 'SaaS Prompt',
      slug: 'saas-application',
      level: 'vibe-coder',
      description: 'original',
      isActive: true,
    })

    const updated = await caller.prompt.update({
      id: created?.id ?? '',
      description: 'updated description',
      expectedCategories: ['auth', 'payments'],
    })
    expect(updated.description).toBe('updated description')
    expect(updated.expectedCategories).toEqual(['auth', 'payments'])

    const toggled = await caller.prompt.toggleActive({
      id: created?.id ?? '',
      isActive: false,
    })
    expect(toggled.isActive).toBe(false)
  })

  it('enforces admin role for mutations', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.prompt.create({
        title: 'Blocked Prompt',
        slug: 'blocked-prompt',
        level: 'vibe-coder',
        isActive: true,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })
})
