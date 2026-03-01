import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  categories,
  llms,
  prompts,
  recommendations,
  runResults,
  runs,
  subcategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller } from '~/test/trpc'

describe('rankingRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedRankingFixture() {
    const db = getTestDb()
    const [group] = await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning()
    const [authCategory, dbCategory] = await db
      .insert(subcategories)
      .values([
        { name: 'Authentication', slug: 'auth', categoryId: group?.id ?? '' },
        { name: 'Database', slug: 'database', categoryId: group?.id ?? '' },
      ])
      .returning()
    const [toolA, toolB] = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const [llmA, llmB] = await db
      .insert(llms)
      .values([
        { name: 'GPT-4o', slug: 'gpt-4o', provider: 'OpenAI', modelId: 'openai/gpt-4o' },
        { name: 'Claude', slug: 'claude', provider: 'Anthropic', modelId: 'anthropic/claude' },
      ])
      .returning()
    const [promptA, promptB] = await db
      .insert(prompts)
      .values([
        { title: 'Prompt A', slug: 'prompt-a', level: 'vibe-coder' },
        { title: 'Prompt B', slug: 'prompt-b', level: 'vibe-coder' },
      ])
      .returning()
    const run = (await db.insert(runs).values({ status: 'completed' }).returning())[0]
    const [rrA, rrB] = await db
      .insert(runResults)
      .values([
        {
          runId: run?.id ?? '',
          promptId: promptA?.id ?? '',
          llmId: llmA?.id ?? '',
          parseStatus: 'success',
        },
        {
          runId: run?.id ?? '',
          promptId: promptB?.id ?? '',
          llmId: llmB?.id ?? '',
          parseStatus: 'success',
        },
      ])
      .returning()

    return { authCategory, dbCategory, toolA, toolB, rrA, rrB }
  }

  it('returns category rankings with recommendation rate and consistency', async () => {
    const fixture = await seedRankingFixture()
    const db = getTestDb()
    const now = new Date()

    await db.insert(recommendations).values([
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: now,
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: now,
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: now,
      },
    ])

    const caller = createTestCaller(null)
    const ranking = await caller.ranking.bySubcategorySlug({
      subcategorySlug: 'auth',
      days: 30,
      limit: 10,
    })

    expect(ranking.items).toHaveLength(2)
    expect(ranking.items[0]?.tool.slug).toBe('clerk')
    expect(ranking.items[0]?.recommendationRate).toBeCloseTo(2 / 3)
    expect(ranking.items[0]?.consistencyScore).toBeGreaterThan(0)
  })

  it('returns overall ranking across categories', async () => {
    const fixture = await seedRankingFixture()
    const db = getTestDb()
    const now = new Date()

    await db.insert(recommendations).values([
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: now,
      },
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.dbCategory?.id ?? '',
        createdAt: now,
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: now,
      },
    ])

    const caller = createTestCaller(null)
    const overall = await caller.ranking.overall({
      days: 30,
      limit: 10,
    })

    expect(overall.items.length).toBeGreaterThan(0)
    expect(overall.items[0]?.tool.slug).toBe('clerk')
    expect(overall.items[0]?.categoryCoverage).toBe(2)
  })

  it('treats the window boundary as current-period only', async () => {
    const fixture = await seedRankingFixture()
    const db = getTestDb()
    const fixedNow = new Date('2026-01-31T12:00:00.000Z')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fixedNow)

    try {
      const currentStart = new Date(fixedNow)
      currentStart.setDate(currentStart.getDate() - 30)

      await db.insert(recommendations).values({
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: currentStart,
      })

      const caller = createTestCaller(null)
      const categoryRanking = await caller.ranking.bySubcategorySlug({
        subcategorySlug: 'auth',
        days: 30,
        limit: 10,
      })
      const overallRanking = await caller.ranking.overall({
        days: 30,
        limit: 10,
      })

      expect(categoryRanking.items[0]?.trend).toBe(1)
      expect(overallRanking.items[0]?.trend).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns empty result for unknown category slug', async () => {
    const caller = createTestCaller(null)
    const ranking = await caller.ranking.bySubcategorySlug({
      subcategorySlug: 'missing',
      days: 30,
      limit: 10,
    })

    expect(ranking.category).toBeNull()
    expect(ranking.items).toEqual([])
  })
})
