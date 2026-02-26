import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { fairProducers, fairs, fairWines, producers, wines } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

function createPublicCaller() {
  return createCaller({
    db: getTestDb(),
    user: null,
    headers: new Headers(),
  })
}

async function createTestProducer(overrides: Partial<typeof producers.$inferInsert> = {}) {
  const db = getTestDb()
  const result = await db
    .insert(producers)
    .values({ name: 'Test Winery', ...overrides })
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
    .values({ name: 'Test Wine', type: 'red', producerId, ...overrides })
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

describe('Homepage Data', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('active fair with details', () => {
    it('should return active fair with producer and wine counts', async () => {
      const fair = await createTestFair({
        name: 'Sofia Wine Festival',
        location: 'Sofia, Bulgaria',
        isActive: true,
        description: 'Annual wine festival',
      })
      const producer1 = await createTestProducer({ name: 'Winery A' })
      const producer2 = await createTestProducer({ name: 'Winery B' })
      const wine1 = await createTestWine(producer1.id, { name: 'Red Reserve' })
      const wine2 = await createTestWine(producer1.id, { name: 'White Blend' })
      const wine3 = await createTestWine(producer2.id, { name: 'Rosé' })

      const db = getTestDb()
      await db.insert(fairProducers).values([
        { fairId: fair.id, producerId: producer1.id, boothNumber: 'A1' },
        { fairId: fair.id, producerId: producer2.id, boothNumber: 'B2' },
      ])
      await db.insert(fairWines).values([
        { fairId: fair.id, wineId: wine1.id },
        { fairId: fair.id, wineId: wine2.id },
        { fairId: fair.id, wineId: wine3.id },
      ])

      const caller = createPublicCaller()

      // Step 1: Get active fairs
      const activeFairs = await caller.fair.list({ activeOnly: true })
      expect(activeFairs).toHaveLength(1)
      expect(activeFairs[0]?.name).toBe('Sofia Wine Festival')

      // Step 2: Get fair details
      const activeFair = activeFairs[0]
      expect(activeFair).toBeDefined()
      const fairDetail = await caller.fair.getById({ id: activeFair?.id ?? '' })
      expect(fairDetail.name).toBe('Sofia Wine Festival')
      expect(fairDetail.location).toBe('Sofia, Bulgaria')
      expect(fairDetail.description).toBe('Annual wine festival')
      expect(fairDetail.fairProducers).toHaveLength(2)
      expect(fairDetail.fairWines).toHaveLength(3)
    })

    it('should handle no active fair gracefully', async () => {
      await createTestFair({ name: 'Past Fair', isActive: false })

      const caller = createPublicCaller()
      const activeFairs = await caller.fair.list({ activeOnly: true })

      expect(activeFairs).toHaveLength(0)
    })

    it('should handle no fairs at all', async () => {
      const caller = createPublicCaller()
      const activeFairs = await caller.fair.list({ activeOnly: true })

      expect(activeFairs).toHaveLength(0)
    })
  })

  describe('recently added wines', () => {
    it('should return most recent wines for homepage display', async () => {
      const producer = await createTestProducer({ name: 'Midalidare' })

      for (let i = 0; i < 8; i++) {
        await createTestWine(producer.id, { name: `Wine ${i}` })
        await new Promise((r) => setTimeout(r, 20))
      }

      const caller = createPublicCaller()
      const recent = await caller.wine.listRecent({ limit: 6 })

      expect(recent).toHaveLength(6)
      // Most recent should be first
      expect(recent[0]?.wine.name).toBe('Wine 7')
      expect(recent[5]?.wine.name).toBe('Wine 2')
    })
  })
})
