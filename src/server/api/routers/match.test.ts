import type { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkModelSnapshots,
  benchmarkProtocols,
  benchmarkSeasonModels,
  benchmarkSeasons,
  categories,
  llms,
  matchBatches,
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
      .values({
        name: 'GPT-4o',
        slug: 'gpt-4o',
        provider: 'openai',
        company: 'OpenAI',
        modelFamily: 'GPT',
        modelVersion: '4o',
        modelId: 'gpt-4o',
      })
      .returning(),
  )

  const snapshot = first(
    await db
      .insert(benchmarkModelSnapshots)
      .values({
        llmId: llm.id,
        name: 'GPT-4o',
        provider: 'openai',
        company: 'OpenAI',
        modelFamily: 'GPT',
        modelVersion: '4o',
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

  return { category, toolA, toolB, season, template, protocol, snapshot }
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

  it('should configure a match with mixed-case UUID tool inputs', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    const toolA = first(
      await db
        .insert(tools)
        .values({
          id: 'a0000000-0000-4000-8000-000000000001',
          name: 'Case Tool A',
          slug: 'case-tool-a',
        })
        .returning(),
    )
    const toolB = first(
      await db
        .insert(tools)
        .values({
          id: 'b0000000-0000-4000-8000-000000000002',
          name: 'Case Tool B',
          slug: 'case-tool-b',
        })
        .returning(),
    )

    await db.insert(toolCategories).values([
      { toolId: toolA.id, categoryId: fixture.category.id },
      { toolId: toolB.id, categoryId: fixture.category.id },
    ])

    const config = await caller.match.configureMatch({
      seasonId: fixture.season.id,
      categoryId: fixture.category.id,
      toolAId: toolB.id.toUpperCase(),
      toolBId: toolA.id,
      promptTemplateId: fixture.template.id,
    })

    if (!config) throw new Error('Expected config to be created')
    expect(config.toolAId).toBe(toolA.id)
    expect(config.toolBId).toBe(toolB.id)
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

  it('returns admin launch context for the latest active season and eligible categories', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    const ineligibleCategory = first(
      await db
        .insert(subcategories)
        .values({ name: 'Analytics', slug: 'analytics', categoryId: fixture.category.categoryId })
        .returning(),
    )

    const loneTool = first(
      await db.insert(tools).values({ name: 'Solo Tool', slug: 'solo-tool' }).returning(),
    )
    await db.insert(toolCategories).values({
      toolId: loneTool.id,
      categoryId: ineligibleCategory.id,
    })

    const latestSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: fixture.protocol.id,
          slug: 'season-2',
          name: 'Season 2',
          status: 'active',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: latestSeason.id,
      modelSnapshotId: fixture.snapshot.id,
    })

    const context = await caller.match.getAdminLaunchContext()

    expect(context.season).toEqual({
      id: latestSeason.id,
      name: 'Season 2',
      slug: 'season-2',
      modelCount: 1,
    })
    expect(context.promptTemplate).toMatchObject({
      id: fixture.template.id,
      name: fixture.template.name,
      slug: fixture.template.slug,
    })
    expect(context.categories).toEqual([
      {
        id: fixture.category.id,
        name: fixture.category.name,
        slug: fixture.category.slug,
        toolCount: 2,
      },
    ])
  })

  it('errors when no active benchmark season exists for admin launch context', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    await expect(caller.match.getAdminLaunchContext()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No active benchmark season found',
    } satisfies Partial<TRPCError>)
  })

  it('errors when no active match prompt template exists for admin launch context', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    await db
      .update(matchPromptTemplates)
      .set({ isActive: false })
      .where(eq(matchPromptTemplates.id, fixture.template.id))

    await expect(caller.match.getAdminLaunchContext()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Active match prompt template not found',
    } satisfies Partial<TRPCError>)
  })

  it('lists launchable tools sorted by name', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    const extraTool = first(
      await db.insert(tools).values({ name: 'Aardvark Auth', slug: 'aardvark-auth' }).returning(),
    )
    await db.insert(toolCategories).values({
      toolId: extraTool.id,
      categoryId: fixture.category.id,
    })

    const toolsForCategory = await caller.match.listLaunchableTools({
      categoryId: fixture.category.id,
    })

    expect(toolsForCategory.map((tool) => tool.name)).toEqual(['Aardvark Auth', 'Auth0', 'Clerk'])
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

  it('creates manual batches for unique queued entries', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    const category = first(
      await db
        .insert(subcategories)
        .values({ name: 'Billing', slug: 'billing', categoryId: fixture.category.categoryId })
        .returning(),
    )
    const toolC = first(
      await db.insert(tools).values({ name: 'Stripe', slug: 'stripe' }).returning(),
    )
    const toolD = first(
      await db.insert(tools).values({ name: 'Paddle', slug: 'paddle' }).returning(),
    )
    await db.insert(toolCategories).values([
      { toolId: toolC.id, categoryId: category.id },
      { toolId: toolD.id, categoryId: category.id },
    ])

    const result = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId: crypto.randomUUID(),
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
        {
          categoryId: category.id,
          toolAId: toolC.id,
          toolBId: toolD.id,
        },
      ],
    })

    expect(result.createdCount).toBe(2)
    expect(result.batches).toHaveLength(2)
    expect(result.batches.every((batch) => batch.status === 'pending')).toBe(true)
    expect(result.batches.map((batch) => batch.totalEvaluations)).toEqual([2, 2])
  })

  it('accepts uppercase season ids for manual batch submissions', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    const result = await caller.match.createManualBatches({
      seasonId: fixture.season.id.toUpperCase(),
      submissionId: crypto.randomUUID(),
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
      ],
    })

    expect(result.createdCount).toBe(1)
    expect(result.batches[0]).toMatchObject({
      categoryId: fixture.category.id,
      toolAId: fixture.toolA.id,
      toolBId: fixture.toolB.id,
      status: 'pending',
    })
  })

  it('canonicalizes tool order when creating manual batches', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    const result = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId: crypto.randomUUID(),
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolB.id,
          toolBId: fixture.toolA.id,
        },
      ],
    })

    expect(result.batches).toHaveLength(1)
    expect(result.batches[0]).toMatchObject({
      toolAId: fixture.toolA.id,
      toolBId: fixture.toolB.id,
    })
  })

  it('uses the active prompt template when creating manual batches', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    const result = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId: crypto.randomUUID(),
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
      ],
    })

    const batchId = result.batches[0]?.id
    if (!batchId) throw new Error('Expected manual batch to be created')

    const batch = await caller.match.getBatch({ batchId })
    expect(batch.promptTemplateId).toBe(fixture.template.id)
  })

  it('rejects duplicate normalized manual match rows in the same request', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    await expect(
      caller.match.createManualBatches({
        seasonId: fixture.season.id,
        submissionId: crypto.randomUUID(),
        entries: [
          {
            categoryId: fixture.category.id,
            toolAId: fixture.toolA.id,
            toolBId: fixture.toolB.id,
          },
          {
            categoryId: fixture.category.id,
            toolAId: fixture.toolB.id,
            toolBId: fixture.toolA.id,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Duplicate match rows are not allowed',
    } satisfies Partial<TRPCError>)
  })

  it('is idempotent when retrying the same manual batch submission', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const submissionId = crypto.randomUUID()

    const firstResult = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId,
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
      ],
    })

    const secondResult = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId,
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
      ],
    })

    expect(firstResult.createdCount).toBe(1)
    expect(secondResult.createdCount).toBe(0)
    expect(secondResult.batches).toHaveLength(1)
    expect(secondResult.batches[0]?.id).toBe(firstResult.batches[0]?.id)
  })

  it('returns the persisted batch status for idempotent manual retries', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()
    const submissionId = crypto.randomUUID()

    const firstResult = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId,
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
      ],
    })

    const firstBatchId = firstResult.batches[0]?.id
    if (!firstBatchId) throw new Error('Expected manual batch to be created')

    await db
      .update(matchBatches)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(matchBatches.id, firstBatchId))

    const secondResult = await caller.match.createManualBatches({
      seasonId: fixture.season.id,
      submissionId,
      entries: [
        {
          categoryId: fixture.category.id,
          toolAId: fixture.toolA.id,
          toolBId: fixture.toolB.id,
        },
      ],
    })

    expect(secondResult.createdCount).toBe(0)
    expect(secondResult.batches[0]).toMatchObject({
      id: firstBatchId,
      status: 'completed',
    })
  })

  it('rolls back manual batches when any queued row is invalid', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    const outsiderTool = first(
      await db.insert(tools).values({ name: 'Outsider', slug: 'outsider' }).returning(),
    )

    await expect(
      caller.match.createManualBatches({
        seasonId: fixture.season.id,
        submissionId: crypto.randomUUID(),
        entries: [
          {
            categoryId: fixture.category.id,
            toolAId: fixture.toolA.id,
            toolBId: fixture.toolB.id,
          },
          {
            categoryId: fixture.category.id,
            toolAId: fixture.toolA.id,
            toolBId: outsiderTool.id,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Both tools must belong to the selected category',
    } satisfies Partial<TRPCError>)

    const batches = await db
      .select({ id: matchBatches.id })
      .from(matchBatches)
      .where(eq(matchBatches.seasonId, fixture.season.id))

    expect(batches).toEqual([])
  })

  it('rejects manual batch submissions for a non-active season', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()
    const db = getTestDb()

    const latestSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: fixture.protocol.id,
          slug: 'season-2',
          name: 'Season 2',
          status: 'active',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: latestSeason.id,
      modelSnapshotId: fixture.snapshot.id,
    })

    await expect(
      caller.match.createManualBatches({
        seasonId: fixture.season.id,
        submissionId: crypto.randomUUID(),
        entries: [
          {
            categoryId: fixture.category.id,
            toolAId: fixture.toolA.id,
            toolBId: fixture.toolB.id,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Manual matches can only be created for the current active benchmark season',
    } satisfies Partial<TRPCError>)
  })

  it('should map createBatch foreign key violations to BAD_REQUEST', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const fixture = await seedMatchRouterFixture()

    await expect(
      caller.match.createBatch({
        seasonId: fixture.season.id,
        categoryId: fixture.category.id,
        toolAId: fixture.toolA.id,
        toolBId: fixture.toolB.id,
        promptTemplateId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'One or more referenced IDs were not found or are incompatible',
    } satisfies Partial<TRPCError>)
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
