import { createHash } from 'node:crypto'
import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
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
import type { PromptLevel } from '~/server/llm/prompts'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (!row) throw new Error('Expected at least one row')
  return row
}

type HomepagePromptSeed = {
  title: string
  slug: string
  level: PromptLevel
  createdAt: Date
  resolutionStatus?: 'resolved' | 'unresolved_tool'
}

type SeededPromptVersion = HomepagePromptSeed & {
  id: string
}

type DisplayPromptVersion = Pick<SeededPromptVersion, 'id' | 'slug' | 'level'>

type HomepagePromptFixtureContext = {
  seasonId: string
  categoryId: string
  toolId: string
  modelSnapshotId: string
  primaryCaseId: string
  requestedModelId: string
  provider: string
  publishedRunIds: string[]
}

function getDailySlugKey(slug: string, anchorDate: string) {
  return createHash('md5').update(`${slug}${anchorDate}`).digest('hex')
}

function buildExpectedPromptDisplayOrder(
  promptVersions: SeededPromptVersion[],
  anchorDate: string,
  firstPageSize: number,
) {
  const ordered = [...promptVersions].sort((a, b) => {
    const keyComparison = getDailySlugKey(a.slug, anchorDate).localeCompare(
      getDailySlugKey(b.slug, anchorDate),
    )
    if (keyComparison !== 0) return keyComparison

    const createdAtComparison = b.createdAt.getTime() - a.createdAt.getTime()
    if (createdAtComparison !== 0) return createdAtComparison

    return b.id.localeCompare(a.id)
  })

  const seenSlugs = new Set<string>()
  const firstPage: DisplayPromptVersion[] = []
  const firstPageIds = new Set<string>()
  for (const promptVersion of ordered) {
    if (firstPage.length >= firstPageSize) break
    if (seenSlugs.has(promptVersion.slug)) continue

    seenSlugs.add(promptVersion.slug)
    const displayPrompt = {
      id: promptVersion.id,
      slug: promptVersion.slug,
      level: promptVersion.level,
    }
    firstPage.push(displayPrompt)
    firstPageIds.add(displayPrompt.id)
  }

  for (const promptVersion of ordered) {
    if (firstPage.length >= Math.min(firstPageSize, ordered.length)) break
    if (firstPageIds.has(promptVersion.id)) continue

    const displayPrompt = {
      id: promptVersion.id,
      slug: promptVersion.slug,
      level: promptVersion.level,
    }
    firstPage.push(displayPrompt)
    firstPageIds.add(displayPrompt.id)
  }

  const remaining = ordered
    .filter((promptVersion) => !firstPageIds.has(promptVersion.id))
    .map((promptVersion) => ({
      id: promptVersion.id,
      slug: promptVersion.slug,
      level: promptVersion.level,
    }))

  return { firstPage, remaining }
}

function findDifferentAnchorDate(promptVersions: SeededPromptVersion[], anchorDate: string) {
  const initialOrder = buildExpectedPromptDisplayOrder(promptVersions, anchorDate, 5)
    .firstPage.map((promptVersion) => promptVersion.id)
    .join(',')

  for (let dayOffset = 1; dayOffset <= 31; dayOffset++) {
    const nextDate = new Date(`${anchorDate}T00:00:00.000Z`)
    nextDate.setUTCDate(nextDate.getUTCDate() + dayOffset)
    const candidateAnchorDate = nextDate.toISOString().slice(0, 10)
    const candidateOrder = buildExpectedPromptDisplayOrder(promptVersions, candidateAnchorDate, 5)
      .firstPage.map((promptVersion) => promptVersion.id)
      .join(',')

    if (candidateOrder !== initialOrder) {
      return candidateAnchorDate
    }
  }

  throw new Error('Expected to find an anchorDate with a different prompt order')
}

function findAnchorDateWherePromptAppearsOnFirstPage(
  promptVersions: SeededPromptVersion[],
  slug: string,
  firstPageSize: number,
  anchorDate: string,
) {
  for (let dayOffset = 0; dayOffset <= 31; dayOffset++) {
    const nextDate = new Date(`${anchorDate}T00:00:00.000Z`)
    nextDate.setUTCDate(nextDate.getUTCDate() + dayOffset)
    const candidateAnchorDate = nextDate.toISOString().slice(0, 10)
    const firstPage = buildExpectedPromptDisplayOrder(
      promptVersions,
      candidateAnchorDate,
      firstPageSize,
    ).firstPage

    if (firstPage.some((promptVersion) => promptVersion.slug === slug)) {
      return candidateAnchorDate
    }
  }

  throw new Error(`Expected to find an anchorDate where ${slug} appears on the first page`)
}

function createUniquePromptSeeds(count: number): HomepagePromptSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Scenario ${index + 1}`,
    slug: `scenario-${index + 1}`,
    level: 'beginner' as const,
    createdAt: new Date(Date.UTC(2026, 2, index + 1)),
  }))
}

async function seedPromptTopToolFixture(entries: HomepagePromptSeed[]) {
  const db = getTestDb()
  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Homepage', slug: 'homepage', displayOrder: 1 })
      .returning(),
  )
  const category = first(
    await db
      .insert(subcategories)
      .values({ categoryId: group.id, name: 'Homepage Prompt', slug: 'homepage-prompt' })
      .returning(),
  )
  const tool = first(
    await db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning(),
  )
  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-homepage',
        name: 'Homepage Benchmark',
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
        slug: 'homepage-season',
        name: 'Homepage Season',
        status: 'active',
      })
      .returning(),
  )
  const llm = first(
    await db
      .insert(llms)
      .values({
        name: 'Fixture LLM',
        slug: 'fixture-llm',
        provider: 'openrouter',
        company: 'Fixture',
        modelFamily: 'fixture',
        modelVersion: '1',
        modelId: 'fixture/model',
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
        requestedModelId: llm.modelId,
        tier: 'mid',
        snapshotKey: `snapshot-${crypto.randomUUID()}`,
      })
      .returning(),
  )

  await db.insert(benchmarkSeasonModels).values({
    seasonId: season.id,
    modelSnapshotId: modelSnapshot.id,
  })

  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-20',
        status: 'published',
        qcStatus: 'passed',
      })
      .returning(),
  )

  const promptVersions: SeededPromptVersion[] = []
  let primaryCaseId: string | null = null
  for (const entry of entries) {
    const prompt = first(
      await db
        .insert(prompts)
        .values({
          title: entry.title,
          slug: entry.slug,
          level: entry.level,
          description: `${entry.title} description`,
          contentMd: `# ${entry.title} ${entry.level}`,
          isActive: true,
        })
        .returning(),
    )

    const promptVersion = first(
      await db
        .insert(benchmarkPromptVersions)
        .values({
          promptId: prompt.id,
          slug: entry.slug,
          level: entry.level,
          version: 1,
          contentMd: prompt.contentMd ?? `# ${entry.title}`,
          contentHash: createHash('sha256').update(`${entry.slug}:${entry.level}`).digest('hex'),
          promptContractVersion: '1.0',
          isActive: true,
          createdAt: entry.createdAt,
        })
        .returning(),
    )

    await db.insert(benchmarkSeasonPrompts).values({
      seasonId: season.id,
      promptVersionId: promptVersion.id,
    })

    const benchmarkCase = first(
      await db
        .insert(benchmarkCases)
        .values({
          seasonId: season.id,
          promptVersionId: promptVersion.id,
          modelSnapshotId: modelSnapshot.id,
        })
        .returning(),
    )
    primaryCaseId ??= benchmarkCase.id

    const caseResult = first(
      await db
        .insert(benchmarkCaseResults)
        .values({
          seasonId: season.id,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: 'completed',
          requestedModelId: llm.modelId,
          returnedModelId: llm.modelId,
          provider: llm.provider,
          parserVersion: 'strict-v1',
        })
        .returning(),
    )

    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: caseResult.id,
      categoryId: category.id,
      decisionType: 'tool',
      toolId: entry.resolutionStatus === 'unresolved_tool' ? null : tool.id,
      rawToolName: entry.resolutionStatus === 'unresolved_tool' ? `${entry.title} Tool` : null,
      resolutionStatus: entry.resolutionStatus ?? 'resolved',
    })

    promptVersions.push({
      id: promptVersion.id,
      title: entry.title,
      slug: entry.slug,
      level: entry.level,
      createdAt: entry.createdAt,
    })
  }

  return {
    promptVersions,
    context: {
      seasonId: season.id,
      categoryId: category.id,
      toolId: tool.id,
      modelSnapshotId: modelSnapshot.id,
      primaryCaseId:
        primaryCaseId ??
        (() => {
          throw new Error('Expected homepage prompt fixture to create a benchmark case')
        })(),
      requestedModelId: llm.modelId,
      provider: llm.provider,
      publishedRunIds: [run.id],
    } satisfies HomepagePromptFixtureContext,
  }
}

async function addPromptTopToolEntry(
  context: HomepagePromptFixtureContext,
  entry: HomepagePromptSeed,
  scheduledFor: string,
  runStatus: 'published' | 'completed' = 'published',
) {
  const db = getTestDb()
  const prompt = first(
    await db
      .insert(prompts)
      .values({
        title: entry.title,
        slug: entry.slug,
        level: entry.level,
        description: `${entry.title} description`,
        contentMd: `# ${entry.title} ${entry.level}`,
        isActive: true,
      })
      .returning(),
  )

  const promptVersion = first(
    await db
      .insert(benchmarkPromptVersions)
      .values({
        promptId: prompt.id,
        slug: entry.slug,
        level: entry.level,
        version: 1,
        contentMd: prompt.contentMd ?? `# ${entry.title}`,
        contentHash: createHash('sha256').update(`${entry.slug}:${entry.level}`).digest('hex'),
        promptContractVersion: '1.0',
        isActive: true,
        createdAt: entry.createdAt,
      })
      .returning(),
  )

  await db.insert(benchmarkSeasonPrompts).values({
    seasonId: context.seasonId,
    promptVersionId: promptVersion.id,
  })

  const benchmarkCase = first(
    await db
      .insert(benchmarkCases)
      .values({
        seasonId: context.seasonId,
        promptVersionId: promptVersion.id,
        modelSnapshotId: context.modelSnapshotId,
      })
      .returning(),
  )

  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId: context.seasonId,
        scheduledFor,
        status: runStatus,
        qcStatus: 'passed',
      })
      .returning(),
  )

  const caseResult = first(
    await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: context.seasonId,
        runId: run.id,
        caseId: benchmarkCase.id,
        status: 'completed',
        requestedModelId: context.requestedModelId,
        returnedModelId: context.requestedModelId,
        provider: context.provider,
        parserVersion: 'strict-v1',
      })
      .returning(),
  )

  await db.insert(benchmarkCaseDecisions).values({
    caseResultId: caseResult.id,
    categoryId: context.categoryId,
    decisionType: 'tool',
    toolId: entry.resolutionStatus === 'unresolved_tool' ? null : context.toolId,
    rawToolName: entry.resolutionStatus === 'unresolved_tool' ? `${entry.title} Tool` : null,
    resolutionStatus: entry.resolutionStatus ?? 'resolved',
  })

  if (runStatus === 'published') {
    context.publishedRunIds.push(run.id)
  }

  return {
    id: promptVersion.id,
    title: entry.title,
    slug: entry.slug,
    level: entry.level,
    createdAt: entry.createdAt,
    resolutionStatus: entry.resolutionStatus,
    runId: run.id,
  } satisfies SeededPromptVersion & { runId: string }
}

async function addPublishedRunsForPrimaryPrompt(
  context: HomepagePromptFixtureContext,
  scheduledForDates: string[],
) {
  const db = getTestDb()
  const runs = await db
    .insert(benchmarkRuns)
    .values(
      scheduledForDates.map((scheduledFor) => ({
        seasonId: context.seasonId,
        scheduledFor,
        status: 'published' as const,
        qcStatus: 'passed' as const,
      })),
    )
    .returning()

  const caseResults = await db
    .insert(benchmarkCaseResults)
    .values(
      runs.map((run) => ({
        seasonId: context.seasonId,
        runId: run.id,
        caseId: context.primaryCaseId,
        status: 'completed' as const,
        requestedModelId: context.requestedModelId,
        returnedModelId: context.requestedModelId,
        provider: context.provider,
        parserVersion: 'strict-v1',
      })),
    )
    .returning()

  await db.insert(benchmarkCaseDecisions).values(
    caseResults.map((caseResult) => ({
      caseResultId: caseResult.id,
      categoryId: context.categoryId,
      decisionType: 'tool' as const,
      toolId: context.toolId,
      resolutionStatus: 'resolved' as const,
    })),
  )

  context.publishedRunIds.push(...runs.map((run) => run.id))
}

type ToolRankingFixtureContext = {
  seasonId: string
  modelSnapshotId: string
  primaryCaseId: string
  requestedModelId: string
  provider: string
  publishedRunIds: string[]
  groupId: string
  subcategoryAId: string
  subcategoryBId: string
  subcategoryASlug: string
  subcategoryBSlug: string
  subcategoryAName: string
  subcategoryBName: string
  tool1Id: string
  tool2Id: string
  tool3Id: string
  promptId: string
}

type ToolDecisionSpec = {
  category: 'A' | 'B'
  tool: 1 | 2 | 3
}

async function seedPromptToolRankingFixture(decisions: ToolDecisionSpec[]) {
  const db = getTestDb()
  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Rankings Group', slug: 'rankings-group', displayOrder: 1 })
      .returning(),
  )
  const subcategoryA = first(
    await db
      .insert(subcategories)
      .values({
        categoryId: group.id,
        name: 'Subcategory A',
        slug: 'subcategory-a',
        displayOrder: 1,
      })
      .returning(),
  )
  const subcategoryB = first(
    await db
      .insert(subcategories)
      .values({
        categoryId: group.id,
        name: 'Subcategory B',
        slug: 'subcategory-b',
        displayOrder: 2,
      })
      .returning(),
  )
  const tool1 = first(
    await db.insert(tools).values({ name: 'Tool One', slug: 'tool-one' }).returning(),
  )
  const tool2 = first(
    await db.insert(tools).values({ name: 'Tool Two', slug: 'tool-two' }).returning(),
  )
  const tool3 = first(
    await db.insert(tools).values({ name: 'Tool Three', slug: 'tool-three' }).returning(),
  )

  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-rankings',
        name: 'Rankings Benchmark',
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
        slug: 'rankings-season',
        name: 'Rankings Season',
        status: 'active',
      })
      .returning(),
  )
  const llm = first(
    await db
      .insert(llms)
      .values({
        name: 'Rankings LLM',
        slug: 'rankings-llm',
        provider: 'openrouter',
        company: 'Fixture',
        modelFamily: 'fixture',
        modelVersion: '1',
        modelId: 'fixture/rankings',
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
        requestedModelId: llm.modelId,
        tier: 'mid',
        snapshotKey: `snapshot-${crypto.randomUUID()}`,
      })
      .returning(),
  )

  await db.insert(benchmarkSeasonModels).values({
    seasonId: season.id,
    modelSnapshotId: modelSnapshot.id,
  })

  const prompt = first(
    await db
      .insert(prompts)
      .values({
        title: 'Rankings Prompt',
        slug: 'rankings-prompt',
        level: 'beginner',
        description: 'Rankings prompt description',
        contentMd: '# Rankings Prompt',
        isActive: true,
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
        contentMd: prompt.contentMd ?? '# Rankings Prompt',
        contentHash: createHash('sha256').update(`${prompt.slug}:beginner`).digest('hex'),
        promptContractVersion: '1.0',
        isActive: true,
      })
      .returning(),
  )
  await db.insert(benchmarkSeasonPrompts).values({
    seasonId: season.id,
    promptVersionId: promptVersion.id,
  })
  const benchmarkCase = first(
    await db
      .insert(benchmarkCases)
      .values({
        seasonId: season.id,
        promptVersionId: promptVersion.id,
        modelSnapshotId: modelSnapshot.id,
      })
      .returning(),
  )

  const categoryById = { A: subcategoryA.id, B: subcategoryB.id } as const
  const toolById = { 1: tool1.id, 2: tool2.id, 3: tool3.id } as const

  const publishedRunIds: string[] = []
  for (const [index, decision] of decisions.entries()) {
    const runDate = new Date('2026-03-20T00:00:00.000Z')
    runDate.setUTCDate(runDate.getUTCDate() + index)
    const scheduledFor = runDate.toISOString().slice(0, 10)
    const run = first(
      await db
        .insert(benchmarkRuns)
        .values({
          seasonId: season.id,
          scheduledFor,
          status: 'published',
          qcStatus: 'passed',
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
          requestedModelId: llm.modelId,
          returnedModelId: llm.modelId,
          provider: llm.provider,
          parserVersion: 'strict-v1',
        })
        .returning(),
    )
    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: caseResult.id,
      categoryId: categoryById[decision.category],
      decisionType: 'tool',
      toolId: toolById[decision.tool],
      resolutionStatus: 'resolved',
    })
    publishedRunIds.push(run.id)
  }

  return {
    context: {
      seasonId: season.id,
      modelSnapshotId: modelSnapshot.id,
      primaryCaseId: benchmarkCase.id,
      requestedModelId: llm.modelId,
      provider: llm.provider,
      publishedRunIds,
      groupId: group.id,
      subcategoryAId: subcategoryA.id,
      subcategoryBId: subcategoryB.id,
      subcategoryASlug: subcategoryA.slug,
      subcategoryBSlug: subcategoryB.slug,
      subcategoryAName: subcategoryA.name,
      subcategoryBName: subcategoryB.name,
      tool1Id: tool1.id,
      tool2Id: tool2.id,
      tool3Id: tool3.id,
      promptId: prompt.id,
    } satisfies ToolRankingFixtureContext,
  }
}

async function addExplorationPromptToolDecision(context: ToolRankingFixtureContext) {
  const db = getTestDb()
  const primaryCase = await db.query.benchmarkCases.findFirst({
    where: (table, { eq }) => eq(table.id, context.primaryCaseId),
  })
  if (!primaryCase) {
    throw new Error('Expected prompt ranking fixture to create a primary benchmark case')
  }

  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'exploration-rankings',
        name: 'Exploration Rankings',
        mode: 'exploration',
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
        slug: 'exploration-rankings-season',
        name: 'Exploration Rankings Season',
        status: 'active',
      })
      .returning(),
  )
  await db.insert(benchmarkSeasonModels).values({
    seasonId: season.id,
    modelSnapshotId: context.modelSnapshotId,
  })
  await db.insert(benchmarkSeasonPrompts).values({
    seasonId: season.id,
    promptVersionId: primaryCase.promptVersionId,
  })

  const tool = first(
    await db
      .insert(tools)
      .values({ name: 'Exploration Tool', slug: 'exploration-tool' })
      .returning(),
  )
  const benchmarkCase = first(
    await db
      .insert(benchmarkCases)
      .values({
        seasonId: season.id,
        promptVersionId: primaryCase.promptVersionId,
        modelSnapshotId: context.modelSnapshotId,
      })
      .returning(),
  )
  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-30',
        status: 'published',
        qcStatus: 'passed',
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
        requestedModelId: context.requestedModelId,
        returnedModelId: context.requestedModelId,
        provider: context.provider,
        parserVersion: 'strict-v1',
      })
      .returning(),
  )

  await db.insert(benchmarkCaseDecisions).values({
    caseResultId: caseResult.id,
    categoryId: context.subcategoryAId,
    decisionType: 'tool',
    toolId: tool.id,
    resolutionStatus: 'resolved',
  })

  return { run, tool }
}

async function addPromptToolRankingDecision(
  context: ToolRankingFixtureContext,
  options: {
    scheduledFor: string
    category: 'A' | 'B'
    tool: 1 | 2 | 3
  },
) {
  const db = getTestDb()
  const categoryId = options.category === 'A' ? context.subcategoryAId : context.subcategoryBId
  const toolId =
    options.tool === 1 ? context.tool1Id : options.tool === 2 ? context.tool2Id : context.tool3Id

  const run = first(
    await db
      .insert(benchmarkRuns)
      .values({
        seasonId: context.seasonId,
        scheduledFor: options.scheduledFor,
        status: 'published',
        qcStatus: 'passed',
      })
      .returning(),
  )
  const caseResult = first(
    await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: context.seasonId,
        runId: run.id,
        caseId: context.primaryCaseId,
        status: 'completed',
        requestedModelId: context.requestedModelId,
        returnedModelId: context.requestedModelId,
        provider: context.provider,
        parserVersion: 'strict-v1',
      })
      .returning(),
  )

  await db.insert(benchmarkCaseDecisions).values({
    caseResultId: caseResult.id,
    categoryId,
    decisionType: 'tool',
    toolId,
    resolutionStatus: 'resolved',
  })

  context.publishedRunIds.push(run.id)
  return run
}

describe('promptRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists active prompts only', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Active Prompt',
      slug: 'real-estate-website',
      level: 'beginner',
      description: 'active',
      isActive: true,
    })
    await adminCaller.prompt.create({
      title: 'Inactive Prompt',
      slug: 'blog-platform-cms',
      level: 'beginner',
      description: 'inactive',
      isActive: false,
    })

    const caller = createTestCaller(null)
    const activePrompts = await caller.prompt.listActive()
    expect(activePrompts).toHaveLength(1)
    expect(activePrompts[0]?.title).toBe('Active Prompt')
  })

  it('returns prompt by slug with null content when no contentMd stored', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Real Estate Prompt',
      slug: 'real-estate-website',
      level: 'beginner',
      description: 'test',
      isActive: true,
    })

    const caller = createTestCaller(null)
    const prompt = await caller.prompt.getBySlug({
      slug: 'real-estate-website',
      level: 'beginner',
    })

    expect(prompt.slug).toBe('real-estate-website')
    expect(prompt.content).toBeNull()
  })

  it('returns stored prompt content when contentMd exists', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Stored Prompt',
      slug: 'stored-prompt',
      level: 'beginner',
      description: 'test',
      contentMd: '# Build a SaaS app',
      isActive: true,
    })

    const caller = createTestCaller(null)
    const prompt = await caller.prompt.getBySlug({
      slug: 'stored-prompt',
      level: 'beginner',
    })

    expect(prompt.content).toBe('# Build a SaaS app')
  })

  it('lists prompt variants by slug across levels', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.prompt.create({
      title: 'Vibe Variant',
      slug: 'job-board',
      level: 'beginner',
      isActive: true,
    })
    await adminCaller.prompt.create({
      title: 'Experienced Variant',
      slug: 'job-board',
      level: 'advanced',
      isActive: true,
    })

    const caller = createTestCaller(null)
    const variants = await caller.prompt.listBySlug({ slug: 'job-board' })

    expect(variants).toHaveLength(2)
    expect(variants.map((variant) => variant.level).sort()).toEqual(['advanced', 'beginner'])
  })

  it('supports admin update and toggleActive', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const created = await caller.prompt.create({
      title: 'SaaS Prompt',
      slug: 'saas-application',
      level: 'beginner',
      description: 'original',
      contentMd: '# Original prompt',
      isActive: true,
    })

    const updated = await caller.prompt.update({
      id: created?.id ?? '',
      description: 'updated description',
      contentMd: '# Updated prompt',
      expectedCategories: ['auth', 'payments'],
    })

    expect(updated.description).toBe('updated description')
    expect(updated.contentMd).toBe('# Updated prompt')
    expect(updated.expectedCategories).toEqual(['auth', 'payments'])

    const toggled = await caller.prompt.toggleActive({
      id: created?.id ?? '',
      isActive: false,
    })
    expect(toggled.isActive).toBe(false)
  })

  it('enforces admin role for mutations', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.prompt.create({
        title: 'Blocked Prompt',
        slug: 'blocked-prompt',
        level: 'beginner',
        isActive: true,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('marks used prompts and rejects deleting them', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const db = getTestDb()

    const created = await caller.prompt.create({
      title: 'Used Prompt',
      slug: 'used-prompt',
      level: 'beginner',
      contentMd: '# Prompt content',
      isActive: true,
    })
    if (!created) {
      throw new Error('Expected prompt to be created')
    }

    await db.insert(benchmarkPromptVersions).values({
      promptId: created.id,
      slug: created.slug,
      level: created.level,
      version: 1,
      contentMd: created.contentMd ?? '# Prompt content',
      contentHash: `hash-${crypto.randomUUID()}`,
      promptContractVersion: '1.0',
      isActive: true,
    })

    const listed = await caller.prompt.list()
    expect(listed.find((prompt) => prompt.id === created.id)?.isUsed).toBe(true)

    await expect(caller.prompt.delete({ id: created.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Prompts that have already been used in benchmark seasons cannot be deleted',
    } satisfies Partial<TRPCError>)
  })

  it('dedupes first-page prompt families by slug and keeps the newest variant', async () => {
    const caller = createTestCaller(null)
    const anchorDate = '2026-04-01'
    const fixture = await seedPromptTopToolFixture([
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'intermediate',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'advanced',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      ...createUniquePromptSeeds(6),
    ])

    const result = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    const expectedFirstPage = buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5)

    expect(result.items).toHaveLength(5)
    expect(new Set(result.items.map((item) => item.slug)).size).toBe(5)
    expect(result.items.find((item) => item.slug === 'documentation-site')?.level).toBe('advanced')
    expect(result.items.map((item) => item.id)).toEqual(
      expectedFirstPage.firstPage.map((item) => item.id),
    )
    expect(result.hasMore).toBe(true)
  })

  it('keeps the same order for a shared anchorDate and rotates across different dates', async () => {
    const caller = createTestCaller(null)
    const anchorDate = '2026-04-01'
    const fixture = await seedPromptTopToolFixture([
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'advanced',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      ...createUniquePromptSeeds(6),
    ])

    const firstResult = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    const secondResult = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    const rotatedAnchorDate = findDifferentAnchorDate(fixture.promptVersions, anchorDate)
    const rotatedResult = await caller.prompt.listWithTopTools({
      limit: 5,
      offset: 0,
      anchorDate: rotatedAnchorDate,
    })

    expect(secondResult.items.map((item) => item.id)).toEqual(
      firstResult.items.map((item) => item.id),
    )
    expect(firstResult.items.map((item) => item.id)).toEqual(
      buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5).firstPage.map(
        (item) => item.id,
      ),
    )
    expect(rotatedResult.items.map((item) => item.id)).toEqual(
      buildExpectedPromptDisplayOrder(fixture.promptVersions, rotatedAnchorDate, 5).firstPage.map(
        (item) => item.id,
      ),
    )
    expect(rotatedResult.items.map((item) => item.id)).not.toEqual(
      firstResult.items.map((item) => item.id),
    )
  })

  it('paginates beyond the first page without repeating the exact first-page cards', async () => {
    const caller = createTestCaller(null)
    const anchorDate = '2026-04-01'
    const fixture = await seedPromptTopToolFixture([
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'intermediate',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'advanced',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      ...createUniquePromptSeeds(6),
    ])

    const firstPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    const secondPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 5, anchorDate })
    const expectedOrder = buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5)

    expect(secondPage.items.map((item) => item.id)).toEqual(
      expectedOrder.remaining.slice(0, 5).map((item) => item.id),
    )
    expect(secondPage.items.some((item) => item.slug === 'documentation-site')).toBe(true)
    expect(
      secondPage.items.some((item) =>
        firstPage.items.some((firstItem) => firstItem.id === item.id),
      ),
    ).toBe(false)
    expect(secondPage.hasMore).toBe(false)
  })

  it('backfills the first page with repeated families when unique slugs run short', async () => {
    const caller = createTestCaller(null)
    const anchorDate = '2026-04-01'
    const fixture = await seedPromptTopToolFixture([
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'intermediate',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'advanced',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      {
        title: 'Task Manager',
        slug: 'task-manager',
        level: 'intermediate',
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
      },
      {
        title: 'Task Manager',
        slug: 'task-manager',
        level: 'advanced',
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
      },
      {
        title: 'Portfolio Site',
        slug: 'portfolio-site',
        level: 'beginner',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
      },
      {
        title: 'Portfolio Site',
        slug: 'portfolio-site',
        level: 'intermediate',
        createdAt: new Date('2026-03-06T00:00:00.000Z'),
      },
    ])

    const firstPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    const secondPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 5, anchorDate })
    const expectedOrder = buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5)

    expect(firstPage.items).toHaveLength(5)
    expect(new Set(firstPage.items.map((item) => item.slug)).size).toBe(3)
    expect(firstPage.items.map((item) => item.id)).toEqual(
      expectedOrder.firstPage.map((item) => item.id),
    )
    expect(firstPage.hasMore).toBe(true)
    expect(secondPage.items.map((item) => item.id)).toEqual(
      expectedOrder.remaining.slice(0, 5).map((item) => item.id),
    )
    expect(secondPage.hasMore).toBe(false)
  })

  it('excludes unresolved tool decisions from homepage prompt candidates', async () => {
    const caller = createTestCaller(null)
    const unresolvedSlug = 'unresolved-prompt'
    const fixture = await seedPromptTopToolFixture([
      {
        title: 'Unresolved Prompt',
        slug: unresolvedSlug,
        level: 'beginner',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        resolutionStatus: 'unresolved_tool',
      },
      ...createUniquePromptSeeds(5),
    ])
    const anchorDate = findAnchorDateWherePromptAppearsOnFirstPage(
      fixture.promptVersions,
      unresolvedSlug,
      5,
      '2026-04-01',
    )
    const expectedOrder = buildExpectedPromptDisplayOrder(
      fixture.promptVersions.filter((promptVersion) => promptVersion.slug !== unresolvedSlug),
      anchorDate,
      5,
    )

    const result = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })

    expect(result.items).toHaveLength(5)
    expect(result.items.every((item) => item.topTools.length > 0)).toBe(true)
    expect(result.items.some((item) => item.slug === unresolvedSlug)).toBe(false)
    expect(result.items.map((item) => item.id)).toEqual(
      expectedOrder.firstPage.map((item) => item.id),
    )
    expect(result.hasMore).toBe(false)
  })

  it('keeps later pages pinned to the first-page snapshot when new runs publish', async () => {
    const caller = createTestCaller(null)
    const fixture = await seedPromptTopToolFixture(createUniquePromptSeeds(6))
    const newPromptEntry: HomepagePromptSeed = {
      title: 'Shifted Prompt',
      slug: 'shifted-prompt',
      level: 'beginner',
      createdAt: new Date('2026-03-07T00:00:00.000Z'),
    }
    const anchorDate = findAnchorDateWherePromptAppearsOnFirstPage(
      [
        ...fixture.promptVersions,
        {
          id: '00000000-0000-0000-0000-000000000001',
          ...newPromptEntry,
        },
      ],
      newPromptEntry.slug,
      5,
      '2026-04-01',
    )
    const expectedBefore = buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5)

    const firstPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    if (!firstPage.snapshot) {
      throw new Error('Expected first page to include a prompt snapshot')
    }
    expect(firstPage.snapshot).toEqual({
      publishedRunIds: fixture.context.publishedRunIds,
    })

    const insertedPromptVersion = await addPromptTopToolEntry(
      fixture.context,
      newPromptEntry,
      '2026-03-21',
    )
    const liveExpected = buildExpectedPromptDisplayOrder(
      [...fixture.promptVersions, insertedPromptVersion],
      anchorDate,
      5,
    )

    const snapshotSecondPage = await caller.prompt.listWithTopTools({
      limit: 5,
      offset: 5,
      anchorDate,
      snapshot: firstPage.snapshot,
    })
    const liveSecondPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 5, anchorDate })

    expect(snapshotSecondPage.items.map((item) => item.id)).toEqual(
      expectedBefore.remaining.slice(0, 5).map((item) => item.id),
    )
    expect(liveSecondPage.items.map((item) => item.id)).toEqual(
      liveExpected.remaining.slice(0, 5).map((item) => item.id),
    )
    expect(liveSecondPage.items.map((item) => item.id)).not.toEqual(
      snapshotSecondPage.items.map((item) => item.id),
    )
  })

  it('revalidates snapshot run IDs against published runs before querying prompts', async () => {
    const caller = createTestCaller(null)
    const fixture = await seedPromptTopToolFixture(createUniquePromptSeeds(5))
    const hiddenPrompt: HomepagePromptSeed = {
      title: 'Hidden Prompt',
      slug: 'hidden-prompt',
      level: 'beginner',
      createdAt: new Date('2026-03-07T00:00:00.000Z'),
    }
    const anchorDate = findAnchorDateWherePromptAppearsOnFirstPage(
      [
        ...fixture.promptVersions,
        {
          id: '00000000-0000-0000-0000-000000000002',
          ...hiddenPrompt,
        },
      ],
      hiddenPrompt.slug,
      5,
      '2026-04-01',
    )
    const unpublishedPromptVersion = await addPromptTopToolEntry(
      fixture.context,
      hiddenPrompt,
      '2026-03-21',
      'completed',
    )

    const result = await caller.prompt.listWithTopTools({
      limit: 5,
      offset: 0,
      anchorDate,
      snapshot: {
        seasonId: fixture.context.seasonId,
        publishedRunIds: [...fixture.context.publishedRunIds, unpublishedPromptVersion.runId],
      },
    })

    expect(result.snapshot).toEqual({
      seasonId: fixture.context.seasonId,
      publishedRunIds: fixture.context.publishedRunIds,
    })
    expect(result.items.map((item) => item.id)).toEqual(
      buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5).firstPage.map(
        (item) => item.id,
      ),
    )
    expect(result.items.some((item) => item.id === unpublishedPromptVersion.id)).toBe(false)
  })

  it('excludes future published runs from homepage prompt snapshots', async () => {
    const caller = createTestCaller(null)
    const fixture = await seedPromptTopToolFixture(createUniquePromptSeeds(5))
    const anchorDate = '2026-04-01'
    const initialPublishedRunIds = [...fixture.context.publishedRunIds]
    const futurePromptVersion = await addPromptTopToolEntry(
      fixture.context,
      {
        title: 'Future Prompt',
        slug: 'future-prompt',
        level: 'beginner',
        createdAt: new Date('2026-03-07T00:00:00.000Z'),
      },
      '2026-05-01',
    )

    const freshResult = await caller.prompt.listWithTopTools({ limit: 5, offset: 0, anchorDate })
    const snapshotResult = await caller.prompt.listWithTopTools({
      limit: 5,
      offset: 0,
      anchorDate,
      snapshot: {
        seasonId: fixture.context.seasonId,
        publishedRunIds: [...initialPublishedRunIds, futurePromptVersion.runId],
      },
    })

    expect(freshResult.snapshot).toEqual({ publishedRunIds: initialPublishedRunIds })
    expect(freshResult.items.some((item) => item.id === futurePromptVersion.id)).toBe(false)
    expect(snapshotResult.snapshot).toEqual({
      seasonId: fixture.context.seasonId,
      publishedRunIds: initialPublishedRunIds,
    })
    expect(snapshotResult.items.some((item) => item.id === futurePromptVersion.id)).toBe(false)
  })

  it('caps first-page snapshots to the supported run ID limit', async () => {
    const caller = createTestCaller(null)
    const fixture = await seedPromptTopToolFixture(createUniquePromptSeeds(1))
    const maxSnapshotRunIds = serverSettings.homepage.promptCarouselSnapshotMaxRunIds
    const scheduledForDates = Array.from({ length: maxSnapshotRunIds + 5 }, (_, index) => {
      const nextDate = new Date('2026-03-21T00:00:00.000Z')
      nextDate.setUTCDate(nextDate.getUTCDate() + index)
      return nextDate.toISOString().slice(0, 10)
    })

    await addPublishedRunsForPrimaryPrompt(fixture.context, scheduledForDates)

    const firstPage = await caller.prompt.listWithTopTools({
      limit: 5,
      offset: 0,
      anchorDate: '2030-01-01',
    })
    if (!firstPage.snapshot) {
      throw new Error('Expected first page to include a prompt snapshot')
    }

    expect(firstPage.snapshot).toEqual({
      publishedRunIds: fixture.context.publishedRunIds.slice(-maxSnapshotRunIds),
    })

    const secondPage = await caller.prompt.listWithTopTools({
      limit: 5,
      offset: 5,
      anchorDate: '2030-01-01',
      snapshot: firstPage.snapshot,
    })

    expect(secondPage.items).toHaveLength(0)
    expect(secondPage.snapshot).toEqual(firstPage.snapshot)
  })

  it('computes hasMore for later pages from the non-deduped remainder', async () => {
    const caller = createTestCaller(null)
    const anchorDate = '2026-04-01'
    const fixture = await seedPromptTopToolFixture([
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'intermediate',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        title: 'Documentation Site',
        slug: 'documentation-site',
        level: 'advanced',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      ...createUniquePromptSeeds(10),
    ])

    const secondPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 5, anchorDate })
    const thirdPage = await caller.prompt.listWithTopTools({ limit: 5, offset: 10, anchorDate })
    const expectedOrder = buildExpectedPromptDisplayOrder(fixture.promptVersions, anchorDate, 5)

    expect(secondPage.items.map((item) => item.id)).toEqual(
      expectedOrder.remaining.slice(0, 5).map((item) => item.id),
    )
    expect(secondPage.hasMore).toBe(true)
    expect(thirdPage.items.map((item) => item.id)).toEqual(
      expectedOrder.remaining.slice(5, 10).map((item) => item.id),
    )
    expect(thirdPage.hasMore).toBe(false)
  })

  it('getToolRankings returns empty when no published benchmark season exists', async () => {
    const caller = createTestCaller(null)
    const result = await caller.prompt.getToolRankings({
      promptId: '00000000-0000-0000-0000-000000000000',
    })

    expect(result.subcategories).toEqual([])
    expect(result.rankings).toEqual([])
  })

  it('getToolRankings aggregates per-tool and per-subcategory recommendation counts', async () => {
    const caller = createTestCaller(null)
    const { context } = await seedPromptToolRankingFixture([
      { category: 'A', tool: 1 },
      { category: 'B', tool: 2 },
      { category: 'A', tool: 1 },
      { category: 'B', tool: 3 },
      { category: 'A', tool: 1 },
      { category: 'B', tool: 2 },
      { category: 'A', tool: 1 },
      { category: 'B', tool: 2 },
      { category: 'A', tool: 1 },
      { category: 'B', tool: 3 },
    ])

    const result = await caller.prompt.getToolRankings({ promptId: context.promptId })

    expect(result.subcategories).toEqual([
      {
        id: context.subcategoryAId,
        name: context.subcategoryAName,
        slug: context.subcategoryASlug,
        displayOrder: 1,
      },
      {
        id: context.subcategoryBId,
        name: context.subcategoryBName,
        slug: context.subcategoryBSlug,
        displayOrder: 2,
      },
    ])

    expect(result.rankings).toHaveLength(3)
    expect(result.rankings.map((entry) => entry.tool.id)).toEqual([
      context.tool1Id,
      context.tool2Id,
      context.tool3Id,
    ])

    const tool1 = result.rankings.find((entry) => entry.tool.id === context.tool1Id)
    expect(tool1?.totalCount).toBe(5)
    expect(tool1?.perCategory).toEqual([{ categoryId: context.subcategoryAId, count: 5 }])

    const tool2 = result.rankings.find((entry) => entry.tool.id === context.tool2Id)
    expect(tool2?.totalCount).toBe(3)
    expect(tool2?.perCategory).toEqual([{ categoryId: context.subcategoryBId, count: 3 }])

    const tool3 = result.rankings.find((entry) => entry.tool.id === context.tool3Id)
    expect(tool3?.totalCount).toBe(2)
    expect(tool3?.perCategory).toEqual([{ categoryId: context.subcategoryBId, count: 2 }])
  })

  it('ignores published exploration runs in prompt tool recommendation counts', async () => {
    const caller = createTestCaller(null)
    const { context } = await seedPromptToolRankingFixture([{ category: 'A', tool: 1 }])
    const exploration = await addExplorationPromptToolDecision(context)

    const topTools = await caller.prompt.getTopTools({ promptId: context.promptId })
    expect(topTools.map((entry) => entry.tool.id)).toEqual([context.tool1Id])
    expect(topTools.some((entry) => entry.tool.id === exploration.tool.id)).toBe(false)

    const rankings = await caller.prompt.getToolRankings({ promptId: context.promptId })
    expect(rankings.rankings.map((entry) => entry.tool.id)).toEqual([context.tool1Id])
    expect(rankings.rankings[0]?.totalCount).toBe(1)
    expect(rankings.rankings.some((entry) => entry.tool.id === exploration.tool.id)).toBe(false)
  })

  it('ignores future published runs in prompt tool recommendation counts', async () => {
    const caller = createTestCaller(null)
    const { context } = await seedPromptToolRankingFixture([{ category: 'A', tool: 1 }])
    await addPromptToolRankingDecision(context, {
      scheduledFor: '2999-01-01',
      category: 'A',
      tool: 2,
    })

    const topTools = await caller.prompt.getTopTools({ promptId: context.promptId })
    expect(topTools.map((entry) => entry.tool.id)).toEqual([context.tool1Id])

    const rankings = await caller.prompt.getToolRankings({ promptId: context.promptId })
    expect(rankings.rankings.map((entry) => entry.tool.id)).toEqual([context.tool1Id])
    expect(rankings.rankings[0]?.totalCount).toBe(1)
  })

  it('getToolRankings splits counts across subcategories for a shared tool', async () => {
    const caller = createTestCaller(null)
    const { context } = await seedPromptToolRankingFixture([
      { category: 'A', tool: 1 },
      { category: 'B', tool: 1 },
      { category: 'A', tool: 1 },
      { category: 'B', tool: 2 },
    ])

    const result = await caller.prompt.getToolRankings({ promptId: context.promptId })

    const tool1 = result.rankings.find((entry) => entry.tool.id === context.tool1Id)
    expect(tool1?.totalCount).toBe(3)
    expect(tool1?.perCategory).toContainEqual({ categoryId: context.subcategoryAId, count: 2 })
    expect(tool1?.perCategory).toContainEqual({ categoryId: context.subcategoryBId, count: 1 })

    expect(result.subcategories.map((sub) => sub.id).sort()).toEqual(
      [context.subcategoryAId, context.subcategoryBId].sort(),
    )
  })
})
