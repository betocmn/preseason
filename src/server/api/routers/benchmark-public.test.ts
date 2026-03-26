import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  categories,
  llms,
  prompts,
  subcategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller } from '~/test/trpc'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

type TestDb = ReturnType<typeof getTestDb>

async function seedSeasonDecision(args: {
  db: TestDb
  seasonId: string
  promptVersionId: string
  modelSnapshotId: string
  categoryId: string
  decisionType?: 'tool' | 'none'
  toolId?: string | null
  rawToolName?: string | null
  scheduledFor?: string
}) {
  const {
    db,
    seasonId,
    promptVersionId,
    modelSnapshotId,
    categoryId,
    decisionType = 'tool',
    toolId = null,
    rawToolName = null,
    scheduledFor = '2026-03-10',
  } = args

  await db.insert(benchmarkSeasonPrompts).values({ seasonId, promptVersionId })
  await db.insert(benchmarkSeasonModels).values({ seasonId, modelSnapshotId })

  const benchmarkCase = first(
    await db
      .insert(benchmarkCases)
      .values({ seasonId, promptVersionId, modelSnapshotId })
      .returning(),
  )

  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId,
        scheduledFor,
        status: 'published',
      })
      .returning(),
  )

  const caseResult = first(
    await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId,
        runId: run.id,
        caseId: benchmarkCase.id,
        status: 'completed',
        requestedModelId: 'test-model',
        returnedModelId: 'test-model',
        provider: 'test',
        parserVersion: 'strict-v1',
      })
      .returning(),
  )

  await db.insert(benchmarkCaseDecisions).values({
    caseResultId: caseResult.id,
    categoryId,
    decisionType,
    toolId,
    rawToolName,
    resolutionStatus: 'resolved',
  })
}

async function seedBenchmarkPublicFixture() {
  const db = getTestDb()
  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
  const authCategory = first(
    await db
      .insert(subcategories)
      .values({ categoryId: group.id, name: 'Auth', slug: 'auth', displayOrder: 1 })
      .returning(),
  )

  const [clerk, supabase] = await db
    .insert(tools)
    .values([
      { name: 'Clerk', slug: 'clerk' },
      { name: 'Supabase', slug: 'supabase' },
    ])
    .returning()

  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-v2',
        name: 'Benchmark V2',
        mode: 'benchmark',
        parserVersion: '1.0',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )
  const explorationProtocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'exploration-v1',
        name: 'Exploration V1',
        mode: 'exploration',
        parserVersion: '1.0',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )

  const olderSeason = first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId: protocol.id,
        slug: 'season-older',
        name: 'Older Season',
        status: 'active',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      })
      .returning(),
  )
  const explorationSeason = first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId: explorationProtocol.id,
        slug: 'season-exploration',
        name: 'Exploration Season',
        status: 'active',
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
      })
      .returning(),
  )
  const newerSeason = first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId: protocol.id,
        slug: 'season-newer',
        name: 'Newer Season',
        status: 'active',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      })
      .returning(),
  )
  await db.insert(benchmarkSeasons).values({
    protocolId: protocol.id,
    slug: 'season-fresh',
    name: 'Fresh Season',
    status: 'active',
    createdAt: new Date('2026-03-04T00:00:00.000Z'),
  })

  const prompt = first(
    await db
      .insert(prompts)
      .values({
        title: 'Build a SaaS app',
        slug: 'build-a-saas-app',
        level: 'beginner',
        contentMd: '# Build a SaaS app',
      })
      .returning(),
  )
  const promptVersion = first(
    await db
      .insert(benchmarkPromptVersions)
      .values({
        promptId: prompt.id,
        slug: prompt.slug,
        level: 'beginner',
        version: 1,
        contentMd: prompt.contentMd ?? '# Build a SaaS app',
        contentHash: 'benchmark-public-fixture',
        promptContractVersion: '1.0',
        systemPromptSnapshot: 'You are a pragmatic assistant.',
      })
      .returning(),
  )
  await db.insert(benchmarkPromptVersionCategories).values({
    promptVersionId: promptVersion.id,
    categoryId: authCategory.id,
    displayOrder: 1,
  })

  const llm = first(
    await db
      .insert(llms)
      .values({
        name: 'Claude Opus',
        slug: 'claude-opus',
        provider: 'anthropic',
        company: 'Anthropic',
        modelFamily: 'Opus',
        modelVersion: '3',
        modelId: 'claude-3-opus',
      })
      .returning(),
  )
  const modelSnapshot = first(
    await db
      .insert(benchmarkModelSnapshots)
      .values({
        llmId: llm.id,
        name: llm.name,
        provider: llm.provider,
        company: llm.company,
        modelFamily: llm.modelFamily,
        modelVersion: llm.modelVersion,
        tier: 'frontier',
        requestedModelId: llm.modelId,
        temperature: 0.2,
        snapshotKey: 'benchmark-public-fixture',
      })
      .returning(),
  )

  await seedSeasonDecision({
    db,
    seasonId: olderSeason.id,
    promptVersionId: promptVersion.id,
    modelSnapshotId: modelSnapshot.id,
    categoryId: authCategory.id,
    toolId: supabase?.id ?? '',
    rawToolName: 'Supabase',
  })
  await seedSeasonDecision({
    db,
    seasonId: newerSeason.id,
    promptVersionId: promptVersion.id,
    modelSnapshotId: modelSnapshot.id,
    categoryId: authCategory.id,
    toolId: clerk?.id ?? '',
    rawToolName: 'Clerk',
  })

  return { authCategory, clerk, explorationSeason, supabase }
}

describe('benchmark public routers', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('uses the latest published benchmark season for rankings when seasonId is omitted', async () => {
    await seedBenchmarkPublicFixture()

    const caller = createTestCaller(null)
    const result = await caller.benchmarkRanking.byCategory({
      categorySlug: 'auth',
      windowType: 'run_day',
      anchorDate: '2026-03-10',
    })

    expect(result.ranking?.items[0]?.toolSlug).toBe('clerk')
  })

  it('uses the latest published benchmark season for matches when seasonId is omitted', async () => {
    await seedBenchmarkPublicFixture()

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'run_day',
      anchorDate: '2026-03-10',
    })

    expect(result.result?.aWins).toBe(1)
    expect(result.result?.bWins).toBe(0)
  })

  it('returns model filter hierarchy and applies model filters to rankings', async () => {
    const db = getTestDb()
    const group = first(
      await db
        .insert(categories)
        .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
        .returning(),
    )
    const authCategory = first(
      await db
        .insert(subcategories)
        .values({ categoryId: group.id, name: 'Auth', slug: 'auth', displayOrder: 1 })
        .returning(),
    )
    const [clerk, supabase] = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-model-filters',
          name: 'Benchmark Model Filters',
          mode: 'benchmark',
          parserVersion: '1.0',
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
          slug: 'season-model-filters',
          name: 'Season Model Filters',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const promptRows = await db
      .insert(prompts)
      .values([
        {
          title: 'Auth prompt A',
          slug: 'auth-prompt-a',
          level: 'beginner',
          contentMd: '# Auth prompt A',
        },
        {
          title: 'Auth prompt B',
          slug: 'auth-prompt-b',
          level: 'beginner',
          contentMd: '# Auth prompt B',
        },
      ])
      .returning()
    const promptA = first(promptRows)
    const promptB = first(promptRows.slice(1))

    const promptVersionRows = await db
      .insert(benchmarkPromptVersions)
      .values([
        {
          promptId: promptA.id,
          slug: promptA.slug,
          level: 'beginner',
          version: 1,
          contentMd: promptA.contentMd ?? '# Auth prompt A',
          contentHash: 'model-filter-a',
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        },
        {
          promptId: promptB.id,
          slug: promptB.slug,
          level: 'beginner',
          version: 1,
          contentMd: promptB.contentMd ?? '# Auth prompt B',
          contentHash: 'model-filter-b',
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        },
      ])
      .returning()
    const promptVersionA = first(promptVersionRows)
    const promptVersionB = first(promptVersionRows.slice(1))

    await db.insert(benchmarkPromptVersionCategories).values([
      { promptVersionId: promptVersionA.id, categoryId: authCategory.id, displayOrder: 1 },
      { promptVersionId: promptVersionB.id, categoryId: authCategory.id, displayOrder: 2 },
    ])

    const llmRows = await db
      .insert(llms)
      .values([
        {
          name: 'Claude Sonnet',
          slug: 'claude-sonnet',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Sonnet',
          modelVersion: '4.6',
          modelId: 'anthropic/claude-sonnet-4.6',
        },
        {
          name: 'GPT-5',
          slug: 'gpt-5',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT',
          modelVersion: '5',
          modelId: 'openai/gpt-5',
        },
      ])
      .returning()
    const llmA = first(llmRows)
    const llmB = first(llmRows.slice(1))

    const modelSnapshotRows = await db
      .insert(benchmarkModelSnapshots)
      .values([
        {
          llmId: llmA.id,
          name: llmA.name,
          provider: llmA.provider,
          company: llmA.company,
          modelFamily: llmA.modelFamily,
          modelVersion: llmA.modelVersion,
          tier: 'frontier',
          requestedModelId: llmA.modelId,
          temperature: 0.2,
          snapshotKey: 'model-filter-snapshot-a',
        },
        {
          llmId: llmB.id,
          name: llmB.name,
          provider: llmB.provider,
          company: llmB.company,
          modelFamily: llmB.modelFamily,
          modelVersion: llmB.modelVersion,
          tier: 'frontier',
          requestedModelId: llmB.modelId,
          temperature: 0.2,
          snapshotKey: 'model-filter-snapshot-b',
        },
      ])
      .returning()
    const modelSnapshotA = first(modelSnapshotRows)
    const modelSnapshotB = first(modelSnapshotRows.slice(1))

    await seedSeasonDecision({
      db,
      seasonId: season.id,
      promptVersionId: promptVersionA.id,
      modelSnapshotId: modelSnapshotA.id,
      categoryId: authCategory.id,
      toolId: clerk?.id ?? '',
      rawToolName: 'Clerk',
      scheduledFor: '2026-03-10',
    })
    await seedSeasonDecision({
      db,
      seasonId: season.id,
      promptVersionId: promptVersionB.id,
      modelSnapshotId: modelSnapshotB.id,
      categoryId: authCategory.id,
      toolId: supabase?.id ?? '',
      rawToolName: 'Supabase',
      scheduledFor: '2026-03-09',
    })

    const caller = createTestCaller(null)
    const modelFilters = await caller.benchmarkRanking.listModelFilters({
      anchorDate: '2026-03-10',
    })
    expect(modelFilters.companies.map((company) => company.name)).toEqual(['Anthropic', 'OpenAI'])
    expect(modelFilters.companies[0]?.families[0]?.name).toBe('Sonnet')
    expect(modelFilters.companies[0]?.families[0]?.models[0]?.id).toBe(modelSnapshotA.id)
    expect(modelFilters.companies[0]?.families[0]?.models[0]?.version).toBe('4.6')

    const modelAFiltered = await caller.benchmarkRanking.byCategory({
      categorySlug: 'auth',
      windowType: 'trailing_7d',
      anchorDate: '2026-03-10',
      modelSnapshotId: modelSnapshotA.id,
    })
    expect(modelAFiltered.ranking?.totalEligibleDecisions).toBe(1)
    expect(modelAFiltered.ranking?.items[0]?.toolSlug).toBe('clerk')

    const modelFiltered = await caller.benchmarkRanking.byCategory({
      categorySlug: 'auth',
      windowType: 'trailing_7d',
      anchorDate: '2026-03-10',
      modelSnapshotId: modelSnapshotB.id,
    })
    expect(modelFiltered.ranking?.totalEligibleDecisions).toBe(1)
    expect(modelFiltered.ranking?.items[0]?.toolSlug).toBe('supabase')
  })

  it('aggregates category group rankings across all subcategories', async () => {
    const db = getTestDb()
    const group = first(
      await db
        .insert(categories)
        .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
        .returning(),
    )
    const authCategory = first(
      await db
        .insert(subcategories)
        .values({ categoryId: group.id, name: 'Auth', slug: 'auth', displayOrder: 1 })
        .returning(),
    )
    const databaseCategory = first(
      await db
        .insert(subcategories)
        .values({ categoryId: group.id, name: 'Database', slug: 'database', displayOrder: 2 })
        .returning(),
    )
    const clerk = first(await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning())
    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-group-aggregation',
          name: 'Benchmark Group Aggregation',
          mode: 'benchmark',
          parserVersion: '1.0',
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
          slug: 'season-group-aggregation',
          name: 'Season Group Aggregation',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const promptRows = await db
      .insert(prompts)
      .values([
        {
          title: 'Build auth flows',
          slug: 'build-auth-flows',
          level: 'beginner',
          contentMd: '# Auth prompt',
        },
        {
          title: 'Build database flows',
          slug: 'build-database-flows',
          level: 'beginner',
          contentMd: '# Database prompt',
        },
      ])
      .returning()
    const promptA = first(promptRows)
    const promptB = first(promptRows.slice(1))

    const promptVersionRows = await db
      .insert(benchmarkPromptVersions)
      .values([
        {
          promptId: promptA.id,
          slug: promptA.slug,
          level: 'beginner',
          version: 1,
          contentMd: promptA.contentMd ?? '# Auth prompt',
          contentHash: 'group-auth',
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        },
        {
          promptId: promptB.id,
          slug: promptB.slug,
          level: 'beginner',
          version: 1,
          contentMd: promptB.contentMd ?? '# Database prompt',
          contentHash: 'group-database',
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        },
      ])
      .returning()
    const promptVersionA = first(promptVersionRows)
    const promptVersionB = first(promptVersionRows.slice(1))
    await db.insert(benchmarkPromptVersionCategories).values([
      {
        promptVersionId: promptVersionA.id,
        categoryId: authCategory.id,
        displayOrder: 1,
      },
      {
        promptVersionId: promptVersionB.id,
        categoryId: databaseCategory.id,
        displayOrder: 1,
      },
    ])

    const llmRows = await db
      .insert(llms)
      .values([
        {
          name: 'Claude Opus',
          slug: 'claude-opus',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Opus',
          modelVersion: '3',
          modelId: 'claude-3-opus',
        },
        {
          name: 'GPT-4.1 Mini',
          slug: 'gpt-4-1-mini',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT Mini',
          modelVersion: '4.1',
          modelId: 'gpt-4.1-mini',
        },
      ])
      .returning()
    const llmA = first(llmRows)
    const llmB = first(llmRows.slice(1))

    const modelSnapshotRows = await db
      .insert(benchmarkModelSnapshots)
      .values([
        {
          llmId: llmA.id,
          name: llmA.name,
          provider: llmA.provider,
          company: llmA.company,
          modelFamily: llmA.modelFamily,
          modelVersion: llmA.modelVersion,
          tier: 'frontier',
          requestedModelId: llmA.modelId,
          temperature: 0.2,
          snapshotKey: 'group-model-a',
        },
        {
          llmId: llmB.id,
          name: llmB.name,
          provider: llmB.provider,
          company: llmB.company,
          modelFamily: llmB.modelFamily,
          modelVersion: llmB.modelVersion,
          tier: 'mid',
          requestedModelId: llmB.modelId,
          temperature: 0.2,
          snapshotKey: 'group-model-b',
        },
      ])
      .returning()
    const modelSnapshotA = first(modelSnapshotRows)
    const modelSnapshotB = first(modelSnapshotRows.slice(1))

    await seedSeasonDecision({
      db,
      seasonId: season.id,
      promptVersionId: promptVersionA.id,
      modelSnapshotId: modelSnapshotA.id,
      categoryId: authCategory.id,
      toolId: clerk.id,
      rawToolName: 'Clerk',
      scheduledFor: '2026-03-10',
    })
    await seedSeasonDecision({
      db,
      seasonId: season.id,
      promptVersionId: promptVersionB.id,
      modelSnapshotId: modelSnapshotB.id,
      categoryId: databaseCategory.id,
      decisionType: 'none',
      scheduledFor: '2026-03-09',
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkRanking.byCategoryGroup({
      groupSlug: 'devtools',
      windowType: 'trailing_7d',
      anchorDate: '2026-03-10',
    })

    expect(result.ranking?.totalDistinctModels).toBe(2)
    expect(result.ranking?.totalDistinctPrompts).toBe(2)
    expect(result.ranking?.totalEligibleDecisions).toBe(2)
    expect(result.ranking?.items[0]?.toolSlug).toBe('clerk')
    expect(result.ranking?.items[0]?.rawEligibleCount).toBe(2)
    expect(result.ranking?.items[0]?.weightedSupportRate).toBeCloseTo(0.5, 5)
    expect(result.ranking?.items[0]?.modelCoverage).toBeCloseTo(0.5, 5)
    expect(result.ranking?.items[0]?.promptCoverage).toBeCloseTo(0.5, 5)
  })

  it('rejects non-benchmark season IDs for benchmark rankings', async () => {
    const fixture = await seedBenchmarkPublicFixture()

    const caller = createTestCaller(null)

    await expect(
      caller.benchmarkRanking.byCategory({
        categorySlug: 'auth',
        seasonId: fixture.explorationSeason.id,
        windowType: 'run_day',
        anchorDate: '2026-03-10',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('rejects non-benchmark season IDs for benchmark matches', async () => {
    const fixture = await seedBenchmarkPublicFixture()

    const caller = createTestCaller(null)

    await expect(
      caller.benchmarkMatch.headToHead({
        categorySlug: 'auth',
        toolASlug: 'clerk',
        toolBSlug: 'supabase',
        seasonId: fixture.explorationSeason.id,
        windowType: 'run_day',
        anchorDate: '2026-03-10',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('rejects identical tools for benchmark matches', async () => {
    const caller = createTestCaller(null)

    await expect(
      caller.benchmarkMatch.headToHead({
        categorySlug: 'auth',
        toolASlug: 'clerk',
        toolBSlug: 'clerk',
        windowType: 'run_day',
        anchorDate: '2026-03-10',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('returns null category markers for missing benchmark match categories', async () => {
    await seedBenchmarkPublicFixture()

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'missing-category',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'run_day',
      anchorDate: '2026-03-10',
    })

    expect(result.category).toBeNull()
    expect(result.toolA?.slug).toBe('clerk')
    expect(result.toolB?.slug).toBe('supabase')
    expect(result.result).toBeNull()
  })

  it('rejects invalid anchor dates for benchmark rankings', async () => {
    const caller = createTestCaller(null)

    await expect(
      caller.benchmarkRanking.byCategory({
        categorySlug: 'auth',
        anchorDate: '2026-02-30',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('rejects invalid anchor dates for benchmark matches', async () => {
    const caller = createTestCaller(null)

    await expect(
      caller.benchmarkMatch.headToHead({
        categorySlug: 'auth',
        toolASlug: 'clerk',
        toolBSlug: 'supabase',
        anchorDate: '2026-02-30',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })
})
