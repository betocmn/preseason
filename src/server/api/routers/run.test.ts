import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import { createTestCaller, seedUser } from '~/test/trpc'

describe('runRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists recent runs with pagination', async () => {
    const db = getTestDb()
    await db
      .insert(runs)
      .values([{ status: 'completed' }, { status: 'failed' }, { status: 'running' }])

    const caller = createTestCaller(null)
    const page = await caller.run.listRecent({ limit: 2, offset: 0 })
    expect(page.total).toBe(3)
    expect(page.items).toHaveLength(2)
  })

  it('returns run details with summary', async () => {
    const db = getTestDb()

    const run = (
      await db.insert(runs).values({ status: 'completed', trigger: 'manual' }).returning()
    )[0]
    const prompt = (
      await db
        .insert(prompts)
        .values({ title: 'Prompt', slug: 'prompt', level: 'vibe-coder', isActive: true })
        .returning()
    )[0]
    const llm = (
      await db
        .insert(llms)
        .values({ name: 'GPT-4o', slug: 'gpt-4o', provider: 'OpenAI', modelId: 'openai/gpt-4o' })
        .returning()
    )[0]
    const tool = (
      await db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning()
    )[0]

    const runResult = (
      await db
        .insert(runResults)
        .values({
          runId: run?.id ?? '',
          promptId: prompt?.id ?? '',
          llmId: llm?.id ?? '',
          parseStatus: 'success',
          responseTimeMs: 1200,
        })
        .returning()
    )[0]

    const [group] = await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning()

    const authCategory = (
      await db
        .insert(subcategories)
        .values({
          name: 'Authentication',
          slug: 'auth',
          categoryId: group?.id ?? '',
        })
        .returning()
    )[0]

    await db.insert(recommendations).values({
      runResultId: runResult?.id ?? '',
      toolId: tool?.id ?? '',
      categoryId: authCategory?.id ?? '',
      rank: 1,
    })

    const caller = createTestCaller(null)
    const details = await caller.run.getById({ id: run?.id ?? '' })
    expect(details.run.id).toBe(run?.id)
    expect(details.summary.totalResults).toBe(1)
    expect(details.summary.totalRecommendations).toBe(1)
    expect(details.summary.averageResponseTimeMs).toBe(1200)
  })

  it('triggers manual run as admin', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const db = getTestDb()

    const [activePrompt, inactivePrompt] = await db
      .insert(prompts)
      .values([
        { title: 'Prompt A', slug: 'prompt-a', level: 'vibe-coder', isActive: true },
        { title: 'Prompt B', slug: 'prompt-b', level: 'vibe-coder', isActive: false },
      ])
      .returning()
    const [activeLlm, inactiveLlm] = await db
      .insert(llms)
      .values([
        {
          name: 'GPT-4o',
          slug: 'gpt-4o',
          provider: 'OpenAI',
          modelId: 'openai/gpt-4o',
          isActive: true,
        },
        {
          name: 'Inactive',
          slug: 'inactive',
          provider: 'OpenAI',
          modelId: 'openai/inactive',
          isActive: false,
        },
      ])
      .returning()

    const result = await caller.run.triggerManual({
      promptIds: [activePrompt?.id ?? '', inactivePrompt?.id ?? ''],
      llmIds: [activeLlm?.id ?? '', inactiveLlm?.id ?? ''],
    })
    expect(result.queued).toBe(true)
    expect(result.run?.trigger).toBe('manual')
    expect(result.run?.promptCount).toBe(1)
    expect(result.run?.llmCount).toBe(1)
    expect(result.run?.promptIds).toEqual([activePrompt?.id ?? ''])
    expect(result.run?.llmIds).toEqual([activeLlm?.id ?? ''])
  })

  it('rejects triggerManual for non-admin users', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)
    await expect(caller.run.triggerManual()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })
})
