import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { comments, criticProfiles } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('criticRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists only verified active critics', async () => {
    const db = getTestDb()
    const verifiedUser = await seedUser({ role: 'critic' })
    const unverifiedUser = await seedUser({ role: 'critic' })

    await db.insert(criticProfiles).values([
      {
        slug: 'verified-critic',
        userId: verifiedUser.profile?.id ?? '',
        title: 'Verified Critic',
        verifiedAt: new Date(),
        isActive: true,
      },
      {
        slug: 'unverified-critic',
        userId: unverifiedUser.profile?.id ?? '',
        title: 'Unverified Critic',
        verifiedAt: null,
        isActive: true,
      },
    ])

    const caller = createTestCaller(null)
    const critics = await caller.critic.list()
    expect(critics).toHaveLength(1)
    expect(critics[0]?.title).toBe('Verified Critic')
    expect(critics[0]?.user).not.toHaveProperty('email')
  })

  it('returns critic profile with comments', async () => {
    const db = getTestDb()
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({
          slug: 'reviewer',
          userId: criticUser.profile?.id ?? '',
          title: 'Reviewer',
          verifiedAt: new Date(),
        })
        .returning()
    )[0]

    await db.insert(comments).values({
      criticId: critic?.id ?? '',
      targetType: 'tool',
      targetId: crypto.randomUUID(),
      content: 'Solid recommendation',
    })

    const caller = createTestCaller(null)
    const result = await caller.critic.getById({ id: critic?.id ?? '' })
    expect(result.id).toBe(critic?.id)
    expect(result.commentTargets).toHaveLength(0)
    expect(result.user).not.toHaveProperty('email')
  })

  it('verifies and unverifies critics as admin', async () => {
    const db = getTestDb()
    const admin = await seedUser({ role: 'admin' })
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({
          slug: 'pending-critic',
          userId: criticUser.profile?.id ?? '',
          title: 'Pending Critic',
          verifiedAt: null,
        })
        .returning()
    )[0]

    const caller = createTestCaller(admin.authUser)
    const verified = await caller.critic.verify({ id: critic?.id ?? '' })
    expect(verified.verifiedAt).not.toBeNull()
    expect(verified.verifiedBy).toBe(admin.profile?.id)

    const unverified = await caller.critic.unverify({ id: critic?.id ?? '' })
    expect(unverified.verifiedAt).toBeNull()
    expect(unverified.verifiedBy).toBeNull()
  })

  it('upserts own critic profile for critic role', async () => {
    const critic = await seedUser({ role: 'critic' })
    const caller = createTestCaller(critic.authUser)

    const created = await caller.critic.updateOwn({
      title: 'Backend Specialist',
      expertiseAreas: ['api', 'database'],
    })
    expect(created?.title).toBe('Backend Specialist')

    const updated = await caller.critic.updateOwn({
      excludedCategories: ['payments'],
      isActive: true,
    })
    expect(updated?.id).toBe(created?.id)
    expect(updated?.excludedCategories).toEqual(['payments'])
  })

  it('rejects updateOwn for non-critic users', async () => {
    const user = await seedUser({ role: 'user' })
    const caller = createTestCaller(user.authUser)

    await expect(
      caller.critic.updateOwn({
        title: 'Should fail',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('supports admin CRUD for critics', async () => {
    const admin = await seedUser({ role: 'admin' })
    const caller = createTestCaller(admin.authUser)

    const created = await caller.critic.adminCreate({
      displayName: 'Jane Doe',
      email: 'jane@example.com',
      avatarUrl: '/critics/jane-doe.png',
      company: 'Acme Inc',
      title: 'CTO',
      expertiseAreas: ['infrastructure', 'databases'],
      isActive: true,
      verified: true,
    })

    expect(created.user.displayName).toBe('Jane Doe')
    expect(created.user.avatarUrl).toBe('/critics/jane-doe.png')
    expect(created.title).toBe('CTO')
    expect(created.expertiseAreas).toEqual(['infrastructure', 'databases'])
    expect(created.verifiedAt).not.toBeNull()

    const listed = await caller.critic.adminList()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.user.email).toBe('jane@example.com')

    const fetched = await caller.critic.adminGetById({ id: created.id })
    expect(fetched.user.email).toBe('jane@example.com')
    expect(fetched.title).toBe('CTO')

    const updated = await caller.critic.adminUpdate({
      id: created.id,
      title: 'VP of Engineering',
      company: 'New Corp',
      avatarUrl: '/critics/jane-updated.png',
    })

    expect(updated.title).toBe('VP of Engineering')
    expect(updated.user.company).toBe('New Corp')
    expect(updated.user.avatarUrl).toBe('/critics/jane-updated.png')

    const deleted = await caller.critic.adminDelete({ id: created.id })
    expect(deleted.success).toBe(true)

    const afterDelete = await caller.critic.adminList()
    expect(afterDelete).toHaveLength(0)
  })

  it('rejects invalid website URLs in adminCreate and adminUpdate', async () => {
    const admin = await seedUser({ role: 'admin' })
    const caller = createTestCaller(admin.authUser)

    await expect(
      caller.critic.adminCreate({
        displayName: 'Bad URL',
        email: 'badurl@example.com',
        website: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' } satisfies Partial<TRPCError>)

    await expect(
      caller.critic.adminCreate({
        displayName: 'Bad URL 2',
        email: 'badurl2@example.com',
        website: 'not-a-url',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' } satisfies Partial<TRPCError>)

    const created = await caller.critic.adminCreate({
      displayName: 'Good URL',
      email: 'goodurl@example.com',
      website: 'https://example.com',
    })
    expect(created.user.website).toBe('https://example.com')

    await expect(
      caller.critic.adminUpdate({
        id: created.id,
        website: 'javascript:alert(1)',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' } satisfies Partial<TRPCError>)

    const updated = await caller.critic.adminUpdate({ id: created.id, website: null })
    expect(updated.user.website).toBeNull()
  })

  it('rejects non-admin critic CRUD mutations', async () => {
    const provider = await seedUser({ role: 'provider' })
    const caller = createTestCaller(provider.authUser)

    await expect(
      caller.critic.adminCreate({
        displayName: 'Should Fail',
        email: 'fail@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('returns email in adminGetById but not in public getById', async () => {
    const db = getTestDb()
    const admin = await seedUser({ role: 'admin' })
    const criticUser = await seedUser({ role: 'critic' })

    const critic = (
      await db
        .insert(criticProfiles)
        .values({
          slug: 'email-test-critic',
          userId: criticUser.profile?.id ?? '',
          title: 'Email Test',
          verifiedAt: new Date(),
        })
        .returning()
    )[0]

    const adminCaller = createTestCaller(admin.authUser)
    const adminResult = await adminCaller.critic.adminGetById({ id: critic?.id ?? '' })
    expect(adminResult.user).toHaveProperty('email')

    const publicCaller = createTestCaller(null)
    const publicResult = await publicCaller.critic.getById({ id: critic?.id ?? '' })
    expect(publicResult.user).not.toHaveProperty('email')
  })
})
