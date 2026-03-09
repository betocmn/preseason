import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  comments,
  criticProfiles,
  llms,
  matches,
  prompts,
  recommendations,
  runResults,
  runs,
  subcategories,
  toolCategories,
  tools,
  userProfiles,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from './db'

/** Extract first row from returning(), throwing if empty */
function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

/** Helper to insert a category group for FK-dependent tests */
async function insertCategoryGroup(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
}

describe('Database Schema', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  // ========================================================================
  // User Profiles
  // ========================================================================

  describe('User Profiles', () => {
    it('should create and query user profiles', async () => {
      const db = getTestDb()
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'user',
      })

      const result = await db.select().from(userProfiles)
      expect(result).toHaveLength(1)
      expect(result[0]?.email).toBe('test@example.com')
      expect(result[0]?.displayName).toBe('Test User')
      expect(result[0]?.role).toBe('user')
    })

    it('should enforce unique email constraint', async () => {
      const db = getTestDb()
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        email: 'dupe@example.com',
        displayName: 'User 1',
      })

      await expect(
        db.insert(userProfiles).values({
          id: crypto.randomUUID(),
          email: 'dupe@example.com',
          displayName: 'User 2',
        }),
      ).rejects.toThrow()
    })

    it('should support all user roles', async () => {
      const db = getTestDb()
      const roleValues = ['admin', 'provider', 'critic', 'user'] as const
      for (const role of roleValues) {
        await db.insert(userProfiles).values({
          id: crypto.randomUUID(),
          email: `${role}@example.com`,
          displayName: `${role} user`,
          role,
        })
      }
      const result = await db.select().from(userProfiles)
      expect(result).toHaveLength(4)
    })
  })

  // ========================================================================
  // Category Groups
  // ========================================================================

  describe('Category Groups', () => {
    it('should create and query category groups', async () => {
      const db = getTestDb()
      await db.insert(categories).values({
        name: 'Devtools',
        slug: 'devtools',
        description: 'Developer tools',
        icon: 'code',
        displayOrder: 1,
      })

      const result = await db.select().from(categories)
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('Devtools')
      expect(result[0]?.slug).toBe('devtools')
      expect(result[0]?.displayOrder).toBe(1)
      expect(result[0]?.id).toBeDefined()
    })

    it('should enforce unique name constraint', async () => {
      const db = getTestDb()
      await db.insert(categories).values({ name: 'Devtools', slug: 'devtools' })
      await expect(
        db.insert(categories).values({ name: 'Devtools', slug: 'devtools-2' }),
      ).rejects.toThrow()
    })

    it('should enforce unique slug constraint', async () => {
      const db = getTestDb()
      await db.insert(categories).values({ name: 'Devtools', slug: 'devtools' })
      await expect(
        db.insert(categories).values({ name: 'Dev Tools', slug: 'devtools' }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Subcategories
  // ========================================================================

  describe('Subcategories', () => {
    it('should create and query subcategories with group reference', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)

      await db.insert(subcategories).values({
        name: 'Authentication',
        slug: 'auth',
        categoryId: group.id,
        description: 'Auth tools',
        icon: 'lock',
        displayOrder: 1,
      })

      const result = await db.select().from(subcategories)
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('Authentication')
      expect(result[0]?.slug).toBe('auth')
      expect(result[0]?.categoryId).toBe(group.id)
      expect(result[0]?.displayOrder).toBe(1)
    })

    it('should enforce unique name constraint', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      await db
        .insert(subcategories)
        .values({ name: 'Database', slug: 'database', categoryId: group.id })
      await expect(
        db.insert(subcategories).values({ name: 'Database', slug: 'db', categoryId: group.id }),
      ).rejects.toThrow()
    })

    it('should enforce unique slug constraint', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      await db
        .insert(subcategories)
        .values({ name: 'Database', slug: 'database', categoryId: group.id })
      await expect(
        db.insert(subcategories).values({ name: 'DB', slug: 'database', categoryId: group.id }),
      ).rejects.toThrow()
    })

    it('should cascade delete when group is deleted', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      await db.insert(subcategories).values({ name: 'Auth', slug: 'auth', categoryId: group.id })

      await db.delete(categories).where(eq(categories.id, group.id))
      const result = await db.select().from(subcategories)
      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // Tools
  // ========================================================================

  describe('Tools', () => {
    it('should create and query tools', async () => {
      const db = getTestDb()
      await db.insert(tools).values({
        name: 'Supabase',
        slug: 'supabase',
        description: 'Open source Firebase alternative',
        website: 'https://supabase.com',
      })

      const result = await db.select().from(tools)
      expect(result).toHaveLength(1)
      expect(result[0]?.name).toBe('Supabase')
      expect(result[0]?.isVerified).toBe(false)
    })

    it('should enforce unique name and slug', async () => {
      const db = getTestDb()
      await db.insert(tools).values({ name: 'Stripe', slug: 'stripe' })
      await expect(db.insert(tools).values({ name: 'Stripe', slug: 'stripe-2' })).rejects.toThrow()
      await expect(db.insert(tools).values({ name: 'Stripe 2', slug: 'stripe' })).rejects.toThrow()
    })

    it('should support text array aliases', async () => {
      const db = getTestDb()
      await db.insert(tools).values({
        name: 'NextAuth.js',
        slug: 'nextauth',
        aliases: ['next-auth', 'NextAuth', 'Auth.js'],
      })

      const result = await db.select().from(tools)
      expect(result[0]?.aliases).toEqual(['next-auth', 'NextAuth', 'Auth.js'])
    })

    it('should allow nullable providerUserId', async () => {
      const db = getTestDb()
      await db.insert(tools).values({
        name: 'Clerk',
        slug: 'clerk',
        providerUserId: null,
      })
      const result = await db.select().from(tools)
      expect(result[0]?.providerUserId).toBeNull()
    })
  })

  // ========================================================================
  // Tool Categories (junction)
  // ========================================================================

  describe('Tool Categories', () => {
    it('should create junction records', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Auth', slug: 'auth', categoryId: group.id })
          .returning(),
      )
      const tool = first(
        await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning(),
      )

      await db.insert(toolCategories).values({
        toolId: tool.id,
        categoryId: cat.id,
        isPrimary: true,
      })

      const result = await db.select().from(toolCategories)
      expect(result).toHaveLength(1)
      expect(result[0]?.isPrimary).toBe(true)
    })

    it('should enforce unique (toolId, categoryId)', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Auth', slug: 'auth', categoryId: group.id })
          .returning(),
      )
      const tool = first(
        await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning(),
      )

      await db.insert(toolCategories).values({ toolId: tool.id, categoryId: cat.id })
      await expect(
        db.insert(toolCategories).values({ toolId: tool.id, categoryId: cat.id }),
      ).rejects.toThrow()
    })

    it('should cascade delete when tool is deleted', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Auth', slug: 'auth', categoryId: group.id })
          .returning(),
      )
      const tool = first(
        await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning(),
      )
      await db.insert(toolCategories).values({ toolId: tool.id, categoryId: cat.id })

      await db.delete(tools).where(eq(tools.id, tool.id))
      const result = await db.select().from(toolCategories)
      expect(result).toHaveLength(0)
    })

    it('should cascade delete when category is deleted', async () => {
      const db = getTestDb()
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Auth', slug: 'auth', categoryId: group.id })
          .returning(),
      )
      const tool = first(
        await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning(),
      )
      await db.insert(toolCategories).values({ toolId: tool.id, categoryId: cat.id })

      await db.delete(subcategories).where(eq(subcategories.id, cat.id))
      const result = await db.select().from(toolCategories)
      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // LLMs
  // ========================================================================

  describe('LLMs', () => {
    it('should create and query LLMs', async () => {
      const db = getTestDb()
      await db.insert(llms).values({
        name: 'Claude 3.5 Sonnet',
        slug: 'claude-3-5-sonnet',
        provider: 'Anthropic',
        modelId: 'anthropic/claude-3.5-sonnet',
      })

      const result = await db.select().from(llms)
      expect(result).toHaveLength(1)
      expect(result[0]?.isActive).toBe(true)
    })

    it('should enforce unique slug', async () => {
      const db = getTestDb()
      await db.insert(llms).values({
        name: 'GPT-4o',
        slug: 'gpt-4o',
        provider: 'OpenAI',
        modelId: 'openai/gpt-4o',
      })
      await expect(
        db.insert(llms).values({
          name: 'GPT-4o Duplicate',
          slug: 'gpt-4o',
          provider: 'OpenAI',
          modelId: 'openai/gpt-4o-2',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Prompts
  // ========================================================================

  describe('Prompts', () => {
    it('should create and query prompts', async () => {
      const db = getTestDb()
      await db.insert(prompts).values({
        title: 'Real Estate Website',
        slug: 'real-estate-website',
        description: 'A typical real estate site project',
      })

      const result = await db.select().from(prompts)
      expect(result).toHaveLength(1)
      expect(result[0]?.isActive).toBe(true)
    })

    it('should support text array expectedCategories', async () => {
      const db = getTestDb()
      await db.insert(prompts).values({
        title: 'SaaS App',
        slug: 'saas-app',
        expectedCategories: ['auth', 'payments', 'database'],
      })

      const result = await db.select().from(prompts)
      expect(result[0]?.expectedCategories).toEqual(['auth', 'payments', 'database'])
    })

    it('should default level to vibe-coder', async () => {
      const db = getTestDb()
      await db.insert(prompts).values({
        title: 'Test Prompt',
        slug: 'test-prompt',
      })

      const result = await db.select().from(prompts)
      expect(result[0]?.level).toBe('vibe-coder')
    })

    it('should allow same slug with different levels', async () => {
      const db = getTestDb()
      await db.insert(prompts).values({
        title: 'Real Estate Website',
        slug: 'real-estate-website',
        level: 'vibe-coder',
      })
      await db.insert(prompts).values({
        title: 'Real Estate Website',
        slug: 'real-estate-website',
        level: 'software-dev-beginner',
      })

      const result = await db.select().from(prompts)
      expect(result).toHaveLength(2)
    })

    it('should enforce unique (slug, level)', async () => {
      const db = getTestDb()
      await db.insert(prompts).values({
        title: 'Test',
        slug: 'test',
        level: 'vibe-coder',
      })
      await expect(
        db.insert(prompts).values({
          title: 'Test Duplicate',
          slug: 'test',
          level: 'vibe-coder',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Runs
  // ========================================================================

  describe('Runs', () => {
    it('should create with default status pending', async () => {
      const db = getTestDb()
      await db.insert(runs).values({})

      const result = await db.select().from(runs)
      expect(result).toHaveLength(1)
      expect(result[0]?.status).toBe('pending')
      expect(result[0]?.trigger).toBe('cron')
    })

    it('should persist manual prompt and llm selection ids', async () => {
      const db = getTestDb()
      await db.insert(runs).values({
        trigger: 'manual',
        promptIds: ['11111111-1111-1111-1111-111111111111'],
        llmIds: ['22222222-2222-2222-2222-222222222222'],
      })

      const result = await db.select().from(runs)
      expect(result[0]?.promptIds).toEqual(['11111111-1111-1111-1111-111111111111'])
      expect(result[0]?.llmIds).toEqual(['22222222-2222-2222-2222-222222222222'])
    })

    it('should support all run status values', async () => {
      const db = getTestDb()
      const statusValues = ['pending', 'running', 'completed', 'failed'] as const
      for (const status of statusValues) {
        await db.insert(runs).values({ status, trigger: 'manual' })
      }
      const result = await db.select().from(runs)
      expect(result).toHaveLength(4)
    })
  })

  // ========================================================================
  // Run Results
  // ========================================================================

  describe('Run Results', () => {
    it('should create with FK references', async () => {
      const db = getTestDb()
      const run = first(await db.insert(runs).values({}).returning())
      const prompt = first(
        await db.insert(prompts).values({ title: 'Test', slug: 'test' }).returning(),
      )
      const llm = first(
        await db
          .insert(llms)
          .values({
            name: 'GPT-4o',
            slug: 'gpt-4o',
            provider: 'OpenAI',
            modelId: 'openai/gpt-4o',
          })
          .returning(),
      )

      await db.insert(runResults).values({
        runId: run.id,
        promptId: prompt.id,
        llmId: llm.id,
        rawResponse: '{"recommendations":[]}',
        responseTimeMs: 1500,
      })

      const result = await db.select().from(runResults)
      expect(result).toHaveLength(1)
      expect(result[0]?.parseStatus).toBe('pending')
    })

    it('should enforce unique (runId, promptId, llmId)', async () => {
      const db = getTestDb()
      const run = first(await db.insert(runs).values({}).returning())
      const prompt = first(
        await db.insert(prompts).values({ title: 'Test', slug: 'test' }).returning(),
      )
      const llm = first(
        await db
          .insert(llms)
          .values({
            name: 'GPT-4o',
            slug: 'gpt-4o',
            provider: 'OpenAI',
            modelId: 'openai/gpt-4o',
          })
          .returning(),
      )

      await db.insert(runResults).values({
        runId: run.id,
        promptId: prompt.id,
        llmId: llm.id,
      })
      await expect(
        db.insert(runResults).values({
          runId: run.id,
          promptId: prompt.id,
          llmId: llm.id,
        }),
      ).rejects.toThrow()
    })

    it('should cascade delete when run is deleted', async () => {
      const db = getTestDb()
      const run = first(await db.insert(runs).values({}).returning())
      const prompt = first(
        await db.insert(prompts).values({ title: 'Test', slug: 'test' }).returning(),
      )
      const llm = first(
        await db
          .insert(llms)
          .values({
            name: 'GPT-4o',
            slug: 'gpt-4o',
            provider: 'OpenAI',
            modelId: 'openai/gpt-4o',
          })
          .returning(),
      )

      await db.insert(runResults).values({
        runId: run.id,
        promptId: prompt.id,
        llmId: llm.id,
      })

      await db.delete(runs).where(eq(runs.id, run.id))
      const result = await db.select().from(runResults)
      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // Recommendations
  // ========================================================================

  describe('Recommendations', () => {
    it('should create with FK references', async () => {
      const db = getTestDb()
      const run = first(await db.insert(runs).values({}).returning())
      const prompt = first(
        await db.insert(prompts).values({ title: 'Test', slug: 'test' }).returning(),
      )
      const llm = first(
        await db
          .insert(llms)
          .values({
            name: 'GPT-4o',
            slug: 'gpt-4o',
            provider: 'OpenAI',
            modelId: 'openai/gpt-4o',
          })
          .returning(),
      )
      const runResult = first(
        await db
          .insert(runResults)
          .values({ runId: run.id, promptId: prompt.id, llmId: llm.id })
          .returning(),
      )
      const tool = first(
        await db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning(),
      )
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Database', slug: 'database', categoryId: group.id })
          .returning(),
      )

      await db.insert(recommendations).values({
        runResultId: runResult.id,
        toolId: tool.id,
        categoryId: cat.id,
        confidence: 0.95,
        reasoning: 'Great database solution',
        rank: 1,
      })

      const result = await db.select().from(recommendations)
      expect(result).toHaveLength(1)
      expect(result[0]?.confidence).toBeCloseTo(0.95)
      expect(result[0]?.rank).toBe(1)
    })

    it('should cascade delete when runResult is deleted', async () => {
      const db = getTestDb()
      const run = first(await db.insert(runs).values({}).returning())
      const prompt = first(
        await db.insert(prompts).values({ title: 'Test', slug: 'test' }).returning(),
      )
      const llm = first(
        await db
          .insert(llms)
          .values({
            name: 'GPT-4o',
            slug: 'gpt-4o',
            provider: 'OpenAI',
            modelId: 'openai/gpt-4o',
          })
          .returning(),
      )
      const runResult = first(
        await db
          .insert(runResults)
          .values({ runId: run.id, promptId: prompt.id, llmId: llm.id })
          .returning(),
      )
      const tool = first(
        await db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning(),
      )
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Database', slug: 'database', categoryId: group.id })
          .returning(),
      )

      await db.insert(recommendations).values({
        runResultId: runResult.id,
        toolId: tool.id,
        categoryId: cat.id,
      })

      await db.delete(runResults).where(eq(runResults.id, runResult.id))
      const result = await db.select().from(recommendations)
      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // Matches
  // ========================================================================

  describe('Matches', () => {
    it('should create with FK references and defaults', async () => {
      const db = getTestDb()
      const [inserted1, inserted2] = await Promise.all([
        db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning(),
        db.insert(tools).values({ name: 'PlanetScale', slug: 'planetscale' }).returning(),
      ])
      // Canonical ordering: toolAId < toolBId
      const [toolA, toolB] =
        first(inserted1).id < first(inserted2).id
          ? [first(inserted1), first(inserted2)]
          : [first(inserted2), first(inserted1)]
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Database', slug: 'database', categoryId: group.id })
          .returning(),
      )

      await db.insert(matches).values({
        slug: 'supabase-vs-planetscale-database-2025-01',
        toolAId: toolA.id,
        toolBId: toolB.id,
        categoryId: cat.id,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-07',
      })

      const result = await db.select().from(matches)
      expect(result).toHaveLength(1)
      expect(result[0]?.status).toBe('active')
      expect(result[0]?.toolAScore).toBe(0)
      expect(result[0]?.toolBScore).toBe(0)
      expect(result[0]?.totalPrompts).toBe(0)
      expect(result[0]?.winnerToolId).toBeNull()
    })

    it('should enforce unique (toolAId, toolBId, categoryId, periodStart)', async () => {
      const db = getTestDb()
      const [inserted1, inserted2] = await Promise.all([
        db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning(),
        db.insert(tools).values({ name: 'Neon', slug: 'neon' }).returning(),
      ])
      // Canonical ordering: toolAId < toolBId
      const [toolA, toolB] =
        first(inserted1).id < first(inserted2).id
          ? [first(inserted1), first(inserted2)]
          : [first(inserted2), first(inserted1)]
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Database', slug: 'database', categoryId: group.id })
          .returning(),
      )

      await db.insert(matches).values({
        slug: 'supabase-vs-neon-database-2025-01',
        toolAId: toolA.id,
        toolBId: toolB.id,
        categoryId: cat.id,
        periodStart: '2025-01-01',
        periodEnd: '2025-01-07',
      })
      await expect(
        db.insert(matches).values({
          slug: 'supabase-vs-neon-database-2025-01-dup',
          toolAId: toolA.id,
          toolBId: toolB.id,
          categoryId: cat.id,
          periodStart: '2025-01-01',
          periodEnd: '2025-01-07',
        }),
      ).rejects.toThrow()
    })

    it('should support all match status values', async () => {
      const db = getTestDb()
      const [inserted1, inserted2] = await Promise.all([
        db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning(),
        db.insert(tools).values({ name: 'Neon', slug: 'neon' }).returning(),
      ])
      // Canonical ordering: toolAId < toolBId
      const [toolA, toolB] =
        first(inserted1).id < first(inserted2).id
          ? [first(inserted1), first(inserted2)]
          : [first(inserted2), first(inserted1)]
      const group = await insertCategoryGroup(db)
      const cat = first(
        await db
          .insert(subcategories)
          .values({ name: 'Database', slug: 'database', categoryId: group.id })
          .returning(),
      )

      const statusValues = ['active', 'settled', 'archived'] as const
      for (const [i, status] of statusValues.entries()) {
        await db.insert(matches).values({
          slug: `status-test-${status}`,
          toolAId: toolA.id,
          toolBId: toolB.id,
          categoryId: cat.id,
          status,
          periodStart: `2025-0${i + 1}-01`,
          periodEnd: `2025-0${i + 1}-07`,
        })
      }
      const result = await db.select().from(matches)
      expect(result).toHaveLength(3)
    })
  })

  // ========================================================================
  // Critic Profiles
  // ========================================================================

  describe('Critic Profiles', () => {
    it('should create with FK reference to user', async () => {
      const db = getTestDb()
      const userId = crypto.randomUUID()
      await db.insert(userProfiles).values({
        id: userId,
        email: 'critic@example.com',
        displayName: 'Critic',
        role: 'critic',
      })

      await db.insert(criticProfiles).values({
        slug: 'senior-engineer',
        userId,
        title: 'Senior Engineer',
        expertiseAreas: ['auth', 'database'],
        excludedCategories: ['payments'],
      })

      const result = await db.select().from(criticProfiles)
      expect(result).toHaveLength(1)
      expect(result[0]?.title).toBe('Senior Engineer')
      expect(result[0]?.expertiseAreas).toEqual(['auth', 'database'])
      expect(result[0]?.excludedCategories).toEqual(['payments'])
      expect(result[0]?.isActive).toBe(true)
    })

    it('should enforce unique userId', async () => {
      const db = getTestDb()
      const userId = crypto.randomUUID()
      await db.insert(userProfiles).values({
        id: userId,
        email: 'critic@example.com',
        displayName: 'Critic',
      })

      await db.insert(criticProfiles).values({ slug: 'unique-critic', userId })
      await expect(
        db.insert(criticProfiles).values({ slug: 'unique-critic-2', userId }),
      ).rejects.toThrow()
    })

    it('should cascade delete when user is deleted', async () => {
      const db = getTestDb()
      const userId = crypto.randomUUID()
      await db.insert(userProfiles).values({
        id: userId,
        email: 'critic@example.com',
        displayName: 'Critic',
      })
      await db.insert(criticProfiles).values({ slug: 'cascade-critic', userId })

      await db.delete(userProfiles).where(eq(userProfiles.id, userId))
      const result = await db.select().from(criticProfiles)
      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // Comments
  // ========================================================================

  describe('Comments', () => {
    it('should create with FK reference to critic', async () => {
      const db = getTestDb()
      const userId = crypto.randomUUID()
      await db.insert(userProfiles).values({
        id: userId,
        email: 'critic@example.com',
        displayName: 'Critic',
      })
      const critic = first(
        await db.insert(criticProfiles).values({ slug: 'comment-critic', userId }).returning(),
      )

      await db.insert(comments).values({
        criticId: critic.id,
        targetType: 'tool',
        targetId: crypto.randomUUID(),
        content: 'Great tool for authentication',
      })

      const result = await db.select().from(comments)
      expect(result).toHaveLength(1)
      expect(result[0]?.isPinned).toBe(false)
    })

    it('should support all comment_target enum values', async () => {
      const db = getTestDb()
      const userId = crypto.randomUUID()
      await db.insert(userProfiles).values({
        id: userId,
        email: 'critic@example.com',
        displayName: 'Critic',
      })
      const critic = first(
        await db.insert(criticProfiles).values({ slug: 'target-critic', userId }).returning(),
      )

      const targets = ['recommendation', 'match', 'tool'] as const
      for (const targetType of targets) {
        await db.insert(comments).values({
          criticId: critic.id,
          targetType,
          targetId: crypto.randomUUID(),
          content: `Comment on ${targetType}`,
        })
      }

      const result = await db.select().from(comments)
      expect(result).toHaveLength(3)
    })

    it('should cascade delete when critic is deleted', async () => {
      const db = getTestDb()
      const userId = crypto.randomUUID()
      await db.insert(userProfiles).values({
        id: userId,
        email: 'critic@example.com',
        displayName: 'Critic',
      })
      const critic = first(
        await db
          .insert(criticProfiles)
          .values({ slug: 'cascade-comment-critic', userId })
          .returning(),
      )
      await db.insert(comments).values({
        criticId: critic.id,
        targetType: 'tool',
        targetId: crypto.randomUUID(),
        content: 'Test comment',
      })

      await db.delete(criticProfiles).where(eq(criticProfiles.id, critic.id))
      const result = await db.select().from(comments)
      expect(result).toHaveLength(0)
    })
  })
})
