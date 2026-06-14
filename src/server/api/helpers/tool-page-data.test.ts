import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { getToolBenchmarkPageData } from './tool-page-data'

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

describe('getToolBenchmarkPageData', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('preserves weighted head-to-head totals for non-uniform model weights', async () => {
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

    const data = await getToolBenchmarkPageData(
      db,
      {
        ...targetTool,
        toolCategories: [
          {
            category: {
              ...category,
              categoryGroup: { slug: group.slug },
            },
          },
        ],
      },
      { anchorDate: '2026-03-10' },
    )

    const matchup = first(data.matchups)
    expect(matchup.result.aWins).toBe(1)
    expect(matchup.result.bWins).toBe(2)
    expect(matchup.result.weightedAWins).toBeCloseTo(2)
    expect(matchup.result.weightedBWins).toBeCloseTo(1.5)
    expect(matchup.result.weightedAWinRate).toBeCloseTo(2 / 3.5)
  })
})
