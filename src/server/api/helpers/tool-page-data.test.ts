import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkModelWeightConfigs,
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
  toolCategories,
  tools,
} from '~/server/db/schema'
import { invalidatePublicBenchmarkCache } from '~/server/llm/benchmark/public-cache'
import { computeHeadToHead } from '~/server/llm/benchmark/scoring'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { getToolBenchmarkPageData } from './tool-page-data'

const applicationDb = vi.hoisted(() => ({ current: undefined as unknown }))
const cache = vi.hoisted(() => new Map<string, unknown>())
vi.mock('~/server/db', () => ({
  get db() {
    return applicationDb.current
  },
}))
vi.mock('next/cache', () => ({
  unstable_cache: (read: () => Promise<unknown>, keys: string[]) => async () => {
    const key = JSON.stringify(keys)
    if (!cache.has(key)) cache.set(key, await read())
    return cache.get(key)
  },
  revalidateTag: () => cache.clear(),
}))

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

function at<T>(rows: T[], index: number): T {
  const row = rows[index]
  if (row === undefined) throw new Error(`Expected an item at index ${index}`)
  return row
}

async function seedToolPageFixture() {
  const db = getTestDb()
  const group = first(
    await db.insert(categories).values({ name: 'Devtools', slug: 'devtools' }).returning(),
  )
  const category = first(
    await db
      .insert(subcategories)
      .values({ categoryId: group.id, name: 'Auth', slug: 'auth' })
      .returning(),
  )
  const [targetTool, rivalTool] = await db
    .insert(tools)
    .values([
      { name: 'Clerk', slug: 'clerk' },
      { name: 'Supabase', slug: 'supabase' },
    ])
    .returning()

  if (!targetTool || !rivalTool) throw new Error('Expected seeded tools')

  await db.insert(toolCategories).values([
    { toolId: targetTool.id, categoryId: category.id },
    { toolId: rivalTool.id, categoryId: category.id },
  ])

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
      .values({
        slug: 'weighted-v1',
        name: 'Weighted',
        frontierWeight: 2,
        midWeight: 1,
        smallWeight: 0.5,
      })
      .returning(),
  )
  const prompt = first(
    await db
      .insert(prompts)
      .values({
        title: 'Auth prompt',
        slug: 'auth-prompt',
        level: 'beginner',
        contentMd: '# Auth prompt',
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
        contentMd: '# Auth prompt',
        contentHash: 'auth-prompt-hash',
        promptContractVersion: '1.0',
        systemPromptSnapshot: 'You are a pragmatic assistant.',
      })
      .returning(),
  )
  await db
    .insert(benchmarkSeasonPrompts)
    .values({ seasonId: season.id, promptVersionId: promptVersion.id })

  const llmRows = await db
    .insert(llms)
    .values([
      {
        name: 'Frontier Model',
        slug: 'frontier-model',
        provider: 'test',
        company: 'Test',
        modelFamily: 'Frontier',
        modelVersion: '1',
        modelId: 'test/frontier',
      },
      {
        name: 'Mid Model',
        slug: 'mid-model',
        provider: 'test',
        company: 'Test',
        modelFamily: 'Mid',
        modelVersion: '1',
        modelId: 'test/mid',
      },
      {
        name: 'Small Model',
        slug: 'small-model',
        provider: 'test',
        company: 'Test',
        modelFamily: 'Small',
        modelVersion: '1',
        modelId: 'test/small',
      },
    ])
    .returning()

  const tiers: Array<'frontier' | 'mid' | 'small'> = ['frontier', 'mid', 'small']
  const modelSnapshots = []
  for (const [index, llm] of llmRows.entries()) {
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
          tier: at(tiers, index),
          requestedModelId: llm.modelId,
          snapshotKey: `${llm.modelId}:tool-page-data`,
        })
        .returning(),
    )
    await db
      .insert(benchmarkSeasonModels)
      .values({ seasonId: season.id, modelSnapshotId: modelSnapshot.id })
    modelSnapshots.push(modelSnapshot)
  }

  const cases = []
  for (const modelSnapshot of modelSnapshots) {
    cases.push(
      first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: promptVersion.id,
            modelSnapshotId: modelSnapshot.id,
          })
          .returning(),
      ),
    )
  }

  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        status: 'published',
        weightConfigId: weightConfig.id,
        expectedCaseCount: cases.length,
        completedCaseCount: cases.length,
        failedCaseCount: 0,
        qcStatus: 'passed',
      })
      .returning(),
  )

  for (const [index, benchmarkCase] of cases.entries()) {
    const result = first(
      await db
        .insert(benchmarkCaseResults)
        .values({
          seasonId: season.id,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: 'completed',
          requestedModelId: 'test',
          returnedModelId: 'test',
          provider: 'test',
          parserVersion: 'strict-v1',
        })
        .returning(),
    )
    const isFrontier = index === 0
    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: result.id,
      categoryId: category.id,
      decisionType: 'tool',
      toolId: isFrontier ? targetTool.id : rivalTool.id,
      rawToolName: isFrontier ? targetTool.name : rivalTool.name,
      resolutionStatus: 'resolved',
    })
  }
  const pageTool = {
    ...targetTool,
    toolCategories: [{ category: { ...category, categoryGroup: { slug: group.slug } } }],
  }
  return { db, category, targetTool, rivalTool, cases, run, weightConfig, season, pageTool }
}

describe('getToolBenchmarkPageData', () => {
  beforeAll(async () => {
    applicationDb.current = await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
    cache.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('preserves weighted head-to-head totals for non-uniform model weights', async () => {
    const { db, pageTool } = await seedToolPageFixture()
    const data = await getToolBenchmarkPageData(db, pageTool, { anchorDate: '2026-03-10' })

    const matchup = first(data.matchups)
    expect(matchup.result.aWins).toBe(1)
    expect(matchup.result.bWins).toBe(2)
    expect(matchup.result.weightedAWins).toBeCloseTo(2)
    expect(matchup.result.weightedBWins).toBeCloseTo(1.5)
    expect(matchup.result.weightedAWinRate).toBeCloseTo(2 / 3.5)
  })

  it('shares category reads across concurrent tool pages and refreshes them on publication', async () => {
    const { db, category, targetTool, rivalTool, cases, pageTool } = await seedToolPageFixture()
    const otherCategory = first(
      await db
        .insert(subcategories)
        .values({ categoryId: category.categoryId, name: 'Database', slug: 'database' })
        .returning(),
    )
    const rivalPage = {
      ...pageTool,
      ...rivalTool,
      toolCategories: [...pageTool.toolCategories, { category: otherCategory }],
    }
    const options = { anchorDate: '2026-03-10' }
    const execute = vi.spyOn(db, 'execute')
    vi.stubEnv('NODE_ENV', 'production')

    const [target, rival] = await Promise.all([
      getToolBenchmarkPageData(db, pageTool, options),
      getToolBenchmarkPageData(db, rivalPage, options),
    ])
    expect(first(target.matchups).result.aWins).toBe(1)
    expect(first(rival.matchups).result.aWins).toBe(2)
    // One aggregate per distinct category, with no additional head-to-head scan.
    expect(execute).toHaveBeenCalledTimes(2)
    expect(await getToolBenchmarkPageData(db, pageTool, options)).toEqual(target)
    expect(execute).toHaveBeenCalledTimes(2)

    const result = await db.query.benchmarkCaseResults.findFirst({
      where: eq(benchmarkCaseResults.caseId, at(cases, 1).id),
    })
    if (!result) throw new Error('Expected a seeded result')
    await db
      .update(benchmarkCaseDecisions)
      .set({ toolId: targetTool.id, rawToolName: targetTool.name })
      .where(eq(benchmarkCaseDecisions.caseResultId, result.id))
    expect(await getToolBenchmarkPageData(db, pageTool, options)).toEqual(target)

    invalidatePublicBenchmarkCache()
    const refreshed = await getToolBenchmarkPageData(db, pageTool, options)
    expect(first(refreshed.matchups).result.aWins).toBe(2)
    expect(execute).toHaveBeenCalledTimes(3)

    await getToolBenchmarkPageData(db, pageTool, { anchorDate: '2026-03-11' })
    await getToolBenchmarkPageData(db, pageTool, { ...options, windowType: 'run_day' })
    expect(execute).toHaveBeenCalledTimes(5)
  })

  it('preserves abstentions, other tools and exclusions without a separate matchup query', async () => {
    const { db, category, targetTool, cases, season, weightConfig, pageTool } =
      await seedToolPageFixture()
    const otherTool = first(await db.insert(tools).values({ name: 'Zed', slug: 'zed' }).returning())
    const extraRuns = [
      {
        date: '2026-03-11',
        status: 'published' as const,
        decisions: [
          { decisionType: 'tool' as const, toolId: otherTool.id },
          { decisionType: 'none' as const },
          { decisionType: 'tool' as const, resolutionStatus: 'unresolved_tool' },
        ],
      },
      {
        date: '2026-03-12',
        status: 'published' as const,
        decisions: [
          { decisionType: 'tool' as const, toolId: targetTool.id, failed: true },
          { decisionType: 'invalid' as const },
          { decisionType: 'none' as const },
        ],
      },
      {
        date: '2026-03-13',
        status: 'qc_failed' as const,
        decisions: [{ decisionType: 'tool' as const, toolId: targetTool.id }],
      },
    ]
    for (const extra of extraRuns) {
      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({
            seasonId: season.id,
            scheduledFor: extra.date,
            status: extra.status,
            weightConfigId: weightConfig.id,
          })
          .returning(),
      )
      for (const [index, decision] of extra.decisions.entries()) {
        const result = first(
          await db
            .insert(benchmarkCaseResults)
            .values({
              seasonId: season.id,
              runId: run.id,
              caseId: at(cases, index).id,
              status: 'failed' in decision && decision.failed ? 'failed' : 'completed',
            })
            .returning(),
        )
        await db.insert(benchmarkCaseDecisions).values({
          caseResultId: result.id,
          categoryId: category.id,
          decisionType: decision.decisionType,
          toolId: 'toolId' in decision ? decision.toolId : null,
          resolutionStatus: 'resolutionStatus' in decision ? decision.resolutionStatus : 'resolved',
        })
      }
    }

    const options = { anchorDate: '2026-03-13', windowType: 'trailing_28d' as const }
    const data = await getToolBenchmarkPageData(db, pageTool, options)
    const ranking = first(data.rankings)
    expect(ranking.rank).toBe(1)
    expect(ranking.totalTools).toBe(3)
    expect(ranking.rawEligibleCount).toBe(6)
    const matchup = first(data.matchups)
    expect(matchup.toolB.id).toBe(otherTool.id)
    expect(matchup.result).toMatchObject({ aWins: 1, bWins: 1, abstains: 2, otherToolCount: 2 })
    const direct = await computeHeadToHead(db, {
      ...options,
      categoryId: category.id,
      toolAId: targetTool.id,
      toolBId: otherTool.id,
    })
    expect(matchup.result).toEqual({ ...direct, modelBreakdown: [], promptBreakdown: [] })

    expect(
      (await getToolBenchmarkPageData(db, pageTool, { ...options, matchupLimit: 0 })).matchups,
    ).toEqual([])
    expect(
      await getToolBenchmarkPageData(db, pageTool, { ...options, windowType: 'run_day' }),
    ).toEqual({ rankings: [], matchups: [] })
    expect(await getToolBenchmarkPageData(db, pageTool, { anchorDate: '2026-03-01' })).toEqual({
      rankings: [],
      matchups: [],
    })
    expect(await getToolBenchmarkPageData(db, { ...pageTool, toolCategories: [] })).toEqual({
      rankings: [],
      matchups: [],
    })
  })
})
