import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanTestDatabase, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createAuthUser, createTestCaller, seedUser } from '~/test/trpc'

describe('userRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('creates and fetches profile for authenticated user', async () => {
    const authUser = createAuthUser(crypto.randomUUID(), 'new-user@example.com')
    const caller = createTestCaller(authUser)

    const created = await caller.user.createProfile({
      displayName: 'New User',
      bio: 'Builder',
      company: 'Preseason',
    })
    expect(created?.displayName).toBe('New User')

    const profile = await caller.user.getProfile()
    expect(profile?.email).toBe('new-user@example.com')
    expect(profile?.bio).toBe('Builder')
  })

  it('updates own profile fields', async () => {
    const user = await seedUser({ role: 'user' })
    const caller = createTestCaller(user.authUser)

    const updated = await caller.user.updateProfile({
      displayName: 'Updated Name',
      website: 'https://example.com',
      company: 'Updated Co',
    })
    expect(updated.displayName).toBe('Updated Name')
    expect(updated.website).toBe('https://example.com')
    expect(updated.company).toBe('Updated Co')
  })

  it('requires authentication', async () => {
    const caller = createTestCaller(null)
    await expect(caller.user.getProfile()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<TRPCError>)
  })
})
