import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { favorites, producers, regions, userProfiles, wines } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

const USER_A_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const USER_B_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'

function createPublicCaller() {
  return createCaller({
    db: getTestDb(),
    user: null,
    headers: new Headers(),
  })
}

function createAuthenticatedCaller(userId = USER_A_ID) {
  return createCaller({
    db: getTestDb(),
    // biome-ignore lint/suspicious/noExplicitAny: mock Supabase user for testing
    user: { id: userId } as any,
    headers: new Headers(),
  })
}

async function createTestUser(
  id: string,
  email: string,
  role: 'admin' | 'producer' | 'attendee' = 'attendee',
) {
  const db = getTestDb()
  await db.insert(userProfiles).values({
    id,
    email,
    firstName: 'Test',
    lastName: 'User',
    birthDate: '1990-01-01',
    role,
  })
}

async function createTestProducer(name = 'Test Winery') {
  const db = getTestDb()
  const result = await db.insert(producers).values({ name }).returning()
  const producer = result[0]
  if (!producer) throw new Error('Failed to create test producer')
  return producer
}

async function createTestWine(
  producerId: string,
  overrides: Partial<typeof wines.$inferInsert> = {},
) {
  const db = getTestDb()
  const result = await db
    .insert(wines)
    .values({ name: 'Test Wine', type: 'red', producerId, ...overrides })
    .returning()
  const wine = result[0]
  if (!wine) throw new Error('Failed to create test wine')
  return wine
}

async function createTestFavorite(userId: string, wineId: string) {
  const db = getTestDb()
  const result = await db.insert(favorites).values({ userId, wineId }).returning()
  const favorite = result[0]
  if (!favorite) throw new Error('Failed to create test favorite')
  return favorite
}

describe('Favorite Router', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('toggle', () => {
    it('should add favorite when not favorited', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.toggle({ wineId: wine.id })

      expect(result.favorited).toBe(true)
    })

    it('should remove favorite when already favorited', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestFavorite(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.toggle({ wineId: wine.id })

      expect(result.favorited).toBe(false)
    })

    it('should be idempotent on double-toggle', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const r1 = await caller.favorite.toggle({ wineId: wine.id })
      const r2 = await caller.favorite.toggle({ wineId: wine.id })
      const r3 = await caller.favorite.toggle({ wineId: wine.id })

      expect(r1.favorited).toBe(true)
      expect(r2.favorited).toBe(false)
      expect(r3.favorited).toBe(true)
    })

    it('should allow multiple users to favorite same wine', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const callerA = createAuthenticatedCaller(USER_A_ID)
      const callerB = createAuthenticatedCaller(USER_B_ID)
      const resultA = await callerA.favorite.toggle({ wineId: wine.id })
      const resultB = await callerB.favorite.toggle({ wineId: wine.id })

      expect(resultA.favorited).toBe(true)
      expect(resultB.favorited).toBe(true)
    })

    it('should reject unauthenticated request', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createPublicCaller()

      try {
        await caller.favorite.toggle({ wineId: wine.id })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('getMyFavorites', () => {
    it('should return user favorites with wine details', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const region = await getTestDb()
        .insert(regions)
        .values({ name: 'Thracian Valley' })
        .returning()
      const producer = await createTestProducer('Bessa Valley')
      const wine = await createTestWine(producer.id, {
        name: 'Enira',
        regionId: region[0]?.id,
      })
      await createTestFavorite(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.getMyFavorites({})

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.items[0]?.wineName).toBe('Enira')
      expect(result.items[0]?.producerName).toBe('Bessa Valley')
      expect(result.items[0]?.regionName).toBe('Thracian Valley')
    })

    it('should paginate', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine1 = await createTestWine(producer.id, { name: 'Wine A' })
      const wine2 = await createTestWine(producer.id, { name: 'Wine B' })
      const wine3 = await createTestWine(producer.id, { name: 'Wine C' })
      await createTestFavorite(USER_A_ID, wine1.id)
      await createTestFavorite(USER_A_ID, wine2.id)
      await createTestFavorite(USER_A_ID, wine3.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const page1 = await caller.favorite.getMyFavorites({ limit: 2, offset: 0 })
      const page2 = await caller.favorite.getMyFavorites({ limit: 2, offset: 2 })

      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(3)
      expect(page2.items).toHaveLength(1)
    })

    it('should not include other users favorites', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine1 = await createTestWine(producer.id, { name: 'Wine A' })
      const wine2 = await createTestWine(producer.id, { name: 'Wine B' })
      await createTestFavorite(USER_A_ID, wine1.id)
      await createTestFavorite(USER_B_ID, wine2.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.getMyFavorites({})

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wineName).toBe('Wine A')
    })

    it('should order by createdAt descending', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine1 = await createTestWine(producer.id, { name: 'Old Favorite' })
      const wine2 = await createTestWine(producer.id, { name: 'New Favorite' })
      await createTestFavorite(USER_A_ID, wine1.id)
      await new Promise((r) => setTimeout(r, 50))
      await createTestFavorite(USER_A_ID, wine2.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.getMyFavorites({})

      expect(result.items[0]?.wineName).toBe('New Favorite')
      expect(result.items[1]?.wineName).toBe('Old Favorite')
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.favorite.getMyFavorites({})
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('isFavorited', () => {
    it('should return true when wine is favorited', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestFavorite(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.isFavorited({ wineId: wine.id })

      expect(result.favorited).toBe(true)
    })

    it('should return false when wine is not favorited', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.favorite.isFavorited({ wineId: wine.id })

      expect(result.favorited).toBe(false)
    })

    it('should return false after unfavoriting', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      await caller.favorite.toggle({ wineId: wine.id })
      await caller.favorite.toggle({ wineId: wine.id })

      const result = await caller.favorite.isFavorited({ wineId: wine.id })
      expect(result.favorited).toBe(false)
    })

    it('should reject unauthenticated request', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createPublicCaller()

      try {
        await caller.favorite.isFavorited({ wineId: wine.id })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('cascade deletes', () => {
    it('should cascade delete favorites when wine is deleted', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestFavorite(USER_A_ID, wine.id)

      const db = getTestDb()
      await db.delete(wines).where(eq(wines.id, wine.id))

      const remaining = await db.select().from(favorites)
      expect(remaining).toHaveLength(0)
    })

    it('should cascade delete favorites when user is deleted', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestFavorite(USER_A_ID, wine.id)

      const db = getTestDb()
      await db.delete(userProfiles).where(eq(userProfiles.id, USER_A_ID))

      const remaining = await db.select().from(favorites)
      expect(remaining).toHaveLength(0)
    })
  })
})
