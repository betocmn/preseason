import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { userProfiles } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from './db'

describe('Database Schema Tests', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('should insert and query a user profile', async () => {
    const db = getTestDb()

    const inserted = await db
      .insert(userProfiles)
      .values({
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        birthDate: '1990-01-01',
        role: 'admin',
      })
      .returning()

    expect(inserted).toHaveLength(1)
    expect(inserted[0]?.email).toBe('test@example.com')
    expect(inserted[0]?.firstName).toBe('Test')
    expect(inserted[0]?.lastName).toBe('User')
    expect(inserted[0]?.birthDate).toBe('1990-01-01')
    expect(inserted[0]?.role).toBe('admin')

    const queried = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'))

    expect(queried).toHaveLength(1)
    expect(queried[0]?.id).toBe(inserted[0]?.id)
  })

  it('should set createdAt timestamp automatically', async () => {
    const db = getTestDb()

    const result = await db
      .insert(userProfiles)
      .values({
        id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        email: 'timestamp@example.com',
        firstName: 'Timestamp',
        lastName: 'Test',
        birthDate: '1990-01-01',
        role: 'producer',
      })
      .returning()

    expect(result[0]?.createdAt).toBeInstanceOf(Date)
  })

  it('should enforce unique email constraint', async () => {
    const db = getTestDb()

    await db.insert(userProfiles).values({
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      email: 'duplicate@example.com',
      firstName: 'First',
      lastName: 'User',
      birthDate: '1990-01-01',
      role: 'attendee',
    })

    await expect(
      db.insert(userProfiles).values({
        id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
        email: 'duplicate@example.com',
        firstName: 'Second',
        lastName: 'User',
        birthDate: '1990-01-01',
        role: 'attendee',
      }),
    ).rejects.toThrow()
  })

  it('should accept all valid role enum values', async () => {
    const db = getTestDb()
    const roles = ['admin', 'producer', 'attendee'] as const

    for (const [index, role] of roles.entries()) {
      const id = `e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a${(10 + index).toString()}`
      await db.insert(userProfiles).values({
        id,
        email: `${role}@example.com`,
        firstName: 'Role',
        lastName: 'Test',
        birthDate: '1990-01-01',
        role,
      })
    }

    const profiles = await db.select().from(userProfiles)
    expect(profiles).toHaveLength(3)
    expect(profiles.map((p) => p.role).sort()).toEqual(['admin', 'attendee', 'producer'])
  })

  it('should default role to attendee when not specified', async () => {
    const db = getTestDb()

    const result = await db
      .insert(userProfiles)
      .values({
        id: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        email: 'default-role@example.com',
        firstName: 'Default',
        lastName: 'Role',
        birthDate: '1990-01-01',
      })
      .returning()

    expect(result[0]?.role).toBe('attendee')
  })
})
