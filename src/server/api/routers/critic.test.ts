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
        userId: verifiedUser.profile?.id ?? '',
        title: 'Verified Critic',
        verifiedAt: new Date(),
        isActive: true,
      },
      {
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
  })

  it('returns critic profile with comments', async () => {
    const db = getTestDb()
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({
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
    expect(result.comments).toHaveLength(1)
  })

  it('verifies and unverifies critics as admin', async () => {
    const db = getTestDb()
    const admin = await seedUser({ role: 'admin' })
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({
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
})
