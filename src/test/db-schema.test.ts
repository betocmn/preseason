import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { userProfiles } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from './db'

describe('Database Schema', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('should create and query user profiles', async () => {
    const db = getTestDb()
    const userId = crypto.randomUUID()

    await db.insert(userProfiles).values({
      id: userId,
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'user',
    })

    const profiles = await db.select().from(userProfiles)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.email).toBe('test@example.com')
    expect(profiles[0]?.displayName).toBe('Test User')
    expect(profiles[0]?.role).toBe('user')
  })

  it('should enforce unique email constraint', async () => {
    const db = getTestDb()

    await db.insert(userProfiles).values({
      id: crypto.randomUUID(),
      email: 'dupe@example.com',
      displayName: 'User 1',
      role: 'user',
    })

    await expect(
      db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        email: 'dupe@example.com',
        displayName: 'User 2',
        role: 'user',
      }),
    ).rejects.toThrow()
  })

  it('should support all user roles', async () => {
    const db = getTestDb()
    const roles = ['admin', 'provider', 'critic', 'user'] as const

    for (const role of roles) {
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        email: `${role}@example.com`,
        displayName: `${role} user`,
        role,
      })
    }

    const profiles = await db.select().from(userProfiles)
    expect(profiles).toHaveLength(4)
  })
})
