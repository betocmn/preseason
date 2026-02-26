import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  fairProducers,
  fairs,
  fairWines,
  grapeVarieties,
  producers,
  regions,
  userProfiles,
  wineGrapeVarieties,
  wines,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from './db'

const TEST_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

async function createTestUser() {
  const db = getTestDb()
  const result = await db
    .insert(userProfiles)
    .values({
      id: TEST_USER_ID,
      email: 'producer@example.com',
      firstName: 'Test',
      lastName: 'Producer',
      birthDate: '1990-01-01',
      role: 'producer',
    })
    .returning()
  return result[0]
}

async function createTestRegion(overrides?: Partial<typeof regions.$inferInsert>) {
  const db = getTestDb()
  const result = await db
    .insert(regions)
    .values({
      name: 'Thracian Valley',
      country: 'Bulgaria',
      ...overrides,
    })
    .returning()
  return result[0]
}

async function createTestGrapeVariety(overrides?: Partial<typeof grapeVarieties.$inferInsert>) {
  const db = getTestDb()
  const result = await db
    .insert(grapeVarieties)
    .values({
      name: 'Mavrud',
      ...overrides,
    })
    .returning()
  return result[0]
}

async function createTestProducer(overrides?: Partial<typeof producers.$inferInsert>) {
  const db = getTestDb()
  const result = await db
    .insert(producers)
    .values({
      name: 'Test Winery',
      ...overrides,
    })
    .returning()
  return result[0]
}

async function createTestFair(overrides?: Partial<typeof fairs.$inferInsert>) {
  const db = getTestDb()
  const result = await db
    .insert(fairs)
    .values({
      name: 'Sofia Wine Festival 2025',
      description: 'Annual wine tasting event',
      location: 'Sofia, Bulgaria',
      startDate: '2025-06-15',
      endDate: '2025-06-17',
      ...overrides,
    })
    .returning()
  return result[0]
}

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

  // ---------------------------------------------------------------------------
  // Region tests
  // ---------------------------------------------------------------------------

  describe('Regions', () => {
    it('should insert and query a region with all fields', async () => {
      const db = getTestDb()
      const [region] = await db
        .insert(regions)
        .values({
          name: 'Thracian Valley',
          country: 'Bulgaria',
          description: 'Ancient wine region',
        })
        .returning()

      expect(region).toBeDefined()
      expect(region?.name).toBe('Thracian Valley')
      expect(region?.country).toBe('Bulgaria')
      expect(region?.description).toBe('Ancient wine region')
      expect(region?.createdAt).toBeInstanceOf(Date)
    })

    it('should enforce unique name constraint', async () => {
      const db = getTestDb()
      await db.insert(regions).values({ name: 'Thracian Valley' })

      await expect(db.insert(regions).values({ name: 'Thracian Valley' })).rejects.toThrow()
    })

    it('should allow nullable fields', async () => {
      const db = getTestDb()
      const [region] = await db.insert(regions).values({ name: 'Minimal Region' }).returning()

      expect(region?.country).toBeNull()
      expect(region?.description).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Grape variety tests
  // ---------------------------------------------------------------------------

  describe('Grape Varieties', () => {
    it('should insert and query a grape variety', async () => {
      const db = getTestDb()
      const [gv] = await db
        .insert(grapeVarieties)
        .values({
          name: 'Mavrud',
          description: 'Ancient Bulgarian red variety',
        })
        .returning()

      expect(gv).toBeDefined()
      expect(gv?.name).toBe('Mavrud')
      expect(gv?.description).toBe('Ancient Bulgarian red variety')
      expect(gv?.createdAt).toBeInstanceOf(Date)
    })

    it('should enforce unique name constraint', async () => {
      const db = getTestDb()
      await db.insert(grapeVarieties).values({ name: 'Mavrud' })

      await expect(db.insert(grapeVarieties).values({ name: 'Mavrud' })).rejects.toThrow()
    })
  })

  // ---------------------------------------------------------------------------
  // Producer tests
  // ---------------------------------------------------------------------------

  describe('Producers', () => {
    it('should insert and query a producer with regionId FK', async () => {
      const db = getTestDb()
      const user = await createTestUser()
      const region = await createTestRegion()

      const [producer] = await db
        .insert(producers)
        .values({
          name: 'Domaine Bessa Valley',
          regionId: region?.id,
          description: 'Premium Bulgarian winery',
          website: 'https://bessavalley.com',
          imageUrl: 'https://example.com/logo.png',
          userId: user?.id,
        })
        .returning()

      expect(producer).toBeDefined()
      expect(producer?.name).toBe('Domaine Bessa Valley')
      expect(producer?.regionId).toBe(region?.id)
      expect(producer?.description).toBe('Premium Bulgarian winery')
      expect(producer?.userId).toBe(user?.id)
    })

    it('should auto-set createdAt timestamp', async () => {
      const producer = await createTestProducer()
      expect(producer?.createdAt).toBeInstanceOf(Date)
    })

    it('should allow nullable fields', async () => {
      const db = getTestDb()
      const [producer] = await db.insert(producers).values({ name: 'Minimal Winery' }).returning()

      expect(producer?.regionId).toBeNull()
      expect(producer?.description).toBeNull()
      expect(producer?.website).toBeNull()
      expect(producer?.imageUrl).toBeNull()
      expect(producer?.userId).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Wine tests
  // ---------------------------------------------------------------------------

  describe('Wines', () => {
    it('should insert and query a wine with regionId FK and oneLiner', async () => {
      const db = getTestDb()
      const region = await createTestRegion()
      const producer = await createTestProducer({ regionId: region?.id })

      const [wine] = await db
        .insert(wines)
        .values({
          name: 'Enira Reserva',
          vintage: 2019,
          type: 'red',
          alcoholPercent: 14.5,
          regionId: region?.id,
          description: 'Full-bodied red blend',
          oneLiner: 'Bold Thracian red with velvety tannins',
          imageUrl: 'https://example.com/enira.png',
          producerId: producer?.id ?? '',
          price: 18.5,
          fermentationContainer: 'Stainless steel',
          oakAging: '12 months French oak',
          leesContact: '6 months sur lie',
          sedimentContact: 'Unfiltered',
        })
        .returning()

      expect(wine).toBeDefined()
      expect(wine?.name).toBe('Enira Reserva')
      expect(wine?.vintage).toBe(2019)
      expect(wine?.type).toBe('red')
      expect(wine?.regionId).toBe(region?.id)
      expect(wine?.oneLiner).toBe('Bold Thracian red with velvety tannins')
      expect(wine?.alcoholPercent).toBeCloseTo(14.5)
      expect(wine?.price).toBe(18.5)
      expect(wine?.producerId).toBe(producer?.id)
    })

    it('should accept all valid wine type enum values', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()
      const types = ['white', 'red', 'rose', 'orange', 'sparkling', 'dessert'] as const

      for (const type of types) {
        await db.insert(wines).values({
          name: `${type} wine`,
          type,
          producerId: producer?.id ?? '',
        })
      }

      const allWines = await db.select().from(wines)
      expect(allWines).toHaveLength(6)
      expect(allWines.map((w) => w.type).sort()).toEqual([...types].sort())
    })

    it('should allow null vintage for non-vintage wines', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()

      const [wine] = await db
        .insert(wines)
        .values({
          name: 'NV Sparkling',
          type: 'sparkling',
          producerId: producer?.id ?? '',
        })
        .returning()

      expect(wine?.vintage).toBeNull()
    })

    it('should allow null oneLiner', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()

      const [wine] = await db
        .insert(wines)
        .values({
          name: 'No Tagline Wine',
          type: 'red',
          producerId: producer?.id ?? '',
        })
        .returning()

      expect(wine?.oneLiner).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Wine-GrapeVariety junction tests
  // ---------------------------------------------------------------------------

  describe('Wine-GrapeVariety Junction', () => {
    it('should assign multiple grape varieties to a wine', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({ name: 'Blend', type: 'red', producerId: producer?.id ?? '' })
        .returning()

      const gv1 = await createTestGrapeVariety({ name: 'Merlot' })
      const gv2 = await createTestGrapeVariety({ name: 'Syrah' })
      const gv3 = await createTestGrapeVariety({ name: 'Petit Verdot' })

      await db.insert(wineGrapeVarieties).values([
        { wineId: wine?.id ?? '', grapeVarietyId: gv1?.id ?? '' },
        { wineId: wine?.id ?? '', grapeVarietyId: gv2?.id ?? '' },
        { wineId: wine?.id ?? '', grapeVarietyId: gv3?.id ?? '' },
      ])

      const results = await db
        .select()
        .from(wineGrapeVarieties)
        .where(eq(wineGrapeVarieties.wineId, wine?.id ?? ''))

      expect(results).toHaveLength(3)
    })

    it('should enforce unique constraint on (wineId, grapeVarietyId)', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({ name: 'Test Wine', type: 'red', producerId: producer?.id ?? '' })
        .returning()
      const gv = await createTestGrapeVariety()

      await db
        .insert(wineGrapeVarieties)
        .values({ wineId: wine?.id ?? '', grapeVarietyId: gv?.id ?? '' })

      await expect(
        db
          .insert(wineGrapeVarieties)
          .values({ wineId: wine?.id ?? '', grapeVarietyId: gv?.id ?? '' }),
      ).rejects.toThrow()
    })

    it('should cascade delete when wine is deleted', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({ name: 'Delete Me', type: 'red', producerId: producer?.id ?? '' })
        .returning()
      const gv = await createTestGrapeVariety()

      await db
        .insert(wineGrapeVarieties)
        .values({ wineId: wine?.id ?? '', grapeVarietyId: gv?.id ?? '' })

      await db.delete(wines).where(eq(wines.id, wine?.id ?? ''))

      const results = await db.select().from(wineGrapeVarieties)
      expect(results).toHaveLength(0)
    })

    it('should cascade delete when grape variety is deleted', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({ name: 'Test Wine', type: 'red', producerId: producer?.id ?? '' })
        .returning()
      const gv = await createTestGrapeVariety()

      await db
        .insert(wineGrapeVarieties)
        .values({ wineId: wine?.id ?? '', grapeVarietyId: gv?.id ?? '' })

      await db.delete(grapeVarieties).where(eq(grapeVarieties.id, gv?.id ?? ''))

      const results = await db.select().from(wineGrapeVarieties)
      expect(results).toHaveLength(0)
    })

    it('should allow same grape variety on different wines', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()
      const [wine1] = await db
        .insert(wines)
        .values({ name: 'Wine 1', type: 'red', producerId: producer?.id ?? '' })
        .returning()
      const [wine2] = await db
        .insert(wines)
        .values({ name: 'Wine 2', type: 'red', producerId: producer?.id ?? '' })
        .returning()
      const gv = await createTestGrapeVariety()

      await db.insert(wineGrapeVarieties).values([
        { wineId: wine1?.id ?? '', grapeVarietyId: gv?.id ?? '' },
        { wineId: wine2?.id ?? '', grapeVarietyId: gv?.id ?? '' },
      ])

      const results = await db
        .select()
        .from(wineGrapeVarieties)
        .where(eq(wineGrapeVarieties.grapeVarietyId, gv?.id ?? ''))
      expect(results).toHaveLength(2)
    })
  })

  // ---------------------------------------------------------------------------
  // Vintage linking test
  // ---------------------------------------------------------------------------

  describe('Wine Vintage Linking', () => {
    it('should link a wine to a parent wine via parentWineId', async () => {
      const db = getTestDb()
      const producer = await createTestProducer()

      const [parentWine] = await db
        .insert(wines)
        .values({
          name: 'Enira',
          vintage: 2018,
          type: 'red',
          producerId: producer?.id ?? '',
        })
        .returning()

      const [childWine] = await db
        .insert(wines)
        .values({
          name: 'Enira',
          vintage: 2019,
          type: 'red',
          producerId: producer?.id ?? '',
          parentWineId: parentWine?.id,
        })
        .returning()

      expect(childWine?.parentWineId).toBe(parentWine?.id)

      const vintages = await db
        .select()
        .from(wines)
        .where(eq(wines.parentWineId, parentWine?.id ?? ''))

      expect(vintages).toHaveLength(1)
      expect(vintages[0]?.vintage).toBe(2019)
    })
  })

  // ---------------------------------------------------------------------------
  // Fair tests
  // ---------------------------------------------------------------------------

  describe('Fairs', () => {
    it('should insert and query a fair with all fields', async () => {
      const db = getTestDb()
      const [fair] = await db
        .insert(fairs)
        .values({
          name: 'Sofia Wine Festival 2025',
          description: 'Annual wine tasting event',
          location: 'Sofia, Bulgaria',
          startDate: '2025-06-15',
          endDate: '2025-06-17',
          isActive: true,
          imageUrl: 'https://example.com/fair.png',
        })
        .returning()

      expect(fair).toBeDefined()
      expect(fair?.name).toBe('Sofia Wine Festival 2025')
      expect(fair?.description).toBe('Annual wine tasting event')
      expect(fair?.location).toBe('Sofia, Bulgaria')
      expect(fair?.startDate).toBe('2025-06-15')
      expect(fair?.endDate).toBe('2025-06-17')
      expect(fair?.isActive).toBe(true)
      expect(fair?.imageUrl).toBe('https://example.com/fair.png')
    })

    it('should auto-set createdAt timestamp', async () => {
      const fair = await createTestFair()
      expect(fair?.createdAt).toBeInstanceOf(Date)
    })

    it('should default isActive to false', async () => {
      const db = getTestDb()
      const [fair] = await db
        .insert(fairs)
        .values({
          name: 'Plovdiv Wine Expo',
          startDate: '2025-09-01',
          endDate: '2025-09-03',
        })
        .returning()

      expect(fair?.isActive).toBe(false)
    })

    it('should allow nullable fields', async () => {
      const db = getTestDb()
      const [fair] = await db
        .insert(fairs)
        .values({
          name: 'Minimal Fair',
          startDate: '2025-01-01',
          endDate: '2025-01-02',
        })
        .returning()

      expect(fair?.description).toBeNull()
      expect(fair?.location).toBeNull()
      expect(fair?.imageUrl).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Fair-Producer junction tests
  // ---------------------------------------------------------------------------

  describe('Fair-Producer Junction', () => {
    it('should link a producer to a fair with booth number', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()

      const [fp] = await db
        .insert(fairProducers)
        .values({
          fairId: fair?.id ?? '',
          producerId: producer?.id ?? '',
          boothNumber: 'A1',
        })
        .returning()

      expect(fp).toBeDefined()
      expect(fp?.fairId).toBe(fair?.id)
      expect(fp?.producerId).toBe(producer?.id)
      expect(fp?.boothNumber).toBe('A1')
      expect(fp?.createdAt).toBeInstanceOf(Date)
    })

    it('should allow null booth number', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()

      const [fp] = await db
        .insert(fairProducers)
        .values({
          fairId: fair?.id ?? '',
          producerId: producer?.id ?? '',
        })
        .returning()

      expect(fp?.boothNumber).toBeNull()
    })

    it('should enforce unique constraint on (fairId, producerId)', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()

      await db.insert(fairProducers).values({
        fairId: fair?.id ?? '',
        producerId: producer?.id ?? '',
        boothNumber: 'A1',
      })

      await expect(
        db.insert(fairProducers).values({
          fairId: fair?.id ?? '',
          producerId: producer?.id ?? '',
          boothNumber: 'B2',
        }),
      ).rejects.toThrow()
    })

    it('should allow same producer at different fairs', async () => {
      const db = getTestDb()
      const fair1 = await createTestFair({ name: 'Fair 1' })
      const fair2 = await createTestFair({ name: 'Fair 2' })
      const producer = await createTestProducer()

      await db.insert(fairProducers).values({
        fairId: fair1?.id ?? '',
        producerId: producer?.id ?? '',
      })
      await db.insert(fairProducers).values({
        fairId: fair2?.id ?? '',
        producerId: producer?.id ?? '',
      })

      const results = await db
        .select()
        .from(fairProducers)
        .where(eq(fairProducers.producerId, producer?.id ?? ''))
      expect(results).toHaveLength(2)
    })

    it('should cascade delete when fair is deleted', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()

      await db.insert(fairProducers).values({
        fairId: fair?.id ?? '',
        producerId: producer?.id ?? '',
      })

      await db.delete(fairs).where(eq(fairs.id, fair?.id ?? ''))

      const results = await db.select().from(fairProducers)
      expect(results).toHaveLength(0)
    })

    it('should cascade delete when producer is deleted', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()

      await db.insert(fairProducers).values({
        fairId: fair?.id ?? '',
        producerId: producer?.id ?? '',
      })

      await db.delete(producers).where(eq(producers.id, producer?.id ?? ''))

      const results = await db.select().from(fairProducers)
      expect(results).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Fair-Wine junction tests
  // ---------------------------------------------------------------------------

  describe('Fair-Wine Junction', () => {
    it('should link a wine to a fair', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({
          name: 'Enira Reserva',
          type: 'red',
          producerId: producer?.id ?? '',
        })
        .returning()

      const [fw] = await db
        .insert(fairWines)
        .values({
          fairId: fair?.id ?? '',
          wineId: wine?.id ?? '',
        })
        .returning()

      expect(fw).toBeDefined()
      expect(fw?.fairId).toBe(fair?.id)
      expect(fw?.wineId).toBe(wine?.id)
      expect(fw?.createdAt).toBeInstanceOf(Date)
    })

    it('should enforce unique constraint on (fairId, wineId)', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({
          name: 'Test Wine',
          type: 'white',
          producerId: producer?.id ?? '',
        })
        .returning()

      await db.insert(fairWines).values({
        fairId: fair?.id ?? '',
        wineId: wine?.id ?? '',
      })

      await expect(
        db.insert(fairWines).values({
          fairId: fair?.id ?? '',
          wineId: wine?.id ?? '',
        }),
      ).rejects.toThrow()
    })

    it('should allow same wine at different fairs', async () => {
      const db = getTestDb()
      const fair1 = await createTestFair({ name: 'Fair 1' })
      const fair2 = await createTestFair({ name: 'Fair 2' })
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({
          name: 'Multi-fair Wine',
          type: 'red',
          producerId: producer?.id ?? '',
        })
        .returning()

      await db.insert(fairWines).values({
        fairId: fair1?.id ?? '',
        wineId: wine?.id ?? '',
      })
      await db.insert(fairWines).values({
        fairId: fair2?.id ?? '',
        wineId: wine?.id ?? '',
      })

      const results = await db
        .select()
        .from(fairWines)
        .where(eq(fairWines.wineId, wine?.id ?? ''))
      expect(results).toHaveLength(2)
    })

    it('should cascade delete when fair is deleted', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({
          name: 'Cascade Test Wine',
          type: 'white',
          producerId: producer?.id ?? '',
        })
        .returning()

      await db.insert(fairWines).values({
        fairId: fair?.id ?? '',
        wineId: wine?.id ?? '',
      })

      await db.delete(fairs).where(eq(fairs.id, fair?.id ?? ''))

      const results = await db.select().from(fairWines)
      expect(results).toHaveLength(0)
    })

    it('should cascade delete when wine is deleted', async () => {
      const db = getTestDb()
      const fair = await createTestFair()
      const producer = await createTestProducer()
      const [wine] = await db
        .insert(wines)
        .values({
          name: 'Delete Test Wine',
          type: 'red',
          producerId: producer?.id ?? '',
        })
        .returning()

      await db.insert(fairWines).values({
        fairId: fair?.id ?? '',
        wineId: wine?.id ?? '',
      })

      await db.delete(wines).where(eq(wines.id, wine?.id ?? ''))

      const results = await db.select().from(fairWines)
      expect(results).toHaveLength(0)
    })
  })
})
