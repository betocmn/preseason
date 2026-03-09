import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  llms,
  matches,
  prompts,
  recommendations,
  runResults,
  runs,
  subcategories,
  tools,
} from '~/server/db/schema'
import { settleExpiredMatches } from '~/server/llm/automation/match-settler'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

describe('settleExpiredMatches', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedFixture() {
    const database = getTestDb()

    const [group] = await database
      .insert(categories)
      .values([{ name: 'Devtools', slug: 'devtools', displayOrder: 1 }])
      .returning()

    const [category] = await database
      .insert(subcategories)
      .values([{ name: 'Database', slug: 'database', categoryId: group?.id ?? '' }])
      .returning()

    const [rawToolA, rawToolB] = await database
      .insert(tools)
      .values([
        { name: 'Supabase', slug: 'supabase' },
        { name: 'PlanetScale', slug: 'planetscale' },
      ])
      .returning()
    const [toolA, toolB] =
      (rawToolA?.id ?? '') < (rawToolB?.id ?? '') ? [rawToolA, rawToolB] : [rawToolB, rawToolA]

    const [llm] = await database
      .insert(llms)
      .values([
        {
          name: 'GPT-4o',
          slug: 'gpt-4o',
          provider: 'OpenAI',
          modelId: 'openai/gpt-4o',
          isActive: true,
        },
      ])
      .returning()

    const [promptA, promptB] = await database
      .insert(prompts)
      .values([
        { title: 'Prompt A', slug: 'real-estate-website', level: 'vibe-coder', isActive: true },
        { title: 'Prompt B', slug: 'saas-application', level: 'vibe-coder', isActive: true },
      ])
      .returning()

    const [run] = await database
      .insert(runs)
      .values([
        {
          status: 'completed',
          trigger: 'cron',
          promptIds: [promptA?.id ?? '', promptB?.id ?? ''],
          llmIds: [llm?.id ?? ''],
          promptCount: 2,
          llmCount: 1,
        },
      ])
      .returning()

    const [runResultA, runResultB] = await database
      .insert(runResults)
      .values([
        {
          runId: run?.id ?? '',
          promptId: promptA?.id ?? '',
          llmId: llm?.id ?? '',
          parseStatus: 'success',
        },
        {
          runId: run?.id ?? '',
          promptId: promptB?.id ?? '',
          llmId: llm?.id ?? '',
          parseStatus: 'success',
        },
      ])
      .returning()

    return {
      category,
      toolA,
      toolB,
      runResultA,
      runResultB,
    }
  }

  it('settles active matches past period end with correct scores and winner', async () => {
    const database = getTestDb()
    const fixture = await seedFixture()

    const [activeMatch] = await database
      .insert(matches)
      .values([
        {
          slug: 'settler-test-active',
          toolAId: fixture.toolA?.id ?? '',
          toolBId: fixture.toolB?.id ?? '',
          categoryId: fixture.category?.id ?? '',
          status: 'active',
          periodStart: '2026-02-20',
          periodEnd: '2026-02-26',
          startedAt: new Date('2026-02-20T00:00:00.000Z'),
        },
      ])
      .returning()

    await database.insert(recommendations).values([
      {
        runResultId: fixture.runResultA?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        createdAt: new Date('2026-02-22T10:00:00.000Z'),
      },
      {
        runResultId: fixture.runResultB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        createdAt: new Date('2026-02-23T10:00:00.000Z'),
      },
      {
        runResultId: fixture.runResultB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        createdAt: new Date('2026-02-24T10:00:00.000Z'),
      },
    ])

    const summary = await settleExpiredMatches({
      database,
      now: () => new Date('2026-02-28T12:00:00.000Z'),
    })

    expect(summary.settledCount).toBe(1)
    expect(summary.settled[0]).toMatchObject({
      id: activeMatch?.id,
      toolAScore: 2,
      toolBScore: 1,
      winnerToolId: fixture.toolA?.id,
    })

    const settledMatch = await database.query.matches.findFirst({
      where: (table, { eq }) => eq(table.id, activeMatch?.id ?? ''),
    })

    expect(settledMatch?.status).toBe('settled')
    expect(settledMatch?.winnerToolId).toBe(fixture.toolA?.id)
    expect(settledMatch?.totalPrompts).toBe(2)
  })

  it('does not settle non-expired matches', async () => {
    const database = getTestDb()
    const fixture = await seedFixture()

    await database.insert(matches).values([
      {
        slug: 'settler-nonexpired-1',
        toolAId: fixture.toolA?.id ?? '',
        toolBId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        status: 'active',
        periodStart: '2026-02-27',
        periodEnd: '2026-03-03',
      },
      {
        slug: 'settler-nonexpired-2',
        toolAId: fixture.toolA?.id ?? '',
        toolBId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        status: 'active',
        periodStart: '2026-02-21',
        periodEnd: '2026-03-10',
      },
    ])

    const summary = await settleExpiredMatches({
      database,
      now: () => new Date('2026-02-28T12:00:00.000Z'),
    })

    expect(summary.settledCount).toBe(0)

    const activeMatches = await database.query.matches.findMany({
      where: (table, { eq }) => eq(table.status, 'active'),
    })
    expect(activeMatches).toHaveLength(2)
  })

  it('settles ties with no winner', async () => {
    const database = getTestDb()
    const fixture = await seedFixture()

    const [activeMatch] = await database
      .insert(matches)
      .values([
        {
          slug: 'settler-tie-match',
          toolAId: fixture.toolA?.id ?? '',
          toolBId: fixture.toolB?.id ?? '',
          categoryId: fixture.category?.id ?? '',
          status: 'active',
          periodStart: '2026-02-20',
          periodEnd: '2026-02-26',
        },
      ])
      .returning()

    await database.insert(recommendations).values([
      {
        runResultId: fixture.runResultA?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        createdAt: new Date('2026-02-22T10:00:00.000Z'),
      },
      {
        runResultId: fixture.runResultB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        createdAt: new Date('2026-02-23T10:00:00.000Z'),
      },
    ])

    const summary = await settleExpiredMatches({
      database,
      now: () => new Date('2026-02-28T12:00:00.000Z'),
    })

    expect(summary.settledCount).toBe(1)
    expect(summary.settled[0]?.winnerToolId).toBeNull()

    const settledMatch = await database.query.matches.findFirst({
      where: (table, { eq }) => eq(table.id, activeMatch?.id ?? ''),
    })

    expect(settledMatch?.status).toBe('settled')
    expect(settledMatch?.winnerToolId).toBeNull()
  })
})
