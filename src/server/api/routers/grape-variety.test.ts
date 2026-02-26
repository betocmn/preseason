import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { grapeVarieties } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

function createPublicCaller() {
  return createCaller({
    db: getTestDb(),
    user: null,
    headers: new Headers(),
  })
}

async function createTestGrapeVariety(name: string) {
  const db = getTestDb()
  const result = await db.insert(grapeVarieties).values({ name }).returning()
  const variety = result[0]
  if (!variety) throw new Error('Failed to create test grape variety')
  return variety
}

describe('Grape Variety Router', () => {
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
    it('should return all grape varieties ordered by name', async () => {
      await createTestGrapeVariety('Merlot')
      await createTestGrapeVariety('Cabernet Sauvignon')
      await createTestGrapeVariety('Chardonnay')

      const caller = createPublicCaller()
      const result = await caller.grapeVariety.list()

      expect(result.items).toHaveLength(3)
      expect(result.items[0]?.name).toBe('Cabernet Sauvignon')
      expect(result.items[1]?.name).toBe('Chardonnay')
      expect(result.items[2]?.name).toBe('Merlot')
    })

    it('should return empty array when no grape varieties exist', async () => {
      const caller = createPublicCaller()
      const result = await caller.grapeVariety.list()

      expect(result.items).toHaveLength(0)
    })

    it('should respect limit parameter', async () => {
      await createTestGrapeVariety('Variety A')
      await createTestGrapeVariety('Variety B')
      await createTestGrapeVariety('Variety C')

      const caller = createPublicCaller()
      const result = await caller.grapeVariety.list({ limit: 2 })

      expect(result.items).toHaveLength(2)
    })

    it('should respect offset parameter', async () => {
      await createTestGrapeVariety('Variety A')
      await createTestGrapeVariety('Variety B')
      await createTestGrapeVariety('Variety C')

      const caller = createPublicCaller()
      const result = await caller.grapeVariety.list({ limit: 2, offset: 2 })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.name).toBe('Variety C')
    })
  })
})
