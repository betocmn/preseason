import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanBenchmarkData } from '~/server/db/benchmark-cleanup'
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
  matchBatches,
  matchConfigs,
  matchEvaluations,
  matchPromptTemplates,
  prompts,
  subcategories,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { seedUser } from '~/test/trpc'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) {
    throw new Error('Expected at least one row')
  }

  return row
}

describe('cleanBenchmarkData', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('removes benchmark rows even when match records reference the season', async () => {
    const db = getTestDb()
    const { profile: admin } = await seedUser({ role: 'admin' })

    const categoryGroup = first(
      await db
        .insert(categories)
        .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
        .returning(),
    )
    const category = first(
      await db
        .insert(subcategories)
        .values({ categoryId: categoryGroup.id, name: 'Auth', slug: 'auth' })
        .returning(),
    )

    const toolA = first(
      await db
        .insert(tools)
        .values({
          id: 'a0000000-0000-4000-8000-000000000001',
          name: 'Clerk',
          slug: 'clerk',
        })
        .returning(),
    )
    const toolB = first(
      await db
        .insert(tools)
        .values({
          id: 'b0000000-0000-4000-8000-000000000002',
          name: 'Auth0',
          slug: 'auth0',
        })
        .returning(),
    )

    await db.insert(toolCategories).values([
      { toolId: toolA.id, categoryId: category.id },
      { toolId: toolB.id, categoryId: category.id },
    ])

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
          modelId: 'openai/gpt-4o',
        })
        .returning(),
    )
    const prompt = first(
      await db
        .insert(prompts)
        .values({
          title: 'Auth Prompt',
          slug: 'auth-prompt',
          level: 'beginner',
          contentMd: 'Build an auth flow.',
          expectedCategories: ['auth'],
        })
        .returning(),
    )
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
    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-v1',
          name: 'Benchmark V1',
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
          slug: 'season-1',
          name: 'Season 1',
          status: 'active',
        })
        .returning(),
    )
    const promptVersion = first(
      await db
        .insert(benchmarkPromptVersions)
        .values({
          promptId: prompt.id,
          slug: prompt.slug,
          level: prompt.level,
          version: 1,
          contentMd: prompt.contentMd ?? 'Build an auth flow.',
          contentHash: createHash('sha256').update(prompt.id).digest('hex'),
          promptContractVersion: '1.0',
          isActive: true,
        })
        .returning(),
    )

    await db.insert(benchmarkPromptVersionCategories).values({
      promptVersionId: promptVersion.id,
      categoryId: category.id,
      displayOrder: 0,
    })

    const snapshot = first(
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
          snapshotKey: 'gpt-4o::cleanup-test',
        })
        .returning(),
    )
    const weightConfig = first(
      await db
        .insert(benchmarkModelWeightConfigs)
        .values({
          slug: 'uniform',
          name: 'Uniform',
          frontierWeight: 1,
          midWeight: 1,
          smallWeight: 1,
          isActive: true,
        })
        .returning(),
    )

    await db.insert(benchmarkSeasonPrompts).values({
      seasonId: season.id,
      promptVersionId: promptVersion.id,
    })
    await db.insert(benchmarkSeasonModels).values({
      seasonId: season.id,
      modelSnapshotId: snapshot.id,
    })

    const benchmarkCase = first(
      await db
        .insert(benchmarkCases)
        .values({
          seasonId: season.id,
          promptVersionId: promptVersion.id,
          modelSnapshotId: snapshot.id,
        })
        .returning(),
    )
    const run = first(
      await db
        .insert(benchmarkRuns)
        .values({
          seasonId: season.id,
          scheduledFor: '2026-01-01',
          status: 'published',
          weightConfigId: weightConfig.id,
        })
        .returning(),
    )
    const caseResult = first(
      await db
        .insert(benchmarkCaseResults)
        .values({
          seasonId: season.id,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: 'completed',
        })
        .returning(),
    )

    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: caseResult.id,
      categoryId: category.id,
      decisionType: 'tool',
      toolId: toolA.id,
      rawToolName: toolA.name,
      resolutionStatus: 'resolved',
    })

    const config = first(
      await db
        .insert(matchConfigs)
        .values({
          seasonId: season.id,
          categoryId: category.id,
          toolAId: toolA.id,
          toolBId: toolB.id,
          promptTemplateId: template.id,
          createdBy: admin.id,
        })
        .returning(),
    )
    const batch = first(
      await db
        .insert(matchBatches)
        .values({
          seasonId: season.id,
          configId: config.id,
          categoryId: category.id,
          toolAId: toolA.id,
          toolBId: toolB.id,
          promptTemplateId: template.id,
          triggerMode: 'manual',
          totalEvaluations: 1,
          triggeredBy: admin.id,
        })
        .returning(),
    )

    await db.insert(matchEvaluations).values({
      batchId: batch.id,
      seasonId: season.id,
      modelSnapshotId: snapshot.id,
      presentationOrder: 'a_first',
    })

    await expect(cleanBenchmarkData(db)).resolves.toBeUndefined()

    expect(await db.query.matchEvaluations.findMany()).toHaveLength(0)
    expect(await db.query.matchBatches.findMany()).toHaveLength(0)
    expect(await db.query.matchConfigs.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkCaseDecisions.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkCaseResults.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkRuns.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkCases.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkSeasonModels.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkSeasonPrompts.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkPromptVersionCategories.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkPromptVersions.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkModelSnapshots.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkSeasons.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkProtocols.findMany()).toHaveLength(0)
    expect(await db.query.benchmarkModelWeightConfigs.findMany()).toHaveLength(0)

    expect(await db.query.matchPromptTemplates.findMany()).toHaveLength(1)
    expect(await db.query.prompts.findMany()).toHaveLength(1)
    expect(await db.query.llms.findMany()).toHaveLength(1)
    expect(await db.query.tools.findMany()).toHaveLength(2)
  })
})
