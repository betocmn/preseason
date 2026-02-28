import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  categories,
  llms,
  prompts,
  recommendations,
  runResults,
  runs,
  tools,
} from '~/server/db/schema'
import { runAutomation } from '~/server/llm/automation/runner'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

describe('runAutomation', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('executes run pipeline and persists run results and recommendations', async () => {
    const database = getTestDb()

    await database
      .insert(categories)
      .values([
        { name: 'Authentication', slug: 'auth' },
        { name: 'Database', slug: 'database' },
      ])
      .returning()

    await database
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()

    const [prompt] = await database
      .insert(prompts)
      .values([
        {
          title: 'Real Estate Website',
          slug: 'real-estate-website',
          level: 'vibe-coder',
          isActive: true,
        },
      ])
      .returning()

    const [llm] = await database
      .insert(llms)
      .values([
        {
          name: 'GPT-4o',
          slug: 'gpt-4o',
          provider: 'OpenAI',
          modelId: 'gpt-4o',
          isActive: true,
        },
      ])
      .returning()

    const [run] = await database
      .insert(runs)
      .values([
        {
          status: 'pending',
          trigger: 'manual',
          promptIds: [prompt?.id ?? ''],
          llmIds: [llm?.id ?? ''],
          promptCount: 1,
          llmCount: 1,
        },
      ])
      .returning()

    const mockService = {
      complete: vi.fn().mockResolvedValue({
        content:
          '{"recommendations":[{"category":"auth","tool":"Clerk"},{"category":"database","tool":"Supabase"}]}',
        model: 'openai/gpt-4o',
        provider: 'openai',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 12, totalTokens: 22 },
        latencyMs: 55,
      }),
    }

    const summary = await runAutomation(run?.id ?? '', {
      database,
      llmService: mockService as never,
      now: () => new Date('2026-02-28T12:00:00.000Z'),
    })

    expect(summary.status).toBe('completed')
    expect(summary.totalPairs).toBe(1)
    expect(summary.succeededPairs).toBe(1)
    expect(summary.failedPairs).toBe(0)
    expect(summary.recommendationCount).toBe(2)

    const persistedRun = await database.query.runs.findFirst({
      where: (table, { eq }) => eq(table.id, run?.id ?? ''),
    })
    expect(persistedRun?.status).toBe('completed')
    expect(persistedRun?.completedAt).toBeTruthy()

    const persistedRunResults = await database.select().from(runResults)
    expect(persistedRunResults).toHaveLength(1)
    expect(persistedRunResults[0]?.parseStatus).toBe('success')
    expect(persistedRunResults[0]?.responseTimeMs).toBe(55)

    const persistedRecommendations = await database.select().from(recommendations)
    expect(persistedRecommendations).toHaveLength(2)
  })

  it('handles per-pair failures and continues processing', async () => {
    const database = getTestDb()

    await database
      .insert(categories)
      .values([{ name: 'Authentication', slug: 'auth' }])
      .returning()
    await database
      .insert(tools)
      .values([{ name: 'Clerk', slug: 'clerk' }])
      .returning()

    const [prompt] = await database
      .insert(prompts)
      .values([
        {
          title: 'SaaS Application',
          slug: 'saas-application',
          level: 'vibe-coder',
          isActive: true,
        },
      ])
      .returning()

    const [brokenLlm, workingLlm] = await database
      .insert(llms)
      .values([
        {
          name: 'Broken LLM',
          slug: 'broken-llm',
          provider: 'BrokenProvider',
          modelId: 'broken',
          isActive: true,
        },
        {
          name: 'Working LLM',
          slug: 'working-llm',
          provider: 'OpenAI',
          modelId: 'gpt-4o',
          isActive: true,
        },
      ])
      .returning()

    const [run] = await database
      .insert(runs)
      .values([
        {
          status: 'pending',
          trigger: 'manual',
          promptIds: [prompt?.id ?? ''],
          llmIds: [brokenLlm?.id ?? '', workingLlm?.id ?? ''],
          promptCount: 1,
          llmCount: 2,
        },
      ])
      .returning()

    const mockService = {
      complete: vi.fn(async (provider: string) => {
        if (provider === 'BrokenProvider') {
          throw new Error('Provider unavailable')
        }

        return {
          content: '{"recommendations":[{"category":"auth","tool":"Clerk"}]}',
          model: 'openai/gpt-4o',
          provider: 'openai',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
          latencyMs: 41,
        }
      }),
    }

    const summary = await runAutomation(run?.id ?? '', {
      database,
      llmService: mockService as never,
      now: () => new Date('2026-02-28T12:00:00.000Z'),
    })

    expect(summary.status).toBe('completed')
    expect(summary.totalPairs).toBe(2)
    expect(summary.succeededPairs).toBe(1)
    expect(summary.failedPairs).toBe(1)
    expect(summary.errors.some((entry) => entry.includes('Provider unavailable'))).toBe(true)

    const persistedRunResults = await database.select().from(runResults)
    expect(persistedRunResults).toHaveLength(2)
    expect(persistedRunResults.some((entry) => entry.parseStatus === 'failed')).toBe(true)
    expect(persistedRunResults.some((entry) => entry.parseStatus === 'success')).toBe(true)
  })

  it('marks run as failed when no prompts or llms are configured', async () => {
    const database = getTestDb()

    const [run] = await database
      .insert(runs)
      .values([
        {
          status: 'pending',
          trigger: 'manual',
          promptIds: [],
          llmIds: [],
          promptCount: 0,
          llmCount: 0,
        },
      ])
      .returning()

    const summary = await runAutomation(run?.id ?? '', {
      database,
      now: () => new Date('2026-02-28T12:00:00.000Z'),
    })

    expect(summary.status).toBe('failed')
    expect(summary.totalPairs).toBe(0)
    expect(summary.errors[0]).toContain('no prompts or llms')

    const persistedRun = await database.query.runs.findFirst({
      where: (table, { eq }) => eq(table.id, run?.id ?? ''),
    })
    expect(persistedRun?.status).toBe('failed')
    expect(persistedRun?.errorLog).toContain('no prompts or llms')
  })
})
