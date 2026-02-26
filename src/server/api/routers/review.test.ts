import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { producers, reviews, userProfiles, wines } from '~/server/db/schema'
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

async function createTestWine(producerId: string, name = 'Test Wine') {
  const db = getTestDb()
  const result = await db.insert(wines).values({ name, type: 'red', producerId }).returning()
  const wine = result[0]
  if (!wine) throw new Error('Failed to create test wine')
  return wine
}

async function createTestReview(
  userId: string,
  wineId: string,
  overrides: Partial<typeof reviews.$inferInsert> = {},
) {
  const db = getTestDb()
  const result = await db
    .insert(reviews)
    .values({ userId, wineId, rating: 4, ...overrides })
    .returning()
  const review = result[0]
  if (!review) throw new Error('Failed to create test review')
  return review
}

describe('Review Router', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('create', () => {
    it('should allow any authenticated user to create a review', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.create({
        wineId: wine.id,
        rating: 5,
        notes: 'Excellent wine!',
      })

      expect(result).toBeDefined()
      expect(result?.rating).toBe(5)
      expect(result?.notes).toBe('Excellent wine!')
      expect(result?.wineId).toBe(wine.id)
      expect(result?.userId).toBe(USER_A_ID)
    })

    it('should create review with all characteristic ratings', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.create({
        wineId: wine.id,
        rating: 4,
        colorRating: 5,
        aromaRating: 4,
        acidityRating: 3,
        tanninsRating: 4,
        bodyRating: 5,
        flavorRating: 4,
      })

      expect(result?.colorRating).toBe(5)
      expect(result?.aromaRating).toBe(4)
      expect(result?.acidityRating).toBe(3)
      expect(result?.tanninsRating).toBe(4)
      expect(result?.bodyRating).toBe(5)
      expect(result?.flavorRating).toBe(4)
    })

    it('should create review with only required fields', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.create({
        wineId: wine.id,
        rating: 3,
      })

      expect(result?.rating).toBe(3)
      expect(result?.notes).toBeNull()
      expect(result?.colorRating).toBeNull()
      expect(result?.aromaRating).toBeNull()
    })

    it('should return CONFLICT for duplicate user-wine review', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      await caller.review.create({ wineId: wine.id, rating: 4 })

      try {
        await caller.review.create({ wineId: wine.id, rating: 5 })
        expect.unreachable('Should have thrown CONFLICT')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('CONFLICT')
      }
    })

    it('should reject unauthenticated request', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createPublicCaller()

      try {
        await caller.review.create({ wineId: wine.id, rating: 4 })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should reject invalid rating values', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)

      await expect(caller.review.create({ wineId: wine.id, rating: 0 })).rejects.toThrow()
      await expect(caller.review.create({ wineId: wine.id, rating: 6 })).rejects.toThrow()
    })

    it('should reject invalid characteristic rating values', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(USER_A_ID)

      await expect(
        caller.review.create({ wineId: wine.id, rating: 4, colorRating: 0 }),
      ).rejects.toThrow()
      await expect(
        caller.review.create({ wineId: wine.id, rating: 4, bodyRating: 6 }),
      ).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('should allow owner to update rating', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id, { rating: 3 })

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.update({ id: review.id, rating: 5 })

      expect(result?.rating).toBe(5)
    })

    it('should allow owner to update notes and characteristics', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.update({
        id: review.id,
        notes: 'Updated notes',
        colorRating: 5,
        aromaRating: 3,
      })

      expect(result?.notes).toBe('Updated notes')
      expect(result?.colorRating).toBe(5)
      expect(result?.aromaRating).toBe(3)
    })

    it('should allow setting nullable fields to null', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id, {
        notes: 'Some notes',
        colorRating: 4,
      })

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.update({
        id: review.id,
        notes: null,
        colorRating: null,
      })

      expect(result?.notes).toBeNull()
      expect(result?.colorRating).toBeNull()
    })

    it('should reject update by different user', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_B_ID)

      try {
        await caller.review.update({ id: review.id, rating: 1 })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND for non-existent review', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const caller = createAuthenticatedCaller(USER_A_ID)

      try {
        await caller.review.update({
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
          rating: 5,
        })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.review.update({
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
          rating: 5,
        })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should return existing when no update fields provided', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id, { rating: 4 })

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.update({ id: review.id })

      expect(result?.rating).toBe(4)
    })
  })

  describe('delete', () => {
    it('should allow owner to delete their review', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.delete({ id: review.id })

      expect(result?.id).toBe(review.id)
    })

    it('should reject delete by different user', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id)

      const caller = createAuthenticatedCaller(USER_B_ID)

      try {
        await caller.review.delete({ id: review.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND for non-existent review', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const caller = createAuthenticatedCaller(USER_A_ID)

      try {
        await caller.review.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.review.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('getByWine', () => {
    it('should return all reviews for a wine with reviewer info', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id, { rating: 5 })
      await createTestReview(USER_B_ID, wine.id, { rating: 3 })

      const caller = createPublicCaller()
      const result = await caller.review.getByWine({ wineId: wine.id })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.items[0]?.reviewerFirstName).toBe('Test')
      expect(result.items[0]?.reviewerLastName).toBe('User')
    })

    it('should paginate reviews', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id)
      await createTestReview(USER_B_ID, wine.id)

      const caller = createPublicCaller()
      const page1 = await caller.review.getByWine({ wineId: wine.id, limit: 1, offset: 0 })
      const page2 = await caller.review.getByWine({ wineId: wine.id, limit: 1, offset: 1 })

      expect(page1.items).toHaveLength(1)
      expect(page1.total).toBe(2)
      expect(page2.items).toHaveLength(1)
    })

    it('should return empty when no reviews', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createPublicCaller()
      const result = await caller.review.getByWine({ wineId: wine.id })

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should order by createdAt descending', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id, { rating: 3 })
      await new Promise((r) => setTimeout(r, 50))
      await createTestReview(USER_B_ID, wine.id, { rating: 5 })

      const caller = createPublicCaller()
      const result = await caller.review.getByWine({ wineId: wine.id })

      expect(result.items[0]?.review.rating).toBe(5)
      expect(result.items[1]?.review.rating).toBe(3)
    })
  })

  describe('getMyReviews', () => {
    it('should return current user reviews with wine details', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer('Bessa Valley')
      const wine = await createTestWine(producer.id, 'Enira')
      await createTestReview(USER_A_ID, wine.id, { rating: 5 })

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.getMyReviews({})

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.items[0]?.wineName).toBe('Enira')
      expect(result.items[0]?.producerName).toBe('Bessa Valley')
    })

    it('should paginate', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine1 = await createTestWine(producer.id, 'Wine A')
      const wine2 = await createTestWine(producer.id, 'Wine B')
      const wine3 = await createTestWine(producer.id, 'Wine C')
      await createTestReview(USER_A_ID, wine1.id)
      await createTestReview(USER_A_ID, wine2.id)
      await createTestReview(USER_A_ID, wine3.id)

      const caller = createAuthenticatedCaller(USER_A_ID)
      const page1 = await caller.review.getMyReviews({ limit: 2, offset: 0 })
      const page2 = await caller.review.getMyReviews({ limit: 2, offset: 2 })

      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(3)
      expect(page2.items).toHaveLength(1)
    })

    it('should not include other users reviews', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id, { rating: 5 })
      const wine2 = await createTestWine(producer.id, 'Other Wine')
      await createTestReview(USER_B_ID, wine2.id, { rating: 3 })

      const caller = createAuthenticatedCaller(USER_A_ID)
      const result = await caller.review.getMyReviews({})

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.review.userId).toBe(USER_A_ID)
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.review.getMyReviews({})
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })
  })

  describe('getByIdWithDetails', () => {
    it('should return review with full wine and user details', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer('Test Winery')
      const wine = await createTestWine(producer.id, 'Great Red')
      const review = await createTestReview(USER_A_ID, wine.id, {
        rating: 5,
        notes: 'Amazing!',
        colorRating: 4,
      })

      const caller = createPublicCaller()
      const result = await caller.review.getByIdWithDetails({ id: review.id })

      expect(result.rating).toBe(5)
      expect(result.notes).toBe('Amazing!')
      expect(result.colorRating).toBe(4)
      expect(result.wine.name).toBe('Great Red')
      expect(result.wine.producer.name).toBe('Test Winery')
      expect(result.user.firstName).toBe('Test')
      expect(result.user.lastName).toBe('User')
    })

    it('should return user info with limited fields', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const review = await createTestReview(USER_A_ID, wine.id)

      const caller = createPublicCaller()
      const result = await caller.review.getByIdWithDetails({ id: review.id })

      expect(result.user).toHaveProperty('id')
      expect(result.user).toHaveProperty('firstName')
      expect(result.user).toHaveProperty('lastName')
      expect(result.user).not.toHaveProperty('email')
      expect(result.user).not.toHaveProperty('birthDate')
    })

    it('should throw NOT_FOUND for non-existent review', async () => {
      const caller = createPublicCaller()

      try {
        await caller.review.getByIdWithDetails({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('getStats', () => {
    it('should return correct average and count for multiple reviews', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const USER_C_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'
      await createTestUser(USER_C_ID, 'user-c@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id, { rating: 3 })
      await createTestReview(USER_B_ID, wine.id, { rating: 4 })
      await createTestReview(USER_C_ID, wine.id, { rating: 5 })

      const caller = createPublicCaller()
      const result = await caller.review.getStats({ wineId: wine.id })

      expect(result.averageRating).toBe(4)
      expect(result.reviewCount).toBe(3)
    })

    it('should return zero when no reviews exist', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createPublicCaller()
      const result = await caller.review.getStats({ wineId: wine.id })

      expect(result.averageRating).toBe(0)
      expect(result.reviewCount).toBe(0)
    })

    it('should only count reviews for the specified wine', async () => {
      await createTestUser(USER_A_ID, 'user-a@test.com')
      await createTestUser(USER_B_ID, 'user-b@test.com')
      const producer = await createTestProducer()
      const wine1 = await createTestWine(producer.id, 'Wine 1')
      const wine2 = await createTestWine(producer.id, 'Wine 2')
      await createTestReview(USER_A_ID, wine1.id, { rating: 5 })
      await createTestReview(USER_B_ID, wine2.id, { rating: 1 })

      const caller = createPublicCaller()
      const result = await caller.review.getStats({ wineId: wine1.id })

      expect(result.averageRating).toBe(5)
      expect(result.reviewCount).toBe(1)
    })

    it('should work as public procedure without auth', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createPublicCaller()
      const result = await caller.review.getStats({ wineId: wine.id })

      expect(result).toHaveProperty('averageRating')
      expect(result).toHaveProperty('reviewCount')
    })
  })

  describe('cascade deletes', () => {
    it('should cascade delete reviews when wine is deleted', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id)

      const db = getTestDb()
      await db.delete(wines).where(eq(wines.id, wine.id))

      const remaining = await db.select().from(reviews)
      expect(remaining).toHaveLength(0)
    })

    it('should cascade delete reviews when user is deleted', async () => {
      await createTestUser(USER_A_ID, 'user@test.com')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      await createTestReview(USER_A_ID, wine.id)

      const db = getTestDb()
      await db.delete(userProfiles).where(eq(userProfiles.id, USER_A_ID))

      const remaining = await db.select().from(reviews)
      expect(remaining).toHaveLength(0)
    })
  })
})
