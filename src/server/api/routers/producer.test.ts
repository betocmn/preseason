import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { producers, regions, userProfiles, wines } from '~/server/db/schema'
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
      description: 'A test winery',
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

async function createTestRegion(name = 'Thracian Valley') {
  const db = getTestDb()
  const result = await db.insert(regions).values({ name }).returning()
  const region = result[0]
  if (!region) throw new Error('Failed to create test region')
  return region
}

describe('Producer Router', () => {
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
    it('should return all producers', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      await createTestProducer({ name: 'Winery A', userId: ADMIN_USER_ID })
      await createTestProducer({ name: 'Winery B' })

      const caller = createPublicCaller()
      const result = await caller.producer.list({})

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should paginate with limit and offset', async () => {
      await createTestProducer({ name: 'Winery A' })
      await createTestProducer({ name: 'Winery B' })
      await createTestProducer({ name: 'Winery C' })

      const caller = createPublicCaller()
      const page1 = await caller.producer.list({ limit: 2, offset: 0 })
      const page2 = await caller.producer.list({ limit: 2, offset: 2 })

      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(3)
      expect(page2.items).toHaveLength(1)
      expect(page2.total).toBe(3)
    })

    it('should filter by region', async () => {
      const thracian = await createTestRegion('Thracian Valley')
      const struma = await createTestRegion('Struma Valley')
      await createTestProducer({ name: 'Winery A', regionId: thracian.id })
      await createTestProducer({ name: 'Winery B', regionId: struma.id })
      await createTestProducer({ name: 'Winery C', regionId: thracian.id })

      const caller = createPublicCaller()
      const result = await caller.producer.list({ regionId: thracian.id })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should return empty array when no producers exist', async () => {
      const caller = createPublicCaller()
      const result = await caller.producer.list({})

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  describe('getById', () => {
    it('should return producer with wines', async () => {
      const producer = await createTestProducer({ name: 'My Winery' })
      await createTestWine(producer.id, { name: 'Red Blend' })
      await createTestWine(producer.id, { name: 'White Reserve' })

      const caller = createPublicCaller()
      const result = await caller.producer.getById({ id: producer.id })

      expect(result.name).toBe('My Winery')
      expect(result.wines).toHaveLength(2)
    })

    it('should return empty wines array for producer with no wines', async () => {
      const producer = await createTestProducer()

      const caller = createPublicCaller()
      const result = await caller.producer.getById({ id: producer.id })

      expect(result.wines).toHaveLength(0)
    })

    it('should throw NOT_FOUND for non-existent ID', async () => {
      const caller = createPublicCaller()

      try {
        await caller.producer.getById({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('create', () => {
    it('should allow admin to create a producer', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const region = await createTestRegion('Thracian Valley')

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.producer.create({
        name: 'New Winery',
        regionId: region.id,
      })

      expect(result).toBeDefined()
      expect(result?.name).toBe('New Winery')
      expect(result?.regionId).toBe(region.id)
    })

    it('should allow producer role to create a producer', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)
      const result = await caller.producer.create({
        name: 'Producer Winery',
        userId: PRODUCER_USER_ID,
      })

      expect(result).toBeDefined()
      expect(result?.name).toBe('Producer Winery')
      expect(result?.userId).toBe(PRODUCER_USER_ID)
    })

    it('should prevent producer from setting userId to another user', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      await createTestUserWithRole(OTHER_PRODUCER_USER_ID, 'other@test.com', 'producer')

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.producer.create({
          name: 'Stolen Winery',
          userId: OTHER_PRODUCER_USER_ID,
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
        await caller.producer.create({ name: 'Winery' })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject unauthenticated request', async () => {
      const caller = createPublicCaller()

      try {
        await caller.producer.create({ name: 'Winery' })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should reject empty name', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      await expect(caller.producer.create({ name: '' })).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('should allow admin to update any producer', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer({ name: 'Old Name' })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.producer.update({
        id: producer.id,
        name: 'New Name',
      })

      expect(result?.name).toBe('New Name')
    })

    it('should allow producer to update own producer profile', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({
        name: 'My Winery',
        userId: PRODUCER_USER_ID,
      })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)
      const result = await caller.producer.update({
        id: producer.id,
        name: 'Updated Winery',
      })

      expect(result?.name).toBe('Updated Winery')
    })

    it('should prevent producer from updating another producer', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      await createTestUserWithRole(OTHER_PRODUCER_USER_ID, 'other@test.com', 'producer')
      const producer = await createTestProducer({
        name: 'Other Winery',
        userId: OTHER_PRODUCER_USER_ID,
      })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.producer.update({ id: producer.id, name: 'Hacked' })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject attendee role', async () => {
      await createTestUserWithRole(ATTENDEE_USER_ID, 'attendee@test.com', 'attendee')
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ATTENDEE_USER_ID)

      try {
        await caller.producer.update({ id: producer.id, name: 'Hacked' })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject unauthenticated request', async () => {
      const producer = await createTestProducer()
      const caller = createPublicCaller()

      try {
        await caller.producer.update({ id: producer.id, name: 'Hacked' })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should throw NOT_FOUND for non-existent producer', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.producer.update({
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99',
          name: 'Ghost',
        })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })

    it('should allow setting nullable fields to null', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const region = await createTestRegion('Thracian Valley')
      const producer = await createTestProducer({
        name: 'Winery',
        regionId: region.id,
        description: 'Some description',
      })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.producer.update({
        id: producer.id,
        regionId: null,
        description: null,
      })

      expect(result?.regionId).toBeNull()
      expect(result?.description).toBeNull()
      expect(result?.name).toBe('Winery')
    })
  })

  describe('delete', () => {
    it('should allow admin to delete a producer', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.producer.delete({ id: producer.id })

      expect(result?.id).toBe(producer.id)

      // Verify deleted
      const publicCaller = createPublicCaller()
      const list = await publicCaller.producer.list({})
      expect(list.items).toHaveLength(0)
    })

    it('should reject producer role', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.producer.delete({ id: producer.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject attendee role', async () => {
      await createTestUserWithRole(ATTENDEE_USER_ID, 'attendee@test.com', 'attendee')
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ATTENDEE_USER_ID)

      try {
        await caller.producer.delete({ id: producer.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should reject unauthenticated request', async () => {
      const producer = await createTestProducer()
      const caller = createPublicCaller()

      try {
        await caller.producer.delete({ id: producer.id })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should throw NOT_FOUND for non-existent producer', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.producer.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })
})
