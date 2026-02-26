import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import {
  grapeVarieties,
  producers,
  regions,
  userProfiles,
  wineGrapeVarieties,
  wines,
} from '~/server/db/schema'
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

async function createTestRegion(name = 'Thracian Valley') {
  const db = getTestDb()
  const result = await db.insert(regions).values({ name }).returning()
  const region = result[0]
  if (!region) throw new Error('Failed to create test region')
  return region
}

async function createTestGrapeVariety(name = 'Mavrud') {
  const db = getTestDb()
  const result = await db.insert(grapeVarieties).values({ name }).returning()
  const variety = result[0]
  if (!variety) throw new Error('Failed to create test grape variety')
  return variety
}

async function linkWineToGrapeVariety(wineId: string, grapeVarietyId: string) {
  const db = getTestDb()
  await db.insert(wineGrapeVarieties).values({ wineId, grapeVarietyId })
}

describe('Wine Router', () => {
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
    it('should return all wines', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Wine A' })
      await createTestWine(producer.id, { name: 'Wine B' })

      const caller = createPublicCaller()
      const result = await caller.wine.list({})

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('should paginate', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Wine A' })
      await createTestWine(producer.id, { name: 'Wine B' })
      await createTestWine(producer.id, { name: 'Wine C' })

      const caller = createPublicCaller()
      const page1 = await caller.wine.list({ limit: 2, offset: 0 })
      const page2 = await caller.wine.list({ limit: 2, offset: 2 })

      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(3)
      expect(page2.items).toHaveLength(1)
    })

    it('should filter by type', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Red Wine', type: 'red' })
      await createTestWine(producer.id, { name: 'White Wine', type: 'white' })

      const caller = createPublicCaller()
      const result = await caller.wine.list({ type: 'red' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Red Wine')
    })

    it('should filter by region', async () => {
      const producer = await createTestProducer()
      const thracian = await createTestRegion('Thracian Valley')
      const struma = await createTestRegion('Struma Valley')
      await createTestWine(producer.id, { name: 'Wine A', regionId: thracian.id })
      await createTestWine(producer.id, { name: 'Wine B', regionId: struma.id })

      const caller = createPublicCaller()
      const result = await caller.wine.list({ regionId: thracian.id })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Wine A')
    })

    it('should filter by grape variety', async () => {
      const producer = await createTestProducer()
      const cabernet = await createTestGrapeVariety('Cabernet Sauvignon')
      const merlot = await createTestGrapeVariety('Merlot')
      const wineA = await createTestWine(producer.id, { name: 'Wine A' })
      const wineB = await createTestWine(producer.id, { name: 'Wine B' })
      await linkWineToGrapeVariety(wineA.id, cabernet.id)
      await linkWineToGrapeVariety(wineB.id, merlot.id)

      const caller = createPublicCaller()
      const result = await caller.wine.list({ grapeVarietyId: cabernet.id })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Wine A')
    })

    it('should filter by price range', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Cheap Wine', price: 5 })
      await createTestWine(producer.id, { name: 'Mid Wine', price: 15 })
      await createTestWine(producer.id, { name: 'Expensive Wine', price: 50 })

      const caller = createPublicCaller()
      const result = await caller.wine.list({ minPrice: 10, maxPrice: 20 })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Mid Wine')
    })

    it('should filter by producerId', async () => {
      const producerA = await createTestProducer({ name: 'Winery A' })
      const producerB = await createTestProducer({ name: 'Winery B' })
      await createTestWine(producerA.id, { name: 'Wine A' })
      await createTestWine(producerB.id, { name: 'Wine B' })

      const caller = createPublicCaller()
      const result = await caller.wine.list({ producerId: producerA.id })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Wine A')
    })

    it('should combine multiple filters', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Red Cheap', type: 'red', price: 5 })
      await createTestWine(producer.id, { name: 'Red Expensive', type: 'red', price: 50 })
      await createTestWine(producer.id, { name: 'White Cheap', type: 'white', price: 5 })

      const caller = createPublicCaller()
      const result = await caller.wine.list({ type: 'red', maxPrice: 10 })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Red Cheap')
    })

    it('should return empty when no wines match', async () => {
      const caller = createPublicCaller()
      const result = await caller.wine.list({})

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should return producer name and region name with each wine', async () => {
      const region = await createTestRegion('Thracian Valley')
      const producer = await createTestProducer({ name: 'Bessa Valley', regionId: region.id })
      await createTestWine(producer.id, { name: 'Enira', regionId: region.id })

      const caller = createPublicCaller()
      const result = await caller.wine.list({})

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Enira')
      expect(result.items[0]?.producerName).toBe('Bessa Valley')
      expect(result.items[0]?.regionName).toBe('Thracian Valley')
    })

    it('should return null regionName when wine has no region', async () => {
      const producer = await createTestProducer({ name: 'Test Winery' })
      await createTestWine(producer.id, { name: 'No Region Wine' })

      const caller = createPublicCaller()
      const result = await caller.wine.list({})

      expect(result.items[0]?.producerName).toBe('Test Winery')
      expect(result.items[0]?.regionName).toBeNull()
    })
  })

  describe('getById', () => {
    it('should return wine with producer info', async () => {
      const producer = await createTestProducer({ name: 'My Winery' })
      const wine = await createTestWine(producer.id, { name: 'Great Red' })

      const caller = createPublicCaller()
      const result = await caller.wine.getById({ id: wine.id })

      expect(result.name).toBe('Great Red')
      expect(result.producer.name).toBe('My Winery')
    })

    it('should return wine with grape varieties', async () => {
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id, { name: 'Blend' })
      const cabernet = await createTestGrapeVariety('Cabernet Sauvignon')
      const merlot = await createTestGrapeVariety('Merlot')
      await linkWineToGrapeVariety(wine.id, cabernet.id)
      await linkWineToGrapeVariety(wine.id, merlot.id)

      const caller = createPublicCaller()
      const result = await caller.wine.getById({ id: wine.id })

      expect(result.wineGrapeVarieties).toHaveLength(2)
      const varietyNames = result.wineGrapeVarieties.map((wgv) => wgv.grapeVariety.name).sort()
      expect(varietyNames).toEqual(['Cabernet Sauvignon', 'Merlot'])
    })

    it('should return wine with region', async () => {
      const producer = await createTestProducer()
      const region = await createTestRegion('Thracian Valley')
      const wine = await createTestWine(producer.id, { name: 'Regional Wine', regionId: region.id })

      const caller = createPublicCaller()
      const result = await caller.wine.getById({ id: wine.id })

      expect(result.region?.name).toBe('Thracian Valley')
    })

    it('should throw NOT_FOUND for non-existent ID', async () => {
      const caller = createPublicCaller()

      try {
        await caller.wine.getById({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('create', () => {
    it('should allow admin to create a wine for any producer', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.wine.create({
        name: 'New Wine',
        type: 'red',
        producerId: producer.id,
        vintage: 2022,
      })

      expect(result).toBeDefined()
      expect(result?.name).toBe('New Wine')
      expect(result?.type).toBe('red')
      expect(result?.vintage).toBe(2022)
    })

    it('should allow admin to create a wine with grape varieties', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()
      const mavrud = await createTestGrapeVariety('Mavrud')
      const rubin = await createTestGrapeVariety('Rubin')

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.wine.create({
        name: 'Blend Wine',
        type: 'red',
        producerId: producer.id,
        grapeVarietyIds: [mavrud.id, rubin.id],
      })

      expect(result).toBeDefined()
      expect(result?.name).toBe('Blend Wine')

      // Verify grape varieties were linked
      const fetched = await caller.wine.getById({ id: result?.id ?? '' })
      expect(fetched.wineGrapeVarieties).toHaveLength(2)
    })

    it('should allow producer to create wine for own producer profile', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)
      const result = await caller.wine.create({
        name: 'My Wine',
        type: 'white',
        producerId: producer.id,
      })

      expect(result).toBeDefined()
      expect(result?.name).toBe('My Wine')
    })

    it('should prevent producer from creating wine for another producer', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      await createTestUserWithRole(OTHER_PRODUCER_USER_ID, 'other@test.com', 'producer')
      const otherProducer = await createTestProducer({ userId: OTHER_PRODUCER_USER_ID })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.wine.create({
          name: 'Stolen Wine',
          type: 'red',
          producerId: otherProducer.id,
        })
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
        await caller.wine.create({
          name: 'Wine',
          type: 'red',
          producerId: producer.id,
        })
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
        await caller.wine.create({
          name: 'Wine',
          type: 'red',
          producerId: producer.id,
        })
        expect.unreachable('Should have thrown UNAUTHORIZED')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('UNAUTHORIZED')
      }
    })

    it('should reject empty name', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      await expect(
        caller.wine.create({ name: '', type: 'red', producerId: producer.id }),
      ).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('should allow admin to update any wine', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id, { name: 'Old Name' })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.wine.update({
        id: wine.id,
        name: 'New Name',
      })

      expect(result?.name).toBe('New Name')
    })

    it('should allow admin to update grape varieties', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)
      const mavrud = await createTestGrapeVariety('Mavrud')
      const rubin = await createTestGrapeVariety('Rubin')
      await linkWineToGrapeVariety(wine.id, mavrud.id)

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      await caller.wine.update({
        id: wine.id,
        grapeVarietyIds: [rubin.id],
      })

      const fetched = await createPublicCaller().wine.getById({ id: wine.id })
      expect(fetched.wineGrapeVarieties).toHaveLength(1)
      expect(fetched.wineGrapeVarieties[0]?.grapeVariety.name).toBe('Rubin')
    })

    it('should allow producer to update wine belonging to their producer', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })
      const wine = await createTestWine(producer.id, { name: 'My Wine' })

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)
      const result = await caller.wine.update({
        id: wine.id,
        name: 'Updated Wine',
      })

      expect(result?.name).toBe('Updated Wine')
    })

    it('should prevent producer from updating another producer wine', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      await createTestUserWithRole(OTHER_PRODUCER_USER_ID, 'other@test.com', 'producer')
      const otherProducer = await createTestProducer({ userId: OTHER_PRODUCER_USER_ID })
      const wine = await createTestWine(otherProducer.id)

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.wine.update({ id: wine.id, name: 'Hacked' })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND for non-existent wine', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.wine.update({
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
      const producer = await createTestProducer()
      const region = await createTestRegion('Thracian Valley')
      const wine = await createTestWine(producer.id, {
        name: 'Wine',
        regionId: region.id,
        oneLiner: 'A great wine',
      })

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.wine.update({
        id: wine.id,
        regionId: null,
        oneLiner: null,
      })

      expect(result?.regionId).toBeNull()
      expect(result?.oneLiner).toBeNull()
      expect(result?.name).toBe('Wine')
    })
  })

  describe('delete', () => {
    it('should allow admin to delete a wine', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const producer = await createTestProducer()
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(ADMIN_USER_ID)
      const result = await caller.wine.delete({ id: wine.id })

      expect(result?.id).toBe(wine.id)
    })

    it('should reject producer role', async () => {
      await createTestUserWithRole(PRODUCER_USER_ID, 'producer@test.com', 'producer')
      const producer = await createTestProducer({ userId: PRODUCER_USER_ID })
      const wine = await createTestWine(producer.id)

      const caller = createAuthenticatedCaller(PRODUCER_USER_ID)

      try {
        await caller.wine.delete({ id: wine.id })
        expect.unreachable('Should have thrown FORBIDDEN')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      }
    })

    it('should throw NOT_FOUND for non-existent wine', async () => {
      await createTestUserWithRole(ADMIN_USER_ID, 'admin@test.com', 'admin')
      const caller = createAuthenticatedCaller(ADMIN_USER_ID)

      try {
        await caller.wine.delete({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99' })
        expect.unreachable('Should have thrown NOT_FOUND')
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('NOT_FOUND')
      }
    })
  })

  describe('search', () => {
    it('should find wines by name', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Mavrud Reserve' })
      await createTestWine(producer.id, { name: 'Chardonnay Classic' })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Mavrud' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Mavrud Reserve')
    })

    it('should find wines by grape variety', async () => {
      const producer = await createTestProducer()
      const cabernet = await createTestGrapeVariety('Cabernet Sauvignon')
      const merlot = await createTestGrapeVariety('Merlot')
      const wineA = await createTestWine(producer.id, { name: 'Wine A' })
      const wineB = await createTestWine(producer.id, { name: 'Wine B' })
      await linkWineToGrapeVariety(wineA.id, cabernet.id)
      await linkWineToGrapeVariety(wineB.id, merlot.id)

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Cabernet' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Wine A')
    })

    it('should find wines by region', async () => {
      const producer = await createTestProducer()
      const thracian = await createTestRegion('Thracian Valley')
      const struma = await createTestRegion('Struma Valley')
      await createTestWine(producer.id, { name: 'Wine A', regionId: thracian.id })
      await createTestWine(producer.id, { name: 'Wine B', regionId: struma.id })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Thracian' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Wine A')
    })

    it('should find wines by producer name', async () => {
      const producerA = await createTestProducer({ name: 'Bessa Valley Winery' })
      const producerB = await createTestProducer({ name: 'Todoroff Winery' })
      await createTestWine(producerA.id, { name: 'Red Blend' })
      await createTestWine(producerB.id, { name: 'White Blend' })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Bessa' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Red Blend')
      expect(result.items[0]?.producerName).toBe('Bessa Valley Winery')
    })

    it('should be case insensitive', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Mavrud Reserve' })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'mavrud' })

      expect(result.items).toHaveLength(1)
    })

    it('should return empty for no matches', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Red Wine' })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Nonexistent' })

      expect(result.items).toHaveLength(0)
      expect(result.total).toBe(0)
    })

    it('should paginate search results', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Mavrud 2020' })
      await createTestWine(producer.id, { name: 'Mavrud 2021' })
      await createTestWine(producer.id, { name: 'Mavrud 2022' })

      const caller = createPublicCaller()
      const page1 = await caller.wine.search({ query: 'Mavrud', limit: 2, offset: 0 })
      const page2 = await caller.wine.search({ query: 'Mavrud', limit: 2, offset: 2 })

      expect(page1.items).toHaveLength(2)
      expect(page1.total).toBe(3)
      expect(page2.items).toHaveLength(1)
    })

    it('should return regionName in search results', async () => {
      const region = await createTestRegion('Thracian Valley')
      const producer = await createTestProducer({ name: 'Bessa Valley' })
      await createTestWine(producer.id, { name: 'Enira Red', regionId: region.id })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Enira' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.regionName).toBe('Thracian Valley')
      expect(result.items[0]?.producerName).toBe('Bessa Valley')
    })

    it('should filter search results by type', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Mavrud Red', type: 'red' })
      await createTestWine(producer.id, { name: 'Mavrud White', type: 'white' })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Mavrud', type: 'red' })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Mavrud Red')
    })

    it('should filter search results by price range', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Mavrud Cheap', price: 5 })
      await createTestWine(producer.id, { name: 'Mavrud Expensive', price: 50 })

      const caller = createPublicCaller()
      const result = await caller.wine.search({ query: 'Mavrud', maxPrice: 10 })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Mavrud Cheap')
    })

    it('should combine search text with multiple filters', async () => {
      const region = await createTestRegion('Thracian Valley')
      const producer = await createTestProducer()
      await createTestWine(producer.id, {
        name: 'Mavrud Red Cheap',
        type: 'red',
        price: 5,
        regionId: region.id,
      })
      await createTestWine(producer.id, {
        name: 'Mavrud White Expensive',
        type: 'white',
        price: 50,
        regionId: region.id,
      })
      await createTestWine(producer.id, {
        name: 'Mavrud Red Expensive',
        type: 'red',
        price: 50,
      })

      const caller = createPublicCaller()
      const result = await caller.wine.search({
        query: 'Mavrud',
        type: 'red',
        maxPrice: 10,
        regionId: region.id,
      })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.wine.name).toBe('Mavrud Red Cheap')
    })
  })

  describe('listRecent', () => {
    it('should return wines ordered by createdAt descending', async () => {
      const producer = await createTestProducer()

      // Insert wines with slight delay to ensure different createdAt
      await createTestWine(producer.id, { name: 'Older Wine' })
      // Small delay to ensure ordering
      await new Promise((r) => setTimeout(r, 50))
      await createTestWine(producer.id, { name: 'Newer Wine' })

      const caller = createPublicCaller()
      const result = await caller.wine.listRecent({ limit: 2 })

      expect(result).toHaveLength(2)
      expect(result[0]?.wine.name).toBe('Newer Wine')
      expect(result[1]?.wine.name).toBe('Older Wine')
    })

    it('should respect limit parameter', async () => {
      const producer = await createTestProducer()
      await createTestWine(producer.id, { name: 'Wine A' })
      await createTestWine(producer.id, { name: 'Wine B' })
      await createTestWine(producer.id, { name: 'Wine C' })

      const caller = createPublicCaller()
      const result = await caller.wine.listRecent({ limit: 2 })

      expect(result).toHaveLength(2)
    })

    it('should include producer and region names', async () => {
      const db = getTestDb()
      const regionResult = await db.insert(regions).values({ name: 'Thracian Valley' }).returning()
      const region = regionResult[0]
      if (!region) throw new Error('Failed to create test region')

      const producer = await createTestProducer({ name: 'Villa Yustina' })
      await createTestWine(producer.id, {
        name: 'Rosé Reserve',
        regionId: region.id,
      })

      const caller = createPublicCaller()
      const result = await caller.wine.listRecent({ limit: 1 })

      expect(result).toHaveLength(1)
      expect(result[0]?.producerName).toBe('Villa Yustina')
      expect(result[0]?.regionName).toBe('Thracian Valley')
    })

    it('should return empty array when no wines exist', async () => {
      const caller = createPublicCaller()
      const result = await caller.wine.listRecent({ limit: 6 })

      expect(result).toHaveLength(0)
    })
  })
})
