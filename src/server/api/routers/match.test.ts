import type { TRPCError } from '@trpc/server'
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
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('matchRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedMatchFixture() {
    const db = getTestDb()
    const [group] = await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning()
    const category = (
      await db
        .insert(subcategories)
        .values({ name: 'Database', slug: 'database', categoryId: group?.id ?? '' })
        .returning()
    )[0]
    const [rawToolA, rawToolB] = await db
      .insert(tools)
      .values([
        { name: 'Supabase', slug: 'supabase' },
        { name: 'PlanetScale', slug: 'planetscale' },
      ])
      .returning()
    const [toolA, toolB] =
      (rawToolA?.id ?? '') < (rawToolB?.id ?? '') ? [rawToolA, rawToolB] : [rawToolB, rawToolA]

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

    return { category, toolA, toolB, rrA, rrB }
  }

  it('lists active and settled matches', async () => {
    const fixture = await seedMatchFixture()
    const db = getTestDb()
    await db.insert(matches).values([
      {
        toolAId: fixture.toolA?.id ?? '',
        toolBId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        status: 'active',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-07',
      },
      {
        toolAId: fixture.toolA?.id ?? '',
        toolBId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        status: 'settled',
        periodStart: '2025-01-08',
        periodEnd: '2025-01-14',
      },
    ])

    const caller = createTestCaller(null)
    const active = await caller.match.listActive({ categorySlug: 'database' })
    const settled = await caller.match.listSettled({ limit: 20, offset: 0 })

    expect(active).toHaveLength(1)
    expect(active[0]?.status).toBe('active')
    expect(settled.total).toBe(1)
    expect(settled.items[0]?.status).toBe('settled')
  })

  it('creates match with canonical tool ordering', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchFixture()

    const created = await caller.match.create({
      toolAId: fixture.toolB?.id ?? '',
      toolBId: fixture.toolA?.id ?? '',
      categoryId: fixture.category?.id ?? '',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-07'),
    })

    expect((created?.toolAId ?? '') < (created?.toolBId ?? '')).toBe(true)
  })

  it('returns match breakdown and settles with winner', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchFixture()
    const db = getTestDb()

    const match = (
      await db
        .insert(matches)
        .values({
          toolAId: fixture.toolA?.id ?? '',
          toolBId: fixture.toolB?.id ?? '',
          categoryId: fixture.category?.id ?? '',
          status: 'active',
          periodStart: '2025-01-01',
          periodEnd: '2030-01-07',
        })
        .returning()
    )[0]

    await db.insert(recommendations).values([
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.category?.id ?? '',
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.category?.id ?? '',
      },
      {
        runResultId: fixture.rrB?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
      },
    ])

    const details = await createTestCaller(null).match.getById({ id: match?.id ?? '' })
    expect(details.breakdown.byLlm.length).toBeGreaterThan(0)
    expect(details.breakdown.byPrompt.length).toBeGreaterThan(0)

    const settled = await caller.match.settle({ id: match?.id ?? '' })
    expect(settled.match?.status).toBe('settled')
    expect(settled.match?.toolAScore).toBe(2)
    expect(settled.match?.toolBScore).toBe(1)
    expect(settled.match?.winnerToolId).toBe(fixture.toolA?.id)
  })

  it('excludes recommendations outside periodEnd from breakdown', async () => {
    const fixture = await seedMatchFixture()
    const db = getTestDb()

    const match = (
      await db
        .insert(matches)
        .values({
          toolAId: fixture.toolA?.id ?? '',
          toolBId: fixture.toolB?.id ?? '',
          categoryId: fixture.category?.id ?? '',
          status: 'active',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-07',
        })
        .returning()
    )[0]

    // Recommendation within the period
    await db.insert(recommendations).values([
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolA?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        createdAt: new Date('2025-01-05T12:00:00.000Z'),
      },
    ])

    const details = await createTestCaller(null).match.getById({ id: match?.id ?? '' })
    expect(details.breakdown.totals.toolA).toBe(1)

    // Recommendation after the period end — should not be counted
    await db.insert(recommendations).values([
      {
        runResultId: fixture.rrA?.id ?? '',
        toolId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        createdAt: new Date('2025-01-10T12:00:00.000Z'),
      },
    ])

    const detailsAfterPeriod = await createTestCaller(null).match.getById({
      id: match?.id ?? '',
    })
    expect(detailsAfterPeriod.breakdown.totals.toolA).toBe(1)
    expect(detailsAfterPeriod.breakdown.totals.toolB).toBe(0)
  })

  it('rejects settling match that is already settled', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchFixture()
    const db = getTestDb()

    const settledMatch = (
      await db
        .insert(matches)
        .values({
          toolAId: fixture.toolA?.id ?? '',
          toolBId: fixture.toolB?.id ?? '',
          categoryId: fixture.category?.id ?? '',
          status: 'settled',
          periodStart: '2025-01-01',
          periodEnd: '2025-01-07',
          settledAt: new Date('2025-01-07T12:00:00.000Z'),
          toolAScore: 3,
          toolBScore: 1,
          totalPrompts: 2,
          winnerToolId: fixture.toolA?.id ?? null,
        })
        .returning()
    )[0]

    await expect(caller.match.settle({ id: settledMatch?.id ?? '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Only active matches can be settled',
    } satisfies Partial<TRPCError>)
  })

  it('rejects create when periodEnd is before periodStart', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchFixture()

    await expect(
      caller.match.create({
        toolAId: fixture.toolA?.id ?? '',
        toolBId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        periodStart: new Date('2025-01-07'),
        periodEnd: new Date('2025-01-01'),
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    } satisfies Partial<TRPCError>)
  })

  it('rejects create for non-admin', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchFixture()

    await expect(
      caller.match.create({
        toolAId: fixture.toolA?.id ?? '',
        toolBId: fixture.toolB?.id ?? '',
        categoryId: fixture.category?.id ?? '',
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-07'),
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })
})
