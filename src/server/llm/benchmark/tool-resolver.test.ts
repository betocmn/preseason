import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  subcategories,
  toolAliases,
  toolCandidates,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import {
  buildToolResolutionIndex,
  resolveToolName,
  resolveToolWithCandidateQueue,
} from './tool-resolver'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

async function seedTool(db: ReturnType<typeof getTestDb>, name: string, slug: string) {
  return first(await db.insert(tools).values({ name, slug }).returning())
}

async function seedAlias(
  db: ReturnType<typeof getTestDb>,
  toolId: string,
  alias: string,
  normalizedAlias: string,
) {
  return first(
    await db
      .insert(toolAliases)
      .values({ toolId, alias, normalizedAlias, source: 'test' })
      .returning(),
  )
}

async function seedCategoryGroup(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
}

async function seedSubcategory(db: ReturnType<typeof getTestDb>, groupId: string) {
  return first(
    await db
      .insert(subcategories)
      .values({ categoryId: groupId, name: 'Auth', slug: 'auth', displayOrder: 1 })
      .returning(),
  )
}

async function assignToolToCategory(
  db: ReturnType<typeof getTestDb>,
  toolId: string,
  categoryId: string,
  isPrimary = true,
) {
  return first(
    await db.insert(toolCategories).values({ toolId, categoryId, isPrimary }).returning(),
  )
}

describe('Tool Resolver', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('resolveToolName', () => {
    it('should match by tool name (case-insensitive)', async () => {
      const db = getTestDb()
      const tool = await seedTool(db, 'Supabase', 'supabase')
      const index = await buildToolResolutionIndex(db)

      expect(resolveToolName('supabase', index).toolId).toBe(tool.id)
      expect(resolveToolName('Supabase', index).toolId).toBe(tool.id)
      expect(resolveToolName('SUPABASE', index).toolId).toBe(tool.id)
    })

    it('should match by tool slug', async () => {
      const db = getTestDb()
      const tool = await seedTool(db, 'Supabase DB', 'supabase-db')
      const index = await buildToolResolutionIndex(db)

      expect(resolveToolName('supabase-db', index).toolId).toBe(tool.id)
    })

    it('should match by approved alias', async () => {
      const db = getTestDb()
      const tool = await seedTool(db, 'Supabase', 'supabase')
      await seedAlias(db, tool.id, 'Supa', 'supa')
      const index = await buildToolResolutionIndex(db)

      expect(resolveToolName('supa', index).toolId).toBe(tool.id)
      expect(resolveToolName('Supa', index).toolId).toBe(tool.id)
    })

    it('should return null for unknown tools', async () => {
      const db = getTestDb()
      await seedTool(db, 'Supabase', 'supabase')
      const index = await buildToolResolutionIndex(db)

      expect(resolveToolName('Firebase', index).toolId).toBeNull()
    })

    it('should not fuzzy match', async () => {
      const db = getTestDb()
      await seedTool(db, 'Supabase', 'supabase')
      const index = await buildToolResolutionIndex(db)

      expect(resolveToolName('Supa base', index).toolId).toBeNull()
      expect(resolveToolName('Supabas', index).toolId).toBeNull()
    })
  })

  describe('resolveToolWithCandidateQueue', () => {
    it('should return resolved for known tools', async () => {
      const db = getTestDb()
      const tool = await seedTool(db, 'Clerk', 'clerk')
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(db, 'Clerk', index, null)
      expect(result.status).toBe('resolved')
      if (result.status === 'resolved') {
        expect(result.toolId).toBe(tool.id)
      }
    })

    it('should auto-resolve known fingerprint variants and save them as aliases', async () => {
      const db = getTestDb()
      const group = await seedCategoryGroup(db)
      const category = await seedSubcategory(db, group.id)
      const tool = await seedTool(db, 'Clerk', 'clerk')
      await assignToolToCategory(db, tool.id, category.id)
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(db, 'clerk.dev', index, category.id)

      expect(result.status).toBe('resolved')
      if (result.status === 'resolved') {
        expect(result.toolId).toBe(tool.id)
      }

      const alias = await db.query.toolAliases.findFirst({
        where: eq(toolAliases.normalizedAlias, 'clerk.dev'),
      })
      expect(alias?.toolId).toBe(tool.id)
      expect(alias?.source).toBe('auto_resolver')
    })

    it('should auto-resolve unique global fingerprints without category context', async () => {
      const db = getTestDb()
      await seedTool(db, 'Clerk', 'clerk')
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(db, 'clerk.dev', index, null)

      expect(result).toMatchObject({ status: 'resolved' })
    })

    it('should create a tool candidate for unknown tools', async () => {
      const db = getTestDb()
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(db, 'UnknownTool', index, null)
      expect(result.status).toBe('unresolved_tool')

      const candidates = await db
        .select()
        .from(toolCandidates)
        .where(eq(toolCandidates.normalizedName, 'unknowntool'))
      expect(candidates).toHaveLength(1)
      expect(candidates[0]?.rawName).toBe('UnknownTool')
      expect(candidates[0]?.seenCount).toBe(1)
      expect(candidates[0]?.status).toBe('pending')
    })

    it('should increment seenCount on second occurrence', async () => {
      const db = getTestDb()
      const index = await buildToolResolutionIndex(db)

      await resolveToolWithCandidateQueue(db, 'UnknownTool', index, null)
      await resolveToolWithCandidateQueue(db, 'UnknownTool', index, null)

      const candidates = await db
        .select()
        .from(toolCandidates)
        .where(eq(toolCandidates.normalizedName, 'unknowntool'))
      expect(candidates).toHaveLength(1)
      expect(candidates[0]?.seenCount).toBe(2)
    })

    it('should record suggestedCategoryId', async () => {
      const db = getTestDb()
      const group = await seedCategoryGroup(db)
      const category = await seedSubcategory(db, group.id)
      const index = await buildToolResolutionIndex(db)

      await resolveToolWithCandidateQueue(db, 'NewTool', index, category.id)

      const candidates = await db
        .select()
        .from(toolCandidates)
        .where(eq(toolCandidates.normalizedName, 'newtool'))
      expect(candidates[0]?.suggestedCategoryId).toBe(category.id)
    })

    it('should keep generic unknown names unresolved', async () => {
      const db = getTestDb()
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(db, 'PostgreSQL', index, null)

      expect(result.status).toBe('unresolved_tool')

      const candidate = await db.query.toolCandidates.findFirst({
        where: eq(toolCandidates.normalizedName, 'postgresql'),
      })
      expect(candidate?.status).toBe('pending')
    })

    it('should use the suggested category to disambiguate fingerprint matches', async () => {
      const db = getTestDb()
      const group = await seedCategoryGroup(db)
      const authCategory = await seedSubcategory(db, group.id)
      const opsCategory = first(
        await db
          .insert(subcategories)
          .values({ categoryId: group.id, name: 'Ops', slug: 'ops', displayOrder: 2 })
          .returning(),
      )
      const authTool = await seedTool(db, 'Acme Auth', 'acme-auth')
      const opsTool = await seedTool(db, 'Acme.Auth', 'acme-auth-dotted')
      await assignToolToCategory(db, authTool.id, authCategory.id)
      await assignToolToCategory(db, opsTool.id, opsCategory.id)
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(
        db,
        'https://acme.auth',
        index,
        authCategory.id,
      )

      expect(result).toEqual({ status: 'resolved', toolId: authTool.id })
    })

    it('should keep ambiguous fingerprint matches unresolved without category context', async () => {
      const db = getTestDb()
      const group = await seedCategoryGroup(db)
      const authCategory = await seedSubcategory(db, group.id)
      const opsCategory = first(
        await db
          .insert(subcategories)
          .values({ categoryId: group.id, name: 'Ops', slug: 'ops', displayOrder: 2 })
          .returning(),
      )
      const authTool = await seedTool(db, 'Acme Auth', 'acme-auth')
      const opsTool = await seedTool(db, 'Acme.Auth', 'acme-auth-dotted')
      await assignToolToCategory(db, authTool.id, authCategory.id)
      await assignToolToCategory(db, opsTool.id, opsCategory.id)
      const index = await buildToolResolutionIndex(db)

      const result = await resolveToolWithCandidateQueue(db, 'https://acme.auth', index, null)

      expect(result.status).toBe('unresolved_tool')

      const candidate = await db.query.toolCandidates.findFirst({
        where: eq(toolCandidates.normalizedName, 'https://acme.auth'),
      })
      expect(candidate?.status).toBe('pending')
    })
  })
})
