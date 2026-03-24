import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkModelSnapshots,
  benchmarkProtocols,
  benchmarkSeasonModels,
  benchmarkSeasons,
  categories,
  llms,
  matchPromptTemplates,
  subcategories,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

function first<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('Expected at least one result')
  return arr[0] as T
}

async function seedMatchRouterFixture() {
  const db = getTestDb()

  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
  const category = first(
    await db
      .insert(subcategories)
      .values({ name: 'Auth', slug: 'auth', categoryId: group.id })
      .returning(),
  )

  const toolA = first(await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning())
  const toolB = first(await db.insert(tools).values({ name: 'Auth0', slug: 'auth0' }).returning())

  await db.insert(toolCategories).values([
    { toolId: toolA.id, categoryId: category.id },
    { toolId: toolB.id, categoryId: category.id },
  ])

  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'proto-1',
        name: 'Protocol 1',
        mode: 'benchmark',
        parserVersion: 'strict-v1',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )

  const season = first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId: protocol.id,
        slug: 'season-1',
        name: 'Season 1',
        status: 'active',
      })
      .returning(),
  )

  const llm = first(
    await db
      .insert(llms)
      .values({ name: 'GPT-4o', slug: 'gpt-4o', provider: 'openai', modelId: 'gpt-4o' })
      .returning(),
  )

  const snapshot = first(
    await db
      .insert(benchmarkModelSnapshots)
      .values({
        llmId: llm.id,
        name: 'GPT-4o',
        provider: 'openai',
        tier: 'frontier',
        requestedModelId: 'gpt-4o',
        snapshotKey: 'gpt-4o::0.2::1::1200::null',
      })
      .returning(),
  )

  await db.insert(benchmarkSeasonModels).values({
    seasonId: season.id,
    modelSnapshotId: snapshot.id,
  })

  const template = first(
    await db
      .insert(matchPromptTemplates)
      .values({
        slug: 'match-compare-v1',
        name: 'Match Compare V1',
        templateMd: 'Compare {{TOOL_A}} vs {{TOOL_B}} for {{CATEGORY}}.',
        schemaVersion: 'match-v2',
        isActive: true,
      })
      .returning(),
  )

  return { category, toolA, toolB, season, template }
}

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

  it('should enforce admin role for configureMatch', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.match.configureMatch({
        seasonId: crypto.randomUUID(),
        categoryId: crypto.randomUUID(),
        toolAId: crypto.randomUUID(),
        toolBId: crypto.randomUUID(),
        promptTemplateId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<TRPCError>)
  })

  it('should configure a match and list configs', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    const config = await caller.match.configureMatch({
      seasonId: fixture.season.id,
      categoryId: fixture.category.id,
      toolAId: fixture.toolA.id,
      toolBId: fixture.toolB.id,
      promptTemplateId: fixture.template.id,
    })

    expect(config).toBeTruthy()
    if (!config) return
    expect(config.isActive).toBe(true)

    const configs = await caller.match.listConfigs({
      seasonId: fixture.season.id,
    })
    expect(configs).toHaveLength(1)
  })

  it('should disable a config', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    const config = await caller.match.configureMatch({
      seasonId: fixture.season.id,
      categoryId: fixture.category.id,
      toolAId: fixture.toolA.id,
      toolBId: fixture.toolB.id,
      promptTemplateId: fixture.template.id,
    })

    if (!config) throw new Error('Expected config to be created')
    const disabled = await caller.match.disableConfig({ configId: config.id })
    expect(disabled.isActive).toBe(false)
  })

  it('should create a batch and get it', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    const batch = await caller.match.createBatch({
      seasonId: fixture.season.id,
      categoryId: fixture.category.id,
      toolAId: fixture.toolA.id,
      toolBId: fixture.toolB.id,
      promptTemplateId: fixture.template.id,
    })

    expect(batch.status).toBe('pending')
    expect(batch.totalEvaluations).toBe(2)

    const fetched = await caller.match.getBatch({ batchId: batch.id })
    expect(fetched.evaluations).toHaveLength(2)
  })

  it('should reject benchmark_run batches without benchmarkRunId', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    await expect(
      caller.match.createBatch({
        seasonId: fixture.season.id,
        categoryId: fixture.category.id,
        toolAId: fixture.toolA.id,
        toolBId: fixture.toolB.id,
        promptTemplateId: fixture.template.id,
        triggerMode: 'benchmark_run',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' } satisfies Partial<TRPCError>)
  })

  it('should list batches with filters', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    await caller.match.createBatch({
      seasonId: fixture.season.id,
      categoryId: fixture.category.id,
      toolAId: fixture.toolA.id,
      toolBId: fixture.toolB.id,
      promptTemplateId: fixture.template.id,
    })

    const allBatches = await caller.match.listBatches({})
    expect(allBatches).toHaveLength(1)

    const filteredBatches = await caller.match.listBatches({
      seasonId: fixture.season.id,
      status: 'pending',
    })
    expect(filteredBatches).toHaveLength(1)

    const emptyBatches = await caller.match.listBatches({ status: 'completed' })
    expect(emptyBatches).toHaveLength(0)
  })

  it('should enforce admin role for createBatch', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.match.createBatch({
        seasonId: crypto.randomUUID(),
        categoryId: crypto.randomUUID(),
        toolAId: crypto.randomUUID(),
        toolBId: crypto.randomUUID(),
        promptTemplateId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<TRPCError>)
  })
})
