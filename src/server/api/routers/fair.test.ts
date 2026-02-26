import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { fairProducers, fairs, fairWines, producers, userProfiles, wines } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

const ADMIN_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
const PRODUCER_USER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
const ATTENDEE_USER_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'
const OTHER_PRODUCER_USER_ID = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44'

function createPublicCaller() {
  return createCaller({
    db: getTestDb(),
    user: null,
    headers: new Headers(),
  })
}

function createAuthenticatedCaller(userId = ADMIN_USER_ID) {
  return createCaller({
    db: getTestDb(),
    // biome-ignore lint/suspicious/noExplicitAny: mock Supabase user for testing
    user: { id: userId } as any,
    headers: new Headers(),
  })
}

async function createTestUserWithRole(
  id: string,
  email: string,
  role: 'admin' | 'producer' | 'attendee',
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

async function createTestProducer(overrides: Partial<typeof producers.$inferInsert> = {}) {
  const db = getTestDb()
  const result = await db
    .insert(producers)
    .values({
      name: 'Test Winery',
      ...overrides,
    })
    .returning()
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
    .values({
      name: 'Test Wine',
      type: 'red',
      producerId,
      ...overrides,
    })
    .returning()
  const wine = result[0]
  if (!wine) throw new Error('Failed to create test wine')
  return wine
}

async function createTestFair(overrides: Partial<typeof fairs.$inferInsert> = {}) {
  const db = getTestDb()
  const result = await db
    .insert(fairs)
    .values({
      name: 'Test Fair',
      startDate: '2025-06-01',
      endDate: '2025-06-03',
      ...overrides,
    })
    .returning()
  const fair = result[0]
  if (!fair) throw new Error('Failed to create test fair')
  return fair
}

describe('Fair Router', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('list', () => {
    it('should return all fairs', async () => {
      await createTestFair({ name: 'Fair A' })
      await createTestFair({ name: 'Fair B' })

      const caller = createPublicCaller()
      const result = await caller.fair.list()

      expect(result).toHaveLength(2)
    })

    it('should filter active-only fairs', async () => {
      await createTestFair({ name: 'Active Fair', isActive: true })
      await createTestFair({ name: 'Inactive Fair', isActive: false })

      const caller = createPublicCaller()
      const result = await caller.fair.list({ activeOnly: true })

      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('Active Fair')
    })

    it('should return empty array when no fairs exist', async () => {
      const caller = createPublicCaller()
      const result = await caller.fair.list()

      expect(result).toHaveLength(0)
    })
  })

  describe('getById', () => {
    it('should return fair with wines and producers', async () => {
      const fair = await createTestFair({ name: 'Wine Fest' })
      const producer = await createTestProducer({ name: 'My Winery' })
      const wine = await createTestWine(producer.id, { name: 'Great Red' })

      const db = getTestDb()
      await db
        .insert(fairProducers)
        .values({ fairId: fair.id, producerId: producer.id, boothNumber: 'A1' })
      await db.insert(fairWines).values({ fairId: fair.id, wineId: wine.id })

      const caller = createPublicCaller()
      const result = await caller.fair.getById({ id: fair.id })

      expect(result.name).toBe('Wine Fest')
      expect(result.fairProducers).toHaveLength(1)
      expect(result.fairProducers[0]?.producer.name).toBe('My Winery')
      expect(result.fairProducers[0]?.boothNumber).toBe('A1')
      expect(result.fairWines).toHaveLength(1)
      expect(result.fairWines[0]?.wine.name).toBe('Great Red')
    })

    it('should return fair with empty arrays when no wines or producers', async () => {
      const fair = await createTestFair()

      const caller = createPublicCaller()
      const result = await caller.fair.getById({ id: fair.id })

      expect(result.fairProducers).toHaveLength(0)
      expect(result.fairWines).toHaveLength(0)
    })

    it('should throw NOT_FOUND for non-existent ID', async () => {
      const caller = createPublicCaller()

      try {
        await caller.fair.getById({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('create', () => {
    it('should allow admin to create a fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.create({
        name: 'New Fair',
        location: 'Sofia',
        startDate: '2025-09-01',
        endDate: '2025-09-03',
      })

      expect(result).toBeDefined()
      expect(result?.name).toBe('New Fair')
      expect(result?.location).toBe('Sofia')
      expect(result?.isActive).toBe(false)
    })

    it('should reject producer role', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.fair.create({
          name: 'Fair',
          startDate: '2025-09-01',
          endDate: '2025-09-03',
        })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject attendee role', async () => {
      await createTestUserWithRole(ATTENDEE_USER_ID, 'attendee@test.com', 'attendee')

      const caller = createAuthenticatedCaller(ATTENDEE_USER_ID)

      try {
        await caller.fair.create({
          name: 'Fair',
          startDate: '2025-09-01',
          endDate: '2025-09-03',
        })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.fair.create({
          name: 'Fair',
          startDate: '2025-09-01',
          endDate: '2025-09-03',
        })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should reject endDate before startDate', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      await expect(
        caller.fair.create({
          name: 'Bad Fair',
          startDate: '2025-09-03',
          endDate: '2025-09-01',
        }),
      ).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('should allow admin to update a fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair({ name: 'Old Name' })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.update({
        id: fair.id,
        name: 'New Name',
        isActive: true,
      })

      expect(result?.name).toBe('New Name')
      expect(result?.isActive).toBe(true)
    })

    it('should reject non-admin', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const fair = await createTestFair()

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.fair.update({ id: fair.id, name: 'Hacked' })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND for non-existent fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.fair.update({
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
          name: 'Ghost',
        })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('delete', () => {
    it('should allow admin to delete a fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.delete({ id: fair.id })

      expect(result?.id).toBe(fair.id)
    })

    it('should cascade delete junction records', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const db = getTestDb()
      await db.insert(fairProducers).values({ fairId: fair.id, producerId: producer.id })
      await db.insert(fairWines).values({ fairId: fair.id, wineId: wine.id })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      await caller.fair.delete({ id: fair.id })

      // Verify junction records are gone
      const remainingFairProducers = await db.select().from(fairProducers)
      const remainingFairWines = await db.select().from(fairWines)
      expect(remainingFairProducers).toHaveLength(0)
      expect(remainingFairWines).toHaveLength(0)
    })

    it('should reject non-admin', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const fair = await createTestFair()

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.fair.delete({ id: fair.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND for non-existent fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.fair.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('addWine', () => {
    it('should allow admin to add any wine to a fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.addWine({ fairId: fair.id, wineId: wine.id })

      expect(result).toBeDefined()
      expect(result?.fairId).toBe(fair.id)
      expect(result?.wineId).toBe(wine.id)
    })

    it('should allow producer to add their own wine', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })
      const wine = await createTestWine(producer.id)
      const fair = await createTestFair()

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)
      const result = await caller.fair.addWine({ fairId: fair.id, wineId: wine.id })

      expect(result).toBeDefined()
    })

    it('should prevent producer from adding another producer wine', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      await createTestUserWithRole(OTHER_PRODUCER_USER_ID, 'other@test.com', 'producer')
      const otherProducer = await createTestProducer({ userId: OTHER_PRODUCER_USER_ID })
      const wine = await createTestWine(otherProducer.id)
      const fair = await createTestFair()

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.fair.addWine({ fairId: fair.id, wineId: wine.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject duplicate wine-fair combination', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      await caller.fair.addWine({ fairId: fair.id, wineId: wine.id })

      try {
        await caller.fair.addWine({ fairId: fair.id, wineId: wine.id })
        expect.unreachable('Should have thrown CONFLICT')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('CONFLICT')
      }
    })

    it('should reject attendee role', async () => {
      await createTestUserWithRole(ATTENDEE_USER_ID, 'attendee@test.com', 'attendee')
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(ATTENDEE_USER_ID)

      try {
        await caller.fair.addWine({ fairId: fair.id, wineId: wine.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })
  })

  describe('removeWine', () => {
    it('should allow admin to remove a wine from a fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const db = getTestDb()
      await db.insert(fairWines).values({ fairId: fair.id, wineId: wine.id })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.removeWine({ fairId: fair.id, wineId: wine.id })

      expect(result).toBeDefined()
    })

    it('should allow producer to remove their own wine', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })
      const wine = await createTestWine(producer.id)
      const fair = await createTestFair()

      const db = getTestDb()
      await db.insert(fairWines).values({ fairId: fair.id, wineId: wine.id })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)
      const result = await caller.fair.removeWine({ fairId: fair.id, wineId: wine.id })

      expect(result).toBeDefined()
    })

    it('should throw NOT_FOUND when wine not in fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.fair.removeWine({ fairId: fair.id, wineId: wine.id })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('addProducer', () => {
    it('should allow admin to add producer to fair with booth number', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.addProducer({
        fairId: fair.id,
        producerId: producer.id,
        boothNumber: 'A1',
      })

      expect(result).toBeDefined()
      expect(result?.boothNumber).toBe('A1')
    })

    it('should reject non-admin', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const fair = await createTestFair()
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.fair.addProducer({ fairId: fair.id, producerId: producer.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject duplicate producer-fair combination', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      await caller.fair.addProducer({ fairId: fair.id, producerId: producer.id })

      try {
        await caller.fair.addProducer({ fairId: fair.id, producerId: producer.id })
        expect.unreachable('Should have thrown CONFLICT')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('CONFLICT')
      }
    })
  })

  describe('removeProducer', () => {
    it('should allow admin to remove producer from fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()

      const db = getTestDb()
      await db.insert(fairProducers).values({ fairId: fair.id, producerId: producer.id })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.fair.removeProducer({
        fairId: fair.id,
        producerId: producer.id,
      })

      expect(result).toBeDefined()
    })

    it('should reject non-admin', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const fair = await createTestFair()
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })

      const db = getTestDb()
      await db.insert(fairProducers).values({ fairId: fair.id, producerId: producer.id })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.fair.removeProducer({ fairId: fair.id, producerId: producer.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND when producer not in fair', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const fair = await createTestFair()
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.fair.removeProducer({ fairId: fair.id, producerId: producer.id })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })
})
