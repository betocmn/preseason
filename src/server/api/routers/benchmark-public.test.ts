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
  toolId: string
  rawToolName: string
}) {
  const { db, seasonId, promptVersionId, modelSnapshotId, categoryId, toolId, rawToolName } = args

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
        scheduledFor: '2026-03-10',
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
    decisionType: 'tool',
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
        level: 'vibe-coder',
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
        level: 'vibe-coder',
        version: 1,
        tier: 'advanced',
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
