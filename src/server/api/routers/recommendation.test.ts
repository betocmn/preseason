import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  llms,
  prompts,
  recommendations,
  runResults,
  runs,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller } from '~/test/trpc'

describe('recommendationRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedRecommendationFixture() {
    const db = getTestDb()

    const [authCategory, dbCategory] = await db
      .insert(categories)
      .values([
        { name: 'Authentication', slug: 'auth' },
        { name: 'Database', slug: 'database' },
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

    const prompt = (
      await db
        .insert(prompts)
        .values({
          title: 'Prompt',
          slug: 'prompt',
          level: 'vibe-coder',
          isActive: true,
        })
        .returning()
    )[0]
    const run = (await db.insert(runs).values({ status: 'completed' }).returning())[0]

    const [rrA, rrB] = await db
      .insert(runResults)
      .values([
        {
          runId: run?.id ?? '',
          promptId: prompt?.id ?? '',
          llmId: llmA?.id ?? '',
          parseStatus: 'success',
        },
        {
          runId: run?.id ?? '',
          promptId: prompt?.id ?? '',
          llmId: llmB?.id ?? '',
          parseStatus: 'success',
        },
      ])
      .returning()

    return {
      authCategory,
      dbCategory,
      toolA,
      toolB,
      llmA,
      llmB,
      rrA,
      rrB,
    }
  }

  it('returns feed with filters and pagination', async () => {
    const fixture = await seedRecommendationFixture()
    const db = getTestDb()

    await db.insert(recommendations).values([
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        rank: 1,
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.dbCategory?.id ?? '',
        rank: 1,
      },
    ])

    const caller = createTestCaller(null)
    const authFeed = await caller.recommendation.getFeed({
      categorySlug: 'auth',
      limit: 10,
      offset: 0,
    })
    expect(authFeed.total).toBe(1)
    expect(authFeed.items[0]?.category.slug).toBe('auth')

    const llmFeed = await caller.recommendation.getFeed({
      llmSlug: 'gpt-4o',
      limit: 10,
      offset: 0,
    })
    expect(llmFeed.total).toBe(1)
    expect(llmFeed.items[0]?.llm.slug).toBe('gpt-4o')
  })

  it('computes stats by category and tool', async () => {
    const fixture = await seedRecommendationFixture()
    const db = getTestDb()
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

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
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: yesterday,
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: now,
      },
    ])

    const caller = createTestCaller(null)
    const stats = await caller.recommendation.getStats({
      days: 30,
      categorySlug: 'auth',
    })

    expect(stats.items[0]?.tool.slug).toBe('clerk')
    expect(stats.items[0]?.recommendationCount).toBe(2)
    expect(stats.items[0]?.rate).toBeCloseTo(2 / 3)
  })

  it('computes trending changes across windows', async () => {
    const fixture = await seedRecommendationFixture()
    const db = getTestDb()
    const now = new Date()
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const tenDaysAgo = new Date(now)
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

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
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: twoDaysAgo,
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.authCategory?.id ?? '',
        createdAt: tenDaysAgo,
      },
    ])

    const caller = createTestCaller(null)
    const trending = await caller.recommendation.getTrending({
      currentWindowDays: 7,
      previousWindowDays: 7,
      limit: 10,
      categorySlug: 'auth',
    })

    expect(trending.items).toHaveLength(2)
    expect(trending.items[0]?.tool.slug).toBe('clerk')
    expect(trending.items[0]?.direction).toBe('up')
  })
})
