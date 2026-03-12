import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkModelWeightConfigs,
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
import {
  computeCategoryRanking,
  computeHeadToHead,
  getWeightForTier,
  sliceRunIdsForWindow,
  wilsonInterval,
} from './scoring'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

// ---------------------------------------------------------------------------
// Unit tests (no DB)
// ---------------------------------------------------------------------------

describe('wilsonInterval', () => {
  it('returns zero interval for zero trials', () => {
    const { low, high } = wilsonInterval(0, 0)
    expect(low).toBe(0)
    expect(high).toBe(0)
  })

  it('computes correct interval for 50/50 split', () => {
    const { low, high } = wilsonInterval(50, 100)
    expect(low).toBeGreaterThan(0.39)
    expect(low).toBeLessThan(0.41)
    expect(high).toBeGreaterThan(0.59)
    expect(high).toBeLessThan(0.61)
  })

  it('handles all successes', () => {
    const { low, high } = wilsonInterval(100, 100)
    expect(low).toBeGreaterThan(0.95)
    expect(high).toBeCloseTo(1, 10)
  })

  it('handles zero successes', () => {
    const { low, high } = wilsonInterval(0, 100)
    expect(low).toBe(0)
    expect(high).toBeLessThan(0.05)
  })

  it('produces wider intervals for small samples', () => {
    const small = wilsonInterval(5, 10)
    const large = wilsonInterval(50, 100)
    const smallWidth = small.high - small.low
    const largeWidth = large.high - large.low
    expect(smallWidth).toBeGreaterThan(largeWidth)
  })
})

describe('getWeightForTier', () => {
  const config = { frontierWeight: 1.5, midWeight: 1.0, smallWeight: 0.6 }

  it('returns frontier weight', () => {
    expect(getWeightForTier(config, 'frontier')).toBe(1.5)
  })

  it('returns mid weight', () => {
    expect(getWeightForTier(config, 'mid')).toBe(1.0)
  })

  it('returns small weight', () => {
    expect(getWeightForTier(config, 'small')).toBe(0.6)
  })
})

describe('sliceRunIdsForWindow', () => {
  const runIds = ['run-8', 'run-7', 'run-6', 'run-5', 'run-4', 'run-3', 'run-2', 'run-1']

  it('returns the latest published run for run_day', () => {
    expect(sliceRunIdsForWindow(runIds, 'run_day')).toEqual(['run-8'])
  })

  it('returns the last seven published runs for trailing_7d', () => {
    expect(sliceRunIdsForWindow(runIds, 'trailing_7d')).toEqual([
      'run-8',
      'run-7',
      'run-6',
      'run-5',
      'run-4',
      'run-3',
      'run-2',
    ])
  })

  it('returns the previous non-overlapping run slice when offset is provided', () => {
    expect(sliceRunIdsForWindow(runIds, 'trailing_7d', 7)).toEqual(['run-1'])
  })

  it('returns the full published history for season_to_date', () => {
    expect(sliceRunIdsForWindow(runIds, 'season_to_date')).toEqual(runIds)
  })

  it('returns no previous season_to_date slice', () => {
    expect(sliceRunIdsForWindow(runIds, 'season_to_date', 1)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof getTestDb>

async function seedScoringFixture(db: TestDb) {
  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
  const authCat = first(
    await db
      .insert(subcategories)
      .values({ categoryId: group.id, name: 'Auth', slug: 'auth', displayOrder: 1 })
      .returning(),
  )
  const dbCat = first(
    await db
      .insert(subcategories)
      .values({ categoryId: group.id, name: 'Database', slug: 'database', displayOrder: 2 })
      .returning(),
  )

  const [clerk, supabase, drizzleTool] = await db
    .insert(tools)
    .values([
      { name: 'Clerk', slug: 'clerk' },
      { name: 'Supabase', slug: 'supabase' },
      { name: 'Drizzle', slug: 'drizzle' },
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

  const season = first(
    await db
      .insert(benchmarkSeasons)
      .values({ protocolId: protocol.id, slug: 'season-1', name: 'Season 1', status: 'active' })
      .returning(),
  )

  const weightConfig = first(
    await db
      .insert(benchmarkModelWeightConfigs)
      .values({ slug: 'uniform-v1', name: 'Uniform', isActive: true })
      .returning(),
  )

  // 3 LLMs with different tiers
  const llmRows = await db
    .insert(llms)
    .values([
      { name: 'Claude Opus', slug: 'claude-opus', provider: 'anthropic', modelId: 'claude-3-opus' },
      {
        name: 'GPT-4o Mini',
        slug: 'gpt-4o-mini',
        provider: 'openai',
        modelId: 'openai/gpt-4o-mini',
      },
      { name: 'Llama 70B', slug: 'llama-70b', provider: 'meta', modelId: 'meta/llama-3.1-70b' },
    ])
    .returning()

  const tiers: Array<'frontier' | 'mid' | 'small'> = ['frontier', 'mid', 'small']
  const modelSnapshots = []
  for (let i = 0; i < llmRows.length; i++) {
    const llm = llmRows[i]!
    const ms = first(
      await db
        .insert(benchmarkModelSnapshots)
        .values({
          llmId: llm.id,
          name: llm.name,
          provider: llm.provider,
          tier: tiers[i]!,
          requestedModelId: llm.modelId,
          temperature: 0.2,
          snapshotKey: `${llm.modelId}:0.2:default:default:default`,
        })
        .returning(),
    )
    modelSnapshots.push(ms)
  }

  // 3 prompts with different tiers
  const promptTiers: Array<'basic' | 'intermediate' | 'advanced'> = [
    'basic',
    'intermediate',
    'advanced',
  ]
  const promptVersions = []
  for (let i = 0; i < 3; i++) {
    const p = first(
      await db
        .insert(prompts)
        .values({
          title: `Prompt ${i + 1}`,
          slug: `prompt-${i + 1}`,
          level: 'vibe-coder',
          contentMd: `# Prompt ${i + 1}`,
        })
        .returning(),
    )
    const pv = first(
      await db
        .insert(benchmarkPromptVersions)
        .values({
          promptId: p.id,
          slug: p.slug,
          level: 'vibe-coder',
          version: 1,
          tier: promptTiers[i]!,
          contentMd: `# Prompt ${i + 1}`,
          contentHash: `hash-${i}-${Date.now()}-${Math.random()}`,
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        })
        .returning(),
    )
    await db.insert(benchmarkPromptVersionCategories).values([
      { promptVersionId: pv.id, categoryId: authCat.id, displayOrder: 1 },
      { promptVersionId: pv.id, categoryId: dbCat.id, displayOrder: 2 },
    ])
    promptVersions.push(pv)
  }

  // Link season prompts and models, create cases
  const caseRows = []
  for (const pv of promptVersions) {
    await db.insert(benchmarkSeasonPrompts).values({ seasonId: season.id, promptVersionId: pv.id })
    for (const ms of modelSnapshots) {
      await db
        .insert(benchmarkSeasonModels)
        .values({ seasonId: season.id, modelSnapshotId: ms.id })
        .onConflictDoNothing()
      const c = first(
        await db
          .insert(benchmarkCases)
          .values({ seasonId: season.id, promptVersionId: pv.id, modelSnapshotId: ms.id })
          .returning(),
      )
      caseRows.push(c)
    }
  }

  return {
    group,
    authCat,
    dbCat,
    clerk: clerk!,
    supabase: supabase!,
    drizzleTool: drizzleTool!,
    protocol,
    season,
    weightConfig,
    llmRows,
    modelSnapshots,
    promptVersions,
    caseRows,
  }
}

type Fixture = Awaited<ReturnType<typeof seedScoringFixture>>

async function seedPublishedRun(
  db: TestDb,
  fixture: Fixture,
  scheduledFor: string,
  decisions: Array<{
    caseIndex: number
    categoryId: string
    decisionType: 'tool' | 'none'
    toolId?: string
    rawToolName?: string
  }>,
) {
  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId: fixture.season.id,
        scheduledFor,
        status: 'published',
        weightConfigId: fixture.weightConfig.id,
        expectedCaseCount: fixture.caseRows.length,
        completedCaseCount: fixture.caseRows.length,
        failedCaseCount: 0,
        qcStatus: 'passed',
      })
      .returning(),
  )

  // Create case results for all cases
  const caseResults = []
  for (const c of fixture.caseRows) {
    const cr = first(
      await db
        .insert(benchmarkCaseResults)
        .values({
          runId: run.id,
          seasonId: fixture.season.id,
          caseId: c.id,
          status: 'completed',
          requestedModelId: 'test-model',
          returnedModelId: 'test-model',
          provider: 'test',
          parserVersion: 'strict-v1',
        })
        .returning(),
    )
    caseResults.push(cr)
  }

  // Insert decisions
  for (const d of decisions) {
    const cr = caseResults[d.caseIndex]!
    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: cr.id,
      categoryId: d.categoryId,
      decisionType: d.decisionType,
      toolId: d.decisionType === 'tool' ? d.toolId : null,
      rawToolName: d.rawToolName ?? null,
      resolutionStatus: 'resolved',
    })
  }

  return { run, caseResults }
}

describe('computeCategoryRanking', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('returns empty results when no published runs exist', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.items).toHaveLength(0)
    expect(result.totalEligibleDecisions).toBe(0)
    expect(result.meetsPublicationThreshold).toBe(false)
  })

  it('ranks tools by weighted support rate', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // Create decisions: Clerk gets 6 votes, Supabase gets 3 votes in auth category
    // 9 cases = 3 prompts x 3 models
    const decisions = fixture.caseRows.flatMap((_, i) => [
      {
        caseIndex: i,
        categoryId: fixture.authCat.id,
        decisionType: 'tool' as const,
        toolId: i < 6 ? fixture.clerk.id : fixture.supabase.id,
        rawToolName: i < 6 ? 'Clerk' : 'Supabase',
      },
    ])

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.items).toHaveLength(2)
    expect(result.items[0]!.toolSlug).toBe('clerk')
    expect(result.items[0]!.rawSupportCount).toBe(6)
    expect(result.items[1]!.toolSlug).toBe('supabase')
    expect(result.items[1]!.rawSupportCount).toBe(3)
    expect(result.totalEligibleDecisions).toBe(9)
  })

  it('produces identical weighted and raw rates with uniform weights', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.items).toHaveLength(1)
    const item = result.items[0]!
    expect(item.weightedSupportRate).toBeCloseTo(item.rawSupportRate, 10)
  })

  it('produces different weighted and raw rates with non-uniform weights', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // Create a non-uniform weight config
    const nonUniformConfig = first(
      await db
        .insert(benchmarkModelWeightConfigs)
        .values({
          slug: 'weighted-v1',
          name: 'Weighted',
          frontierWeight: 2.0,
          midWeight: 1.0,
          smallWeight: 0.5,
          isActive: false,
        })
        .returning(),
    )

    // Create a published run with the non-uniform weight config
    const run = first(
      await db
        .insert(benchmarkRuns)
        .values({
          seasonId: fixture.season.id,
          scheduledFor: '2026-03-10',
          status: 'published',
          weightConfigId: nonUniformConfig.id,
          expectedCaseCount: fixture.caseRows.length,
          completedCaseCount: fixture.caseRows.length,
        })
        .returning(),
    )

    // Frontier model picks Clerk, mid picks Supabase, small picks Supabase
    // Cases are ordered: prompt0-model0, prompt0-model1, prompt0-model2, ...
    // Model snapshots: [0]=frontier, [1]=mid, [2]=small
    for (let i = 0; i < fixture.caseRows.length; i++) {
      const c = fixture.caseRows[i]!
      const cr = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            runId: run.id,
            seasonId: fixture.season.id,
            caseId: c.id,
            status: 'completed',
            requestedModelId: 'test',
            returnedModelId: 'test',
            provider: 'test',
            parserVersion: 'strict-v1',
          })
          .returning(),
      )

      const modelIndex = i % 3 // 0=frontier, 1=mid, 2=small
      const isFrontier = modelIndex === 0
      await db.insert(benchmarkCaseDecisions).values({
        caseResultId: cr.id,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: isFrontier ? fixture.clerk.id : fixture.supabase.id,
        rawToolName: isFrontier ? 'Clerk' : 'Supabase',
        resolutionStatus: 'resolved',
      })
    }

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    // Clerk: 3 frontier decisions (weight 2.0 each = 6.0)
    // Supabase: 3 mid (weight 1.0 each = 3.0) + 3 small (weight 0.5 each = 1.5) = 4.5
    // Total weighted eligible = 6.0 + 3.0 + 1.5 = 10.5
    // Clerk weighted rate = 6.0 / 10.5 ≈ 0.571
    // Clerk raw rate = 3/9 ≈ 0.333
    expect(result.items).toHaveLength(2)
    const clerkItem = result.items.find((i) => i.toolSlug === 'clerk')!
    expect(clerkItem.weightedSupportRate).not.toBeCloseTo(clerkItem.rawSupportRate, 1)
    expect(clerkItem.weightedSupportRate).toBeCloseTo(6.0 / 10.5, 2)
    expect(clerkItem.rawSupportRate).toBeCloseTo(3 / 9, 2)
  })

  it('filters by prompt tier', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // All 9 cases get Clerk
    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    // Filter to advanced only (1 prompt x 3 models = 3 decisions)
    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
      promptTier: 'advanced',
    })

    expect(result.totalEligibleDecisions).toBe(3)
  })

  it('filters by model tier', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    // Filter to frontier only (3 prompts x 1 model = 3 decisions)
    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
      modelTier: 'frontier',
    })

    expect(result.totalEligibleDecisions).toBe(3)
    expect(result.totalDistinctModels).toBe(1)
  })

  it('includes none decisions in eligible count but not support', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // 6 cases pick Clerk, 3 cases pick none
    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: (i < 6 ? 'tool' : 'none') as 'tool' | 'none',
      toolId: i < 6 ? fixture.clerk.id : undefined,
      rawToolName: i < 6 ? 'Clerk' : undefined,
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.totalEligibleDecisions).toBe(9)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.rawSupportCount).toBe(6)
    expect(result.items[0]!.rawEligibleCount).toBe(9)
    expect(result.items[0]!.rawSupportRate).toBeCloseTo(6 / 9, 5)
  })

  it('computes Wilson CI', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: i < 5 ? fixture.clerk.id : fixture.supabase.id,
      rawToolName: i < 5 ? 'Clerk' : 'Supabase',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    const item = result.items[0]!
    expect(item.ciLow).toBeGreaterThan(0)
    expect(item.ciLow).toBeLessThan(item.rawSupportRate)
    expect(item.ciHigh).toBeGreaterThan(item.rawSupportRate)
    expect(item.ciHigh).toBeLessThanOrEqual(1)
  })

  it('computes model and prompt coverage', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // Clerk picked by frontier model only (cases 0, 3, 6), Supabase by rest
    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: i % 3 === 0 ? fixture.clerk.id : fixture.supabase.id,
      rawToolName: i % 3 === 0 ? 'Clerk' : 'Supabase',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    const clerkItem = result.items.find((i) => i.toolSlug === 'clerk')!
    // Clerk: picked by 1 model out of 3
    expect(clerkItem.modelCoverage).toBeCloseTo(1 / 3, 5)
    // Clerk: picked across all 3 prompts (one per prompt via frontier model)
    expect(clerkItem.promptCoverage).toBeCloseTo(1, 5)
  })

  it('computes trend between windows', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const scheduledForDates = [
      '2026-02-25',
      '2026-02-26',
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]

    for (const [index, scheduledFor] of scheduledForDates.entries()) {
      const decisions = fixture.caseRows.map((_, i) => ({
        caseIndex: i,
        categoryId: fixture.authCat.id,
        decisionType: 'tool' as const,
        toolId: index < 7 || i < 3 ? fixture.clerk.id : fixture.supabase.id,
        rawToolName: index < 7 || i < 3 ? 'Clerk' : 'Supabase',
      }))

      await seedPublishedRun(db, fixture, scheduledFor, decisions)
    }

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_7d',
      anchorDate: '2026-03-10',
    })

    // Current window: latest 7 published runs, with Clerk only in 3/9 decisions per run.
    // Previous window: preceding 7 published runs, with Clerk in all 9/9 decisions per run.
    // Clerk trend = 3/9 - 9/9 = -0.667
    const clerkItem = result.items.find((i) => i.toolSlug === 'clerk')!
    expect(clerkItem.trend).toBeLessThan(0)
  })

  it('marks below publication threshold', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
    }))
    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    // Only 9 eligible decisions (< 100 threshold)
    expect(result.meetsPublicationThreshold).toBe(false)
  })

  it('uses the last seven published runs instead of a seven day calendar span', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)
    const scheduledForDates = [
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
      '2026-02-05',
      '2026-02-12',
      '2026-02-19',
    ]

    for (const scheduledFor of scheduledForDates) {
      const decisions = fixture.caseRows.map((_, i) => ({
        caseIndex: i,
        categoryId: fixture.authCat.id,
        decisionType: 'tool' as const,
        toolId: fixture.clerk.id,
        rawToolName: 'Clerk',
      }))

      await seedPublishedRun(db, fixture, scheduledFor, decisions)
    }

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_7d',
      anchorDate: '2026-02-19',
    })

    expect(result.totalEligibleDecisions).toBe(63)
  })

  it('returns neutral trend when no previous published window exists', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.items[0]?.trend).toBe(0)
  })

  it('returns neutral trend when the previous filtered window has no eligible decisions', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    await seedPublishedRun(db, fixture, '2026-03-09', [
      {
        caseIndex: 1,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.supabase.id,
        rawToolName: 'Supabase',
      },
      {
        caseIndex: 2,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.supabase.id,
        rawToolName: 'Supabase',
      },
    ])

    await seedPublishedRun(db, fixture, '2026-03-10', [
      {
        caseIndex: 0,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.clerk.id,
        rawToolName: 'Clerk',
      },
      {
        caseIndex: 3,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.clerk.id,
        rawToolName: 'Clerk',
      },
      {
        caseIndex: 6,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.clerk.id,
        rawToolName: 'Clerk',
      },
    ])

    const result = await computeCategoryRanking(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      windowType: 'run_day',
      anchorDate: '2026-03-10',
      modelTier: 'frontier',
    })

    expect(result.items[0]?.trend).toBe(0)
  })
})

describe('computeHeadToHead', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('counts wins correctly', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // 5 Clerk, 3 Supabase, 1 none
    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: (i < 5 ? 'tool' : i < 8 ? 'tool' : 'none') as 'tool' | 'none',
      toolId: i < 5 ? fixture.clerk.id : i < 8 ? fixture.supabase.id : undefined,
      rawToolName: i < 5 ? 'Clerk' : i < 8 ? 'Supabase' : undefined,
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.supabase.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.aWins).toBe(5)
    expect(result.bWins).toBe(3)
    expect(result.abstains).toBe(1)
    expect(result.decisiveCaseCount).toBe(8)
    expect(result.aWinRate).toBeCloseTo(5 / 8, 5)
    expect(result.bWinRate).toBeCloseTo(3 / 8, 5)
  })

  it('returns per-model and per-prompt breakdowns', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    await seedPublishedRun(db, fixture, '2026-03-10', [
      {
        caseIndex: 0,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.clerk.id,
        rawToolName: 'Clerk',
      },
      {
        caseIndex: 1,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.supabase.id,
        rawToolName: 'Supabase',
      },
      {
        caseIndex: 3,
        categoryId: fixture.authCat.id,
        decisionType: 'tool',
        toolId: fixture.clerk.id,
        rawToolName: 'Clerk',
      },
      {
        caseIndex: 4,
        categoryId: fixture.authCat.id,
        decisionType: 'none',
      },
    ])

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.supabase.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    const frontierModel = result.modelBreakdown.find(
      (row) => row.label === fixture.modelSnapshots[0]?.name,
    )
    const midModel = result.modelBreakdown.find(
      (row) => row.label === fixture.modelSnapshots[1]?.name,
    )
    const promptOne = result.promptBreakdown.find(
      (row) => row.label === fixture.promptVersions[0]?.slug,
    )
    const promptTwo = result.promptBreakdown.find(
      (row) => row.label === fixture.promptVersions[1]?.slug,
    )

    expect(frontierModel?.aWins).toBe(2)
    expect(frontierModel?.decisiveCaseCount).toBe(2)
    expect(midModel?.bWins).toBe(1)
    expect(midModel?.abstains).toBe(1)
    expect(promptOne?.aWins).toBe(1)
    expect(promptOne?.bWins).toBe(1)
    expect(promptTwo?.aWins).toBe(1)
    expect(promptTwo?.abstains).toBe(1)
  })

  it('marks below threshold when fewer than 30 decisive cases', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: fixture.clerk.id,
      rawToolName: 'Clerk',
    }))
    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.supabase.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    // Only 9 decisive cases at most
    expect(result.meetsPublicationThreshold).toBe(false)
  })

  it('counts other tool selections separately', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    // 3 Clerk, 3 Supabase, 3 Drizzle (other)
    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: i < 3 ? fixture.clerk.id : i < 6 ? fixture.supabase.id : fixture.drizzleTool.id,
      rawToolName: i < 3 ? 'Clerk' : i < 6 ? 'Supabase' : 'Drizzle',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.supabase.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.aWins).toBe(3)
    expect(result.bWins).toBe(3)
    expect(result.otherToolCount).toBe(3)
    expect(result.decisiveCaseCount).toBe(6)
  })

  it('returns empty result when no published runs', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.supabase.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.aWins).toBe(0)
    expect(result.bWins).toBe(0)
    expect(result.decisiveCaseCount).toBe(0)
    expect(result.meetsPublicationThreshold).toBe(false)
  })

  it('computes Wilson CI on head-to-head', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const decisions = fixture.caseRows.map((_, i) => ({
      caseIndex: i,
      categoryId: fixture.authCat.id,
      decisionType: 'tool' as const,
      toolId: i < 7 ? fixture.clerk.id : fixture.supabase.id,
      rawToolName: i < 7 ? 'Clerk' : 'Supabase',
    }))

    await seedPublishedRun(db, fixture, '2026-03-10', decisions)

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.supabase.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.ciLow).toBeGreaterThan(0)
    expect(result.ciLow).toBeLessThan(result.aWinRate)
    expect(result.ciHigh).toBeGreaterThan(result.aWinRate)
    expect(result.ciHigh).toBeLessThanOrEqual(1)
  })

  it('returns an empty result for identical tools', async () => {
    const db = getTestDb()
    const fixture = await seedScoringFixture(db)

    const result = await computeHeadToHead(db, {
      categoryId: fixture.authCat.id,
      seasonId: fixture.season.id,
      toolAId: fixture.clerk.id,
      toolBId: fixture.clerk.id,
      windowType: 'trailing_28d',
      anchorDate: '2026-03-10',
    })

    expect(result.aWins).toBe(0)
    expect(result.bWins).toBe(0)
    expect(result.decisiveCaseCount).toBe(0)
    expect(result.meetsPublicationThreshold).toBe(false)
  })
})
