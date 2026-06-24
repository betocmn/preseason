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
  matchBatches,
  matchEvaluations,
  matchPromptTemplates,
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

async function seedCompletedManualBatch(args: {
  db: TestDb
  seasonId: string
  categoryId: string
  toolOneId: string
  toolTwoId: string
  winnerToolId: string
  promptTemplateId: string
  modelSnapshotId: string
  createdAt?: Date
}) {
  const {
    db,
    seasonId,
    categoryId,
    toolOneId,
    toolTwoId,
    winnerToolId,
    promptTemplateId,
    modelSnapshotId,
    createdAt,
  } = args

  const [toolAId, toolBId] = toolOneId < toolTwoId ? [toolOneId, toolTwoId] : [toolTwoId, toolOneId]
  const winnerDecision = winnerToolId === toolAId ? 'tool_a' : 'tool_b'

  const batch = first(
    await db
      .insert(matchBatches)
      .values({
        seasonId,
        categoryId,
        toolAId,
        toolBId,
        promptTemplateId,
        triggerMode: 'manual',
        status: 'completed',
        totalEvaluations: 1,
        completedEvaluations: 1,
        createdAt,
      })
      .returning(),
  )

  await db.insert(matchEvaluations).values({
    batchId: batch.id,
    seasonId,
    modelSnapshotId,
    presentationOrder: 'a_first',
    status: 'completed',
    winnerDecision,
  })
}

async function seedCompletedManualBatchWithDecision(args: {
  db: TestDb
  seasonId: string
  categoryId: string
  toolOneId: string
  toolTwoId: string
  winnerDecision: (typeof matchEvaluations.$inferInsert)['winnerDecision']
  promptTemplateId: string
  modelSnapshotId: string
  createdAt?: Date
}) {
  const {
    db,
    seasonId,
    categoryId,
    toolOneId,
    toolTwoId,
    winnerDecision,
    promptTemplateId,
    modelSnapshotId,
    createdAt,
  } = args

  const [toolAId, toolBId] = toolOneId < toolTwoId ? [toolOneId, toolTwoId] : [toolTwoId, toolOneId]

  const batch = first(
    await db
      .insert(matchBatches)
      .values({
        seasonId,
        categoryId,
        toolAId,
        toolBId,
        promptTemplateId,
        triggerMode: 'manual',
        status: 'completed',
        totalEvaluations: 1,
        completedEvaluations: 1,
        createdAt,
      })
      .returning(),
  )

  await db.insert(matchEvaluations).values({
    batchId: batch.id,
    seasonId,
    modelSnapshotId,
    presentationOrder: 'a_first',
    status: 'completed',
    winnerDecision,
  })
}

async function seedHistoricalManualFixture() {
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

  const toolRows = await db
    .insert(tools)
    .values([
      { name: 'Clerk', slug: 'clerk' },
      { name: 'Supabase', slug: 'supabase' },
      { name: 'Firebase', slug: 'firebase' },
      { name: 'Pocketbase', slug: 'pocketbase' },
    ])
    .returning()
  const clerk = first(toolRows)
  const supabase = first(toolRows.slice(1))
  const firebase = first(toolRows.slice(2))
  const pocketbase = first(toolRows.slice(3))

  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-historical-manual',
        name: 'Benchmark Historical Manual',
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
        slug: 'season-historical-manual',
        name: 'Season Historical Manual',
        status: 'active',
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
      })
      .returning(),
  )

  const llm = first(
    await db
      .insert(llms)
      .values({
        name: 'Historical Manual LLM',
        slug: 'historical-manual-llm',
        provider: 'anthropic',
        company: 'Anthropic',
        modelFamily: 'Sonnet',
        modelVersion: '4.6',
        modelId: 'anthropic/claude-sonnet-4.6',
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
        snapshotKey: 'historical-manual-snapshot',
      })
      .returning(),
  )
  await db.insert(benchmarkSeasonModels).values({
    seasonId: season.id,
    modelSnapshotId: modelSnapshot.id,
  })

  const template = first(
    await db
      .insert(matchPromptTemplates)
      .values({
        slug: 'match-compare-historical-manual',
        name: 'Match Compare Historical Manual',
        templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
        schemaVersion: 'match-v2',
        isActive: true,
      })
      .returning(),
  )

  return {
    db,
    season,
    authCategory,
    clerk,
    supabase,
    firebase,
    pocketbase,
    template,
    modelSnapshot,
  }
}

async function seedSeasonDecision(args: {
  db: TestDb
  seasonId: string
  promptVersionId: string
  modelSnapshotId: string
  categoryId: string
  decisionType?: 'tool' | 'none'
  toolId?: string | null
  rawToolName?: string | null
  runStatus?: 'completed' | 'published'
  qcStatus?: string | null
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
    runStatus = 'published',
    qcStatus = 'passed',
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
        status: runStatus,
        qcStatus,
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

  const toolRows = await db
    .insert(tools)
    .values([
      { name: 'Clerk', slug: 'clerk' },
      { name: 'Supabase', slug: 'supabase' },
    ])
    .returning()
  const clerk = first(toolRows)
  const supabase = first(toolRows.slice(1))

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
  const freshSeason = first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId: protocol.id,
        slug: 'season-fresh',
        name: 'Fresh Season',
        status: 'active',
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
      })
      .returning(),
  )

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

  return {
    authCategory,
    clerk,
    explorationSeason,
    freshSeason,
    modelSnapshot,
    promptVersion,
    supabase,
  }
}

describe('benchmark public routers', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

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
      dateRange: 'all',
      anchorDate: '2026-03-10',
    })

    expect(result.ranking?.items[0]?.toolSlug).toBe('clerk')
  })

  it('uses an auto-published passing run without requiring publishRun', async () => {
    const { authCategory, freshSeason, modelSnapshot, promptVersion, supabase } =
      await seedBenchmarkPublicFixture()

    await seedSeasonDecision({
      db: getTestDb(),
      seasonId: freshSeason.id,
      promptVersionId: promptVersion.id,
      modelSnapshotId: modelSnapshot.id,
      categoryId: authCategory.id,
      toolId: supabase?.id ?? '',
      rawToolName: 'Supabase',
      runStatus: 'published',
      qcStatus: 'passed',
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkRanking.byCategory({
      categorySlug: 'auth',
      dateRange: 'all',
      anchorDate: '2026-03-10',
    })

    expect(result.ranking?.items[0]?.toolSlug).toBe('supabase')
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

  it('falls back to manual match data when no benchmark season is published', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-manual-only',
          name: 'Benchmark Manual Only',
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
          slug: 'season-manual-only',
          name: 'Season Manual Only',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'GPT-4o',
          slug: 'gpt-4o-manual-only',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT',
          modelVersion: '4o',
          modelId: 'openai/gpt-4o',
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
          snapshotKey: 'manual-only-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: season.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-manual-only',
          name: 'Match Compare Manual Only',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.result).not.toBeNull()
    expect(result.result?.aWins).toBe(1)
    expect(result.result?.bWins).toBe(0)
    expect(result.result?.decisiveCaseCount).toBe(1)
  })

  it('ignores exploration manual match data when no benchmark season is published', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const benchmarkProtocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-manual-exploration-guard',
          name: 'Benchmark Manual Exploration Guard',
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
          slug: 'exploration-manual-exploration-guard',
          name: 'Exploration Manual Exploration Guard',
          mode: 'exploration',
          parserVersion: '1.0',
          scoringVersion: '1.0',
          promptContractVersion: '1.0',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasons).values({
      protocolId: benchmarkProtocol.id,
      slug: 'season-benchmark-manual-exploration-guard',
      name: 'Season Benchmark Manual Exploration Guard',
      status: 'active',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
    })
    const explorationSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: explorationProtocol.id,
          slug: 'season-exploration-manual-exploration-guard',
          name: 'Season Exploration Manual Exploration Guard',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Exploration Guard LLM',
          slug: 'exploration-guard-llm',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT',
          modelVersion: '4o',
          modelId: 'openai/gpt-4o',
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
          snapshotKey: 'exploration-guard-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: explorationSeason.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-exploration-guard',
          name: 'Match Compare Exploration Guard',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: explorationSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.result).toBeNull()
  })

  it('keeps manual fallback scoped by season, window, and model tier', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-manual-scope',
          name: 'Benchmark Manual Scope',
          mode: 'benchmark',
          parserVersion: '1.0',
          scoringVersion: '1.0',
          promptContractVersion: '1.0',
        })
        .returning(),
    )
    const targetSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-manual-scope-target',
          name: 'Season Manual Scope Target',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )
    const otherSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-manual-scope-other',
          name: 'Season Manual Scope Other',
          status: 'active',
          createdAt: new Date('2026-03-09T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Manual Scope LLM',
          slug: 'manual-scope-llm',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT',
          modelVersion: '4o',
          modelId: 'openai/gpt-4o',
        })
        .returning(),
    )
    const modelSnapshotRows = await db
      .insert(benchmarkModelSnapshots)
      .values([
        {
          llmId: llm.id,
          name: `${llm.name} Frontier`,
          provider: llm.provider,
          company: llm.company,
          modelFamily: llm.modelFamily,
          modelVersion: llm.modelVersion,
          tier: 'frontier',
          requestedModelId: llm.modelId,
          temperature: 0.2,
          snapshotKey: 'manual-scope-frontier',
        },
        {
          llmId: llm.id,
          name: `${llm.name} Mid`,
          provider: llm.provider,
          company: llm.company,
          modelFamily: llm.modelFamily,
          modelVersion: llm.modelVersion,
          tier: 'mid',
          requestedModelId: llm.modelId,
          temperature: 0.2,
          snapshotKey: 'manual-scope-mid',
        },
      ])
      .returning()
    const frontierSnapshot = first(modelSnapshotRows)
    const midSnapshot = first(modelSnapshotRows.slice(1))

    await db.insert(benchmarkSeasonModels).values([
      { seasonId: targetSeason.id, modelSnapshotId: frontierSnapshot.id },
      { seasonId: targetSeason.id, modelSnapshotId: midSnapshot.id },
      { seasonId: otherSeason.id, modelSnapshotId: frontierSnapshot.id },
    ])

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-manual-scope',
          name: 'Match Compare Manual Scope',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: targetSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: supabase.id,
      promptTemplateId: template.id,
      modelSnapshotId: frontierSnapshot.id,
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
    })
    await seedCompletedManualBatch({
      db,
      seasonId: targetSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: frontierSnapshot.id,
      createdAt: new Date('2026-02-01T12:00:00.000Z'),
    })
    await seedCompletedManualBatch({
      db,
      seasonId: targetSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: midSnapshot.id,
      createdAt: new Date('2026-03-10T13:00:00.000Z'),
    })
    await seedCompletedManualBatch({
      db,
      seasonId: otherSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: frontierSnapshot.id,
      createdAt: new Date('2026-03-10T14:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      seasonId: targetSeason.id,
      windowType: 'run_day',
      anchorDate: '2026-03-10',
      modelTier: 'frontier',
    })

    expect(result.result?.decisiveCaseCount).toBe(1)
    expect(result.result?.aWins).toBe(0)
    expect(result.result?.bWins).toBe(1)
  })

  it('uses published manual fallback when the latest published season has no head-to-head result', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-manual-published-fallback',
          name: 'Benchmark Manual Published Fallback',
          mode: 'benchmark',
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
          slug: 'season-manual-published-fallback-older',
          name: 'Season Manual Published Fallback Older',
          status: 'active',
          createdAt: new Date('2026-03-09T00:00:00.000Z'),
        })
        .returning(),
    )
    const latestPublishedSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-manual-published-fallback-latest',
          name: 'Season Manual Published Fallback Latest',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    await db.insert(benchmarkRuns).values([
      {
        seasonId: olderSeason.id,
        scheduledFor: '2026-03-09',
        status: 'published',
        qcStatus: 'passed',
      },
      {
        seasonId: latestPublishedSeason.id,
        scheduledFor: '2026-03-10',
        status: 'published',
        qcStatus: 'passed',
      },
    ])

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Published Fallback LLM',
          slug: 'published-fallback-llm',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT',
          modelVersion: '4o',
          modelId: 'openai/gpt-4o',
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
          snapshotKey: 'published-fallback-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values([
      { seasonId: olderSeason.id, modelSnapshotId: modelSnapshot.id },
      { seasonId: latestPublishedSeason.id, modelSnapshotId: modelSnapshot.id },
    ])

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-published-fallback',
          name: 'Match Compare Published Fallback',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: olderSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.result).not.toBeNull()
    expect(result.result?.aWins).toBe(1)
    expect(result.result?.bWins).toBe(0)
    expect(result.result?.decisiveCaseCount).toBe(1)
  })

  it('includes manual fallback from the latest active benchmark season', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-manual-active-fallback',
          name: 'Benchmark Manual Active Fallback',
          mode: 'benchmark',
          parserVersion: '1.0',
          scoringVersion: '1.0',
          promptContractVersion: '1.0',
        })
        .returning(),
    )
    const publishedSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-manual-active-fallback-published',
          name: 'Season Manual Active Fallback Published',
          status: 'completed',
          createdAt: new Date('2026-03-09T00:00:00.000Z'),
        })
        .returning(),
    )
    const activeSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-manual-active-fallback-active',
          name: 'Season Manual Active Fallback Active',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    await db.insert(benchmarkRuns).values({
      seasonId: publishedSeason.id,
      scheduledFor: '2026-03-09',
      status: 'published',
      qcStatus: 'passed',
    })

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Active Fallback LLM',
          slug: 'active-fallback-llm',
          provider: 'openai',
          company: 'OpenAI',
          modelFamily: 'GPT',
          modelVersion: '4o',
          modelId: 'openai/gpt-4o',
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
          snapshotKey: 'active-fallback-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values([
      { seasonId: publishedSeason.id, modelSnapshotId: modelSnapshot.id },
      { seasonId: activeSeason.id, modelSnapshotId: modelSnapshot.id },
    ])

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-active-fallback',
          name: 'Match Compare Active Fallback',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: activeSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.result).not.toBeNull()
    expect(result.result?.aWins).toBe(1)
    expect(result.result?.bWins).toBe(0)
    expect(result.result?.decisiveCaseCount).toBe(1)
  })

  it('aggregates manual featured matchups across batches for the same pair', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-featured-manual-aggregate',
          name: 'Benchmark Featured Manual Aggregate',
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
          slug: 'season-featured-manual-aggregate',
          name: 'Season Featured Manual Aggregate',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Featured Aggregate LLM',
          slug: 'featured-aggregate-llm',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Sonnet',
          modelVersion: '4.6',
          modelId: 'anthropic/claude-sonnet-4.6',
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
          snapshotKey: 'featured-manual-aggregate-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: season.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-featured-aggregate',
          name: 'Match Compare Featured Aggregate',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )
    const now = new Date()
    const recentBatchOne = new Date(now)
    recentBatchOne.setUTCDate(recentBatchOne.getUTCDate() - 2)
    const recentBatchTwo = new Date(now)
    recentBatchTwo.setUTCDate(recentBatchTwo.getUTCDate() - 1)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentBatchOne,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: supabase.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentBatchTwo,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2000-01-01T00:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 12,
    })

    expect(featured).toHaveLength(1)
    expect(featured[0]?.result.decisiveCaseCount).toBe(2)
    expect(featured[0]?.result.aWins).toBe(1)
    expect(featured[0]?.result.bWins).toBe(1)
  })

  it('prioritizes recent manual featured matchups ahead of benchmark rankings', async () => {
    const fixture = await seedBenchmarkPublicFixture()
    const db = getTestDb()
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const todayDate = today.toISOString().slice(0, 10)
    const yesterdayDate = yesterday.toISOString().slice(0, 10)

    const databaseCategory = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: fixture.authCategory.categoryId,
          name: 'Database',
          slug: 'database',
          displayOrder: 2,
        })
        .returning(),
    )

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Firebase', slug: 'firebase' },
        { name: 'Pocketbase', slug: 'pocketbase' },
      ])
      .returning()
    const firebase = first(toolRows)
    const pocketbase = first(toolRows.slice(1))

    const secondPromptVersion = first(
      await db
        .insert(benchmarkPromptVersions)
        .values({
          promptId: fixture.promptVersion.promptId,
          slug: 'build-a-saas-app-featured-priority',
          level: fixture.promptVersion.level,
          version: 2,
          contentMd: fixture.promptVersion.contentMd,
          contentHash: 'benchmark-public-featured-priority',
          promptContractVersion: fixture.promptVersion.promptContractVersion,
          systemPromptSnapshot: fixture.promptVersion.systemPromptSnapshot,
        })
        .returning(),
    )
    await db.insert(benchmarkPromptVersionCategories).values({
      promptVersionId: secondPromptVersion.id,
      categoryId: fixture.authCategory.id,
      displayOrder: 1,
    })

    const secondModelSnapshot = first(
      await db
        .insert(benchmarkModelSnapshots)
        .values({
          llmId: fixture.modelSnapshot.llmId,
          name: 'Claude Opus Featured Priority',
          provider: fixture.modelSnapshot.provider,
          company: fixture.modelSnapshot.company,
          modelFamily: fixture.modelSnapshot.modelFamily,
          modelVersion: fixture.modelSnapshot.modelVersion,
          tier: fixture.modelSnapshot.tier,
          requestedModelId: 'claude-3-opus-featured-priority',
          temperature: fixture.modelSnapshot.temperature,
          snapshotKey: 'benchmark-public-featured-priority-snapshot',
        })
        .returning(),
    )

    await seedSeasonDecision({
      db,
      seasonId: fixture.freshSeason.id,
      promptVersionId: fixture.promptVersion.id,
      modelSnapshotId: fixture.modelSnapshot.id,
      categoryId: fixture.authCategory.id,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
      scheduledFor: todayDate,
    })
    await seedSeasonDecision({
      db,
      seasonId: fixture.freshSeason.id,
      promptVersionId: secondPromptVersion.id,
      modelSnapshotId: secondModelSnapshot.id,
      categoryId: fixture.authCategory.id,
      toolId: fixture.supabase.id,
      rawToolName: 'Supabase',
      scheduledFor: yesterdayDate,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-featured-priority',
          name: 'Match Compare Featured Priority',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    const recentBatchCreatedAt = new Date()
    recentBatchCreatedAt.setUTCDate(recentBatchCreatedAt.getUTCDate() - 1)

    await seedCompletedManualBatch({
      db,
      seasonId: fixture.freshSeason.id,
      categoryId: databaseCategory.id,
      toolOneId: firebase.id,
      toolTwoId: pocketbase.id,
      winnerToolId: firebase.id,
      promptTemplateId: template.id,
      modelSnapshotId: fixture.modelSnapshot.id,
      createdAt: recentBatchCreatedAt,
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 1,
    })

    expect(featured).toHaveLength(1)
    const entry = featured[0]
    expect(entry?.category.slug).toBe('database')
    expect([entry?.toolA.slug, entry?.toolB.slug].sort()).toEqual(['firebase', 'pocketbase'])
  })

  it('ignores exploration manual featured matchups when benchmark seasons are unpublished', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))

    const benchmarkProtocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-featured-exploration-guard',
          name: 'Benchmark Featured Exploration Guard',
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
          slug: 'exploration-featured-exploration-guard',
          name: 'Exploration Featured Exploration Guard',
          mode: 'exploration',
          parserVersion: '1.0',
          scoringVersion: '1.0',
          promptContractVersion: '1.0',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasons).values({
      protocolId: benchmarkProtocol.id,
      slug: 'season-benchmark-featured-exploration-guard',
      name: 'Season Benchmark Featured Exploration Guard',
      status: 'active',
      createdAt: new Date('2026-03-10T00:00:00.000Z'),
    })
    const explorationSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: explorationProtocol.id,
          slug: 'season-exploration-featured-exploration-guard',
          name: 'Season Exploration Featured Exploration Guard',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Featured Exploration Guard LLM',
          slug: 'featured-exploration-guard-llm',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Sonnet',
          modelVersion: '4.6',
          modelId: 'anthropic/claude-sonnet-4.6',
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
          snapshotKey: 'featured-exploration-guard-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: explorationSeason.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-featured-exploration-guard',
          name: 'Match Compare Featured Exploration Guard',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: explorationSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 12,
    })

    expect(featured).toEqual([])
  })

  it('includes active-season manual featured matchups alongside published benchmark seasons', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
        { name: 'Firebase', slug: 'firebase' },
        { name: 'Pocketbase', slug: 'pocketbase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))
    const firebase = first(toolRows.slice(2))
    const pocketbase = first(toolRows.slice(3))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-featured-published-manual-only',
          name: 'Benchmark Featured Published Manual Only',
          mode: 'benchmark',
          parserVersion: '1.0',
          scoringVersion: '1.0',
          promptContractVersion: '1.0',
        })
        .returning(),
    )
    const publishedSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-featured-published-manual-only',
          name: 'Season Featured Published Manual Only',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )
    const unpublishedSeason = first(
      await db
        .insert(benchmarkSeasons)
        .values({
          protocolId: protocol.id,
          slug: 'season-featured-unpublished-manual-only',
          name: 'Season Featured Unpublished Manual Only',
          status: 'active',
          createdAt: new Date('2026-03-11T00:00:00.000Z'),
        })
        .returning(),
    )

    await db.insert(benchmarkRuns).values({
      seasonId: publishedSeason.id,
      scheduledFor: '2026-03-10',
      status: 'published',
      qcStatus: 'passed',
    })

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Featured Published Manual LLM',
          slug: 'featured-published-manual-llm',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Sonnet',
          modelVersion: '4.6',
          modelId: 'anthropic/claude-sonnet-4.6',
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
          snapshotKey: 'featured-published-manual-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values([
      { seasonId: publishedSeason.id, modelSnapshotId: modelSnapshot.id },
      { seasonId: unpublishedSeason.id, modelSnapshotId: modelSnapshot.id },
    ])

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-featured-published-manual-only',
          name: 'Match Compare Featured Published Manual Only',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    const publishedBatchCreatedAt = new Date()
    publishedBatchCreatedAt.setUTCDate(publishedBatchCreatedAt.getUTCDate() - 2)
    const unpublishedBatchCreatedAt = new Date()
    unpublishedBatchCreatedAt.setUTCDate(unpublishedBatchCreatedAt.getUTCDate() - 1)

    await seedCompletedManualBatch({
      db,
      seasonId: publishedSeason.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: publishedBatchCreatedAt,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: unpublishedSeason.id,
      categoryId: authCategory.id,
      toolOneId: firebase.id,
      toolTwoId: pocketbase.id,
      winnerToolId: firebase.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: unpublishedBatchCreatedAt,
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 12,
    })

    expect(featured).toHaveLength(2)
    const pairs = featured
      .map((entry) => [entry.toolA.slug, entry.toolB.slug].sort().join(':'))
      .sort()
    expect(pairs).toEqual(['clerk:supabase', 'firebase:pocketbase'])
  })

  it('keeps scanning manual pairs when earlier candidates have no decisive cases', async () => {
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

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
        { name: 'Firebase', slug: 'firebase' },
        { name: 'Pocketbase', slug: 'pocketbase' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))
    const firebase = first(toolRows.slice(2))
    const pocketbase = first(toolRows.slice(3))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-featured-manual-scan',
          name: 'Benchmark Featured Manual Scan',
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
          slug: 'season-featured-manual-scan',
          name: 'Season Featured Manual Scan',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Featured Scan LLM',
          slug: 'featured-scan-llm',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Sonnet',
          modelVersion: '4.6',
          modelId: 'anthropic/claude-sonnet-4.6',
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
          snapshotKey: 'featured-manual-scan-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: season.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-featured-scan',
          name: 'Match Compare Featured Scan',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    const now = new Date()
    for (let i = 0; i < 8; i++) {
      const tieBatchCreatedAt = new Date(now)
      tieBatchCreatedAt.setUTCMinutes(tieBatchCreatedAt.getUTCMinutes() - i - 1)
      await seedCompletedManualBatchWithDecision({
        db,
        seasonId: season.id,
        categoryId: authCategory.id,
        toolOneId: clerk.id,
        toolTwoId: supabase.id,
        winnerDecision: 'tie',
        promptTemplateId: template.id,
        modelSnapshotId: modelSnapshot.id,
        createdAt: tieBatchCreatedAt,
      })
    }
    const olderDecisive = new Date(now)
    olderDecisive.setUTCMinutes(olderDecisive.getUTCMinutes() - 10)
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: firebase.id,
      toolTwoId: pocketbase.id,
      winnerToolId: firebase.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: olderDecisive,
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 1,
    })

    expect(featured).toHaveLength(1)
    const entry = featured[0]
    expect(entry).toBeDefined()
    const pair = [entry?.toolA.slug, entry?.toolB.slug].sort()
    expect(pair).toEqual(['firebase', 'pocketbase'])
    expect(entry?.result.decisiveCaseCount).toBe(1)
    expect((entry?.result.aWins ?? 0) + (entry?.result.bWins ?? 0)).toBe(1)
  })

  it('keeps manual featured fallback scoped to requested category group', async () => {
    const db = getTestDb()

    const devtoolsGroup = first(
      await db
        .insert(categories)
        .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
        .returning(),
    )
    const editorsGroup = first(
      await db
        .insert(categories)
        .values({ name: 'Editors', slug: 'editors', displayOrder: 2 })
        .returning(),
    )
    const authCategory = first(
      await db
        .insert(subcategories)
        .values({ categoryId: devtoolsGroup.id, name: 'Auth', slug: 'auth', displayOrder: 1 })
        .returning(),
    )
    const writingCategory = first(
      await db
        .insert(subcategories)
        .values({ categoryId: editorsGroup.id, name: 'Writing', slug: 'writing', displayOrder: 1 })
        .returning(),
    )

    const toolRows = await db
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
        { name: 'Notion', slug: 'notion' },
        { name: 'Obsidian', slug: 'obsidian' },
      ])
      .returning()
    const clerk = first(toolRows)
    const supabase = first(toolRows.slice(1))
    const notion = first(toolRows.slice(2))
    const obsidian = first(toolRows.slice(3))

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-featured-manual-scope',
          name: 'Benchmark Featured Manual Scope',
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
          slug: 'season-featured-manual-scope',
          name: 'Season Featured Manual Scope',
          status: 'active',
          createdAt: new Date('2026-03-10T00:00:00.000Z'),
        })
        .returning(),
    )

    const llm = first(
      await db
        .insert(llms)
        .values({
          name: 'Claude Sonnet',
          slug: 'claude-sonnet-featured-scope',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Sonnet',
          modelVersion: '4.6',
          modelId: 'anthropic/claude-sonnet-4.6',
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
          snapshotKey: 'featured-manual-scope-snapshot',
        })
        .returning(),
    )
    await db.insert(benchmarkSeasonModels).values({
      seasonId: season.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const template = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-featured-scope',
          name: 'Match Compare Featured Scope',
          templateMd: 'Compare {{TOOL_A}} and {{TOOL_B}}.',
          schemaVersion: 'match-v2',
          isActive: true,
        })
        .returning(),
    )

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: writingCategory.id,
      toolOneId: notion.id,
      toolTwoId: obsidian.id,
      winnerToolId: notion.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const caller = createTestCaller(null)
    const scoped = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 12,
    })
    expect(scoped).toHaveLength(1)
    expect(scoped.every((entry) => entry.category.slug === 'auth')).toBe(true)

    const invalidGroup = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'missing-group',
      limit: 12,
    })
    expect(invalidGroup).toEqual([])
  })

  it('surfaces historical manual matchups after active ones when includeHistorical is set', async () => {
    const fixture = await seedHistoricalManualFixture()
    const {
      db,
      season,
      authCategory,
      clerk,
      supabase,
      firebase,
      pocketbase,
      template,
      modelSnapshot,
    } = fixture

    const now = new Date()
    const recentCreatedAt = new Date(now)
    recentCreatedAt.setUTCDate(recentCreatedAt.getUTCDate() - 1)
    const historicalCreatedAt = new Date(now)
    historicalCreatedAt.setUTCDate(historicalCreatedAt.getUTCDate() - 60)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentCreatedAt,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: firebase.id,
      toolTwoId: pocketbase.id,
      winnerToolId: firebase.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: historicalCreatedAt,
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 50,
      includeHistorical: true,
    })

    expect(featured).toHaveLength(2)
    const activeEntry = featured[0]
    const historicalEntry = featured[1]
    expect(activeEntry?.status).toBe('active')
    expect(historicalEntry?.status).toBe('historical')
    expect([activeEntry?.toolA.slug, activeEntry?.toolB.slug].sort()).toEqual(['clerk', 'supabase'])
    expect([historicalEntry?.toolA.slug, historicalEntry?.toolB.slug].sort()).toEqual([
      'firebase',
      'pocketbase',
    ])
  })

  it('hides historical manual matchups by default', async () => {
    const fixture = await seedHistoricalManualFixture()
    const {
      db,
      season,
      authCategory,
      clerk,
      supabase,
      firebase,
      pocketbase,
      template,
      modelSnapshot,
    } = fixture

    const now = new Date()
    const recentCreatedAt = new Date(now)
    recentCreatedAt.setUTCDate(recentCreatedAt.getUTCDate() - 1)
    const historicalCreatedAt = new Date(now)
    historicalCreatedAt.setUTCDate(historicalCreatedAt.getUTCDate() - 60)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentCreatedAt,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: firebase.id,
      toolTwoId: pocketbase.id,
      winnerToolId: firebase.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: historicalCreatedAt,
    })

    const caller = createTestCaller(null)
    const featured = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      limit: 50,
    })

    expect(featured).toHaveLength(1)
    expect(featured[0]?.status).toBe('active')
    expect(featured.every((entry) => entry.status === 'active')).toBe(true)
  })

  it('scopes featured matchups to a single subcategory when subcategorySlug is provided', async () => {
    const fixture = await seedHistoricalManualFixture()
    const {
      db,
      season,
      authCategory,
      clerk,
      supabase,
      firebase,
      pocketbase,
      template,
      modelSnapshot,
    } = fixture

    const dbCategory = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: authCategory.categoryId,
          name: 'Database',
          slug: 'database',
          displayOrder: 2,
        })
        .returning(),
    )

    const now = new Date()
    const recentCreatedAt = new Date(now)
    recentCreatedAt.setUTCDate(recentCreatedAt.getUTCDate() - 1)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentCreatedAt,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: dbCategory.id,
      toolOneId: firebase.id,
      toolTwoId: pocketbase.id,
      winnerToolId: firebase.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentCreatedAt,
    })

    const caller = createTestCaller(null)
    const scoped = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      subcategorySlug: 'auth',
      limit: 50,
      includeHistorical: true,
    })

    expect(scoped).toHaveLength(1)
    expect(scoped[0]?.category.slug).toBe('auth')
    expect([scoped[0]?.toolA.slug, scoped[0]?.toolB.slug].sort()).toEqual(['clerk', 'supabase'])
  })

  it('falls back to all-time manual history when the trailing window has no decisive cases', async () => {
    const fixture = await seedHistoricalManualFixture()
    const { db, season, authCategory, clerk, supabase, template, modelSnapshot } = fixture

    const historicalCreatedAt = new Date()
    historicalCreatedAt.setUTCDate(historicalCreatedAt.getUTCDate() - 60)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: historicalCreatedAt,
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'trailing_28d',
    })

    expect(result.result).not.toBeNull()
    expect(result.result?.decisiveCaseCount).toBe(1)
    expect(result.result?.aWins).toBe(1)
    expect(result.result?.bWins).toBe(0)
  })

  it('does not broaden narrow windows with the historical fallback', async () => {
    const fixture = await seedHistoricalManualFixture()
    const { db, season, authCategory, clerk, supabase, template, modelSnapshot } = fixture

    const historicalCreatedAt = new Date()
    historicalCreatedAt.setUTCDate(historicalCreatedAt.getUTCDate() - 60)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: historicalCreatedAt,
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'run_day',
    })

    expect(result.result).toBeNull()
  })

  it('returns empty featured matchups when subcategory slug does not belong to the selected group', async () => {
    const fixture = await seedHistoricalManualFixture()
    const { db, season, authCategory, clerk, supabase, template, modelSnapshot } = fixture

    const otherGroup = first(
      await db
        .insert(categories)
        .values({ name: 'Other', slug: 'other-group', displayOrder: 2 })
        .returning(),
    )
    const otherSub = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: otherGroup.id,
          name: 'Other Sub',
          slug: 'other-sub',
          displayOrder: 1,
        })
        .returning(),
    )

    const now = new Date()
    const recentCreatedAt = new Date(now)
    recentCreatedAt.setUTCDate(recentCreatedAt.getUTCDate() - 1)

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentCreatedAt,
    })
    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: otherSub.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: recentCreatedAt,
    })

    const caller = createTestCaller(null)
    const mismatched = await caller.benchmarkMatch.listFeatured({
      categorySlug: 'devtools',
      subcategorySlug: 'other-sub',
      limit: 50,
      includeHistorical: true,
    })

    expect(mismatched).toEqual([])
  })

  it('does not include future manual history in head-to-head fallback', async () => {
    const fixture = await seedHistoricalManualFixture()
    const { db, season, authCategory, clerk, supabase, template, modelSnapshot } = fixture

    await seedCompletedManualBatch({
      db,
      seasonId: season.id,
      categoryId: authCategory.id,
      toolOneId: clerk.id,
      toolTwoId: supabase.id,
      winnerToolId: clerk.id,
      promptTemplateId: template.id,
      modelSnapshotId: modelSnapshot.id,
      createdAt: new Date('2026-04-15T00:00:00.000Z'),
    })

    const caller = createTestCaller(null)
    const result = await caller.benchmarkMatch.headToHead({
      categorySlug: 'auth',
      toolASlug: 'clerk',
      toolBSlug: 'supabase',
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.result).toBeNull()
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
          // Archived (superseded) model: still in the season, but grouped under Archived.
          isActive: false,
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
    // Active models are grouped by company; the archived (GPT-5) model is separated out.
    expect(modelFilters.companies.map((company) => company.name)).toEqual(['Anthropic'])
    expect(modelFilters.companies[0]?.families[0]?.name).toBe('Sonnet')
    expect(modelFilters.companies[0]?.families[0]?.models[0]?.id).toBe(modelSnapshotA.id)
    expect(modelFilters.companies[0]?.families[0]?.models[0]?.version).toBe('4.6')
    expect(modelFilters.archived.map((company) => company.name)).toEqual(['OpenAI'])
    expect(modelFilters.archived[0]?.families[0]?.models[0]?.id).toBe(modelSnapshotB.id)

    const modelAFiltered = await caller.benchmarkRanking.byCategory({
      categorySlug: 'auth',
      dateRange: 'all',
      anchorDate: '2026-03-10',
      modelSnapshotId: modelSnapshotA.id,
    })
    expect(modelAFiltered.ranking?.totalEligibleDecisions).toBe(1)
    expect(modelAFiltered.ranking?.items[0]?.toolSlug).toBe('clerk')

    const modelFiltered = await caller.benchmarkRanking.byCategory({
      categorySlug: 'auth',
      dateRange: 'all',
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
      dateRange: 'all',
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
        dateRange: 'all',
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
