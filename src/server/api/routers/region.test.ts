import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createCaller } from '~/server/api/root'
import { regions } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

function createPublicCaller() {
  return createCaller({
    db: getTestDb(),
    user: null,
    headers: new Headers(),
  })
}

async function createTestRegion(name: string) {
  const db = getTestDb()
  const result = await db.insert(regions).values({ name }).returning()
  const region = result[0]
  if (!region) throw new Error('Failed to create test region')
  return region
}

describe('Region Router', () => {
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
    it('should return all regions ordered by name', async () => {
      await createTestRegion('Thracian Valley')
      await createTestRegion('Black Sea')
      await createTestRegion('Rose Valley')

      const caller = createPublicCaller()
      const result = await caller.region.list()

      expect(result.items).toHaveLength(3)
      expect(result.items[0]?.name).toBe('Black Sea')
      expect(result.items[1]?.name).toBe('Rose Valley')
      expect(result.items[2]?.name).toBe('Thracian Valley')
    })

    it('should return empty array when no regions exist', async () => {
      const caller = createPublicCaller()
      const result = await caller.region.list()

      expect(result.items).toHaveLength(0)
    })

    it('should respect limit parameter', async () => {
      await createTestRegion('Region A')
      await createTestRegion('Region B')
      await createTestRegion('Region C')

      const caller = createPublicCaller()
      const result = await caller.region.list({ limit: 2 })

      expect(result.items).toHaveLength(2)
    })

    it('should respect offset parameter', async () => {
      await createTestRegion('Region A')
      await createTestRegion('Region B')
      await createTestRegion('Region C')

      const caller = createPublicCaller()
      const result = await caller.region.list({ limit: 2, offset: 2 })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.name).toBe('Region C')
    })
  })
})
