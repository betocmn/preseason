import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureCanonicalToolReconciliation } from '~/server/db/catalog-reconciliation'
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
  comments,
  criticProfiles,
  llms,
  matchBatches,
  matchConfigs,
  matchPromptTemplates,
  prompts,
  subcategories,
  toolAliases,
  toolCandidates,
  toolCategories,
  tools,
  userProfiles,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) {
    throw new Error('Expected at least one row')
  }

  return row
}

describe('ensureCanonicalToolReconciliation', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('merges vercel-ci into vercel and remains idempotent', async () => {
    const db = getTestDb()

    const categoryGroup = first(
      await db
        .insert(categories)
        .values({
          name: 'Devtools',
          slug: 'devtools',
          displayOrder: 1,
        })
        .returning(),
    )
    const hostingCategory = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: categoryGroup.id,
          name: 'Hosting',
          slug: 'hosting',
          displayOrder: 1,
        })
        .returning(),
    )
    const cicdCategory = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: categoryGroup.id,
          name: 'CI/CD',
          slug: 'ci-cd',
          displayOrder: 2,
        })
        .returning(),
    )

    const targetTool = first(
      await db
        .insert(tools)
        .values({
          name: 'Vercel',
          slug: 'vercel',
        })
        .returning(),
    )
    const sourceTool = first(
      await db
        .insert(tools)
        .values({
          name: 'Vercel CI',
          slug: 'vercel-ci',
        })
        .returning(),
    )

    await db.insert(toolCategories).values([
      { toolId: targetTool.id, categoryId: hostingCategory.id, isPrimary: true },
      { toolId: targetTool.id, categoryId: cicdCategory.id, isPrimary: false },
      { toolId: sourceTool.id, categoryId: cicdCategory.id, isPrimary: true },
    ])

    await db.insert(toolAliases).values({
      toolId: sourceTool.id,
      alias: 'Vercel Deploy Hooks',
      normalizedAlias: 'vercel deploy hooks',
      source: 'test',
    })

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
    const prompt = first(
      await db
        .insert(prompts)
        .values({
          title: 'Deploy a site',
          slug: 'deploy-a-site',
          level: 'beginner',
          contentMd: 'Deploy a site to production.',
          expectedCategories: ['hosting'],
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
          contentMd: prompt.contentMd ?? 'Deploy a site to production.',
          contentHash: createHash('sha256').update(prompt.id).digest('hex'),
          promptContractVersion: '1.0',
          isActive: true,
        })
        .returning(),
    )

    await db.insert(benchmarkPromptVersionCategories).values({
      promptVersionId: promptVersion.id,
      categoryId: hostingCategory.id,
      displayOrder: 0,
    })
    await db.insert(benchmarkSeasonPrompts).values({
      seasonId: season.id,
      promptVersionId: promptVersion.id,
    })

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
          snapshotKey: 'vercel-reconciliation-test',
        })
        .returning(),
    )

    await db.insert(benchmarkSeasonModels).values({
      seasonId: season.id,
      modelSnapshotId: modelSnapshot.id,
    })

    const benchmarkCase = first(
      await db
        .insert(benchmarkCases)
        .values({
          seasonId: season.id,
          promptVersionId: promptVersion.id,
          modelSnapshotId: modelSnapshot.id,
          isActive: true,
        })
        .returning(),
    )
    const run = first(
      await db
        .insert(benchmarkRuns)
        .values({
          seasonId: season.id,
          scheduledFor: '2026-03-27',
          trigger: 'manual',
          status: 'completed',
        })
        .returning(),
    )
    const result = first(
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
      caseResultId: result.id,
      categoryId: hostingCategory.id,
      decisionType: 'tool',
      toolId: sourceTool.id,
      rawToolName: 'Vercel CI',
      resolutionStatus: 'resolved',
    })

    await db.insert(toolCandidates).values({
      rawName: 'Vercel CI',
      normalizedName: 'vercel ci candidate',
      approvedToolId: sourceTool.id,
      aiSuggestedToolId: sourceTool.id,
      status: 'approved',
    })

    const criticUser = first(
      await db
        .insert(userProfiles)
        .values({
          id: '00000000-0000-4000-8000-000000000001',
          email: 'critic@example.com',
          displayName: 'Critic',
          role: 'critic',
        })
        .returning(),
    )
    const criticProfile = first(
      await db
        .insert(criticProfiles)
        .values({
          slug: 'critic',
          userId: criticUser.id,
        })
        .returning(),
    )

    await db.insert(comments).values({
      criticId: criticProfile.id,
      targetType: 'tool',
      targetId: sourceTool.id,
      content: 'Reliable deploys',
    })

    await ensureCanonicalToolReconciliation(db.$client)
    await ensureCanonicalToolReconciliation(db.$client)

    const sourceToolAfter = await db.query.tools.findFirst({
      where: eq(tools.slug, 'vercel-ci'),
    })
    expect(sourceToolAfter).toBeUndefined()

    const reconciledTool = await db.query.tools.findFirst({
      where: eq(tools.slug, 'vercel'),
      with: {
        toolCategories: true,
        toolAliases: true,
      },
    })
    expect(reconciledTool?.toolCategories).toHaveLength(2)
    expect(reconciledTool?.toolAliases.map((alias) => alias.normalizedAlias).sort()).toEqual([
      'vercel ci',
      'vercel deploy hooks',
    ])

    const decision = await db.query.benchmarkCaseDecisions.findFirst({
      where: eq(benchmarkCaseDecisions.caseResultId, result.id),
    })
    expect(decision?.toolId).toBe(targetTool.id)

    const candidate = await db.query.toolCandidates.findFirst({
      where: eq(toolCandidates.normalizedName, 'vercel ci candidate'),
    })
    expect(candidate?.approvedToolId).toBe(targetTool.id)
    expect(candidate?.aiSuggestedToolId).toBe(targetTool.id)

    const comment = await db.query.comments.findFirst({
      where: eq(comments.content, 'Reliable deploys'),
    })
    expect(comment?.targetId).toBe(targetTool.id)
  })

  it('defers reconciliation when legacy match configs or batches still reference the source tool', async () => {
    const db = getTestDb()

    const categoryGroup = first(
      await db
        .insert(categories)
        .values({
          name: 'Devtools',
          slug: 'devtools',
          displayOrder: 1,
        })
        .returning(),
    )
    const cicdCategory = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: categoryGroup.id,
          name: 'CI/CD',
          slug: 'ci-cd',
          displayOrder: 1,
        })
        .returning(),
    )

    const targetTool = first(
      await db
        .insert(tools)
        .values({
          id: '00000000-0000-4000-8000-000000000010',
          name: 'Vercel',
          slug: 'vercel',
        })
        .returning(),
    )
    const sourceTool = first(
      await db
        .insert(tools)
        .values({
          id: '00000000-0000-4000-8000-000000000020',
          name: 'Vercel CI',
          slug: 'vercel-ci',
        })
        .returning(),
    )
    const otherTool = first(
      await db
        .insert(tools)
        .values({
          id: '00000000-0000-4000-8000-000000000030',
          name: 'CircleCI',
          slug: 'circleci',
        })
        .returning(),
    )

    const owner = first(
      await db
        .insert(userProfiles)
        .values({
          id: '00000000-0000-4000-8000-000000000040',
          email: 'owner@example.com',
          displayName: 'Owner',
          role: 'admin',
        })
        .returning(),
    )

    const protocol = first(
      await db
        .insert(benchmarkProtocols)
        .values({
          slug: 'benchmark-match-v1',
          name: 'Benchmark Match V1',
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
          slug: 'match-season-1',
          name: 'Match Season 1',
          status: 'active',
        })
        .returning(),
    )

    const promptTemplate = first(
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

    const [config] = await db
      .insert(matchConfigs)
      .values({
        seasonId: season.id,
        categoryId: cicdCategory.id,
        toolAId: sourceTool.id,
        toolBId: otherTool.id,
        promptTemplateId: promptTemplate.id,
        createdBy: owner.id,
      })
      .returning()
    if (!config) {
      throw new Error('Expected match config to be created')
    }

    const [batch] = await db
      .insert(matchBatches)
      .values({
        seasonId: season.id,
        configId: config.id,
        categoryId: cicdCategory.id,
        toolAId: sourceTool.id,
        toolBId: otherTool.id,
        promptTemplateId: promptTemplate.id,
        triggerMode: 'manual',
      })
      .returning()
    if (!batch) {
      throw new Error('Expected match batch to be created')
    }

    await expect(ensureCanonicalToolReconciliation(db.$client)).resolves.toBeUndefined()

    const sourceToolAfter = await db.query.tools.findFirst({
      where: eq(tools.id, sourceTool.id),
    })
    const targetToolAfter = await db.query.tools.findFirst({
      where: eq(tools.id, targetTool.id),
    })
    const configAfter = await db.query.matchConfigs.findFirst({
      where: eq(matchConfigs.id, config.id),
    })
    const batchAfter = await db.query.matchBatches.findFirst({
      where: eq(matchBatches.id, batch.id),
    })

    expect(sourceToolAfter?.slug).toBe('vercel-ci')
    expect(targetToolAfter?.slug).toBe('vercel')
    expect(configAfter?.toolAId).toBe(sourceTool.id)
    expect(batchAfter?.toolAId).toBe(sourceTool.id)
  })
})
