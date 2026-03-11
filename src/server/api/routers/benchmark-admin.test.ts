import type { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkProtocols,
  benchmarkRuns,
  toolAliases,
  toolCandidates,
  toolCategories,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

async function seedProtocol() {
  const db = getTestDb()
  const [protocol] = await db
    .insert(benchmarkProtocols)
    .values({
      slug: 'benchmark-v2',
      name: 'Benchmark V2',
      description: 'Test protocol',
      mode: 'benchmark',
      parserVersion: '1.0',
      scoringVersion: '1.0',
      promptContractVersion: '1.0',
    })
    .returning()
  if (!protocol) throw new Error('Failed to create protocol')
  return protocol
}

async function seedPromptAndCategory(adminCaller: ReturnType<typeof createTestCaller>) {
  const group = await adminCaller.category.createGroup({
    name: 'Devtools',
    slug: 'devtools',
    displayOrder: 1,
  })
  if (!group) throw new Error('Expected group')

  const category = await adminCaller.category.create({
    name: 'Authentication',
    slug: 'auth',
    categoryId: group.id,
    description: 'Auth tools',
    icon: 'lock',
    displayOrder: 1,
  })
  if (!category) throw new Error('Expected category')

  const db = getTestDb()
  const { prompts, llms } = await import('~/server/db/schema')
  const [prompt] = await db
    .insert(prompts)
    .values({
      title: 'Build a SaaS',
      slug: 'build-a-saas',
      level: 'vibe-coder',
      description: 'Test prompt',
      expectedCategories: ['auth'],
      contentMd: '# Build a SaaS\n\nBuild a SaaS app with auth.',
      isActive: true,
    })
    .returning()

  const [llm] = await db
    .insert(llms)
    .values({
      name: 'GPT-4o',
      slug: 'gpt-4o',
      provider: 'openai',
      modelId: 'openai/gpt-4o',
      isActive: true,
    })
    .returning()

  if (!prompt || !llm) throw new Error('Failed to seed prompt/llm')
  return { group, category, prompt, llm }
}

describe('benchmarkAdminRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  // ---------------------------------------------------------------------------
  // Permission checks
  // ---------------------------------------------------------------------------

  it('rejects non-admin users', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    try {
      await caller.benchmarkAdmin.listSeasons()
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect((err as TRPCError).code).toBe('FORBIDDEN')
    }
  })

  // ---------------------------------------------------------------------------
  // Season lifecycle
  // ---------------------------------------------------------------------------

  it('creates a draft season', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
      notes: 'First season',
    })

    expect(season.status).toBe('draft')
    expect(season.slug).toBe('season-1')
  })

  it('freezes a season generating case matrix', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()
    await seedPromptAndCategory(caller)

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    const result = await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    expect(result.promptVersionCount).toBe(1)
    expect(result.modelSnapshotCount).toBe(1)
    expect(result.caseCount).toBe(1) // 1 prompt x 1 model

    // Verify season is now active
    const detail = await caller.benchmarkAdmin.getSeasonById({ id: season.id })
    expect(detail.status).toBe('active')
    expect(detail.seasonPrompts).toHaveLength(1)
    expect(detail.seasonModels).toHaveLength(1)
  })

  it('rejects freezing a non-draft season', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()
    await seedPromptAndCategory(caller)

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    try {
      await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
    }
  })

  it('completes an active season', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()
    await seedPromptAndCategory(caller)

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })
    const completed = await caller.benchmarkAdmin.completeSeason({ seasonId: season.id })

    expect(completed.status).toBe('completed')
  })

  it('rejects completing a draft season', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    try {
      await caller.benchmarkAdmin.completeSeason({ seasonId: season.id })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
    }
  })

  // ---------------------------------------------------------------------------
  // Weight config management
  // ---------------------------------------------------------------------------

  it('creates and activates weight configs', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const config1 = await caller.benchmarkAdmin.createWeightConfig({
      slug: 'uniform-v1',
      name: 'Uniform V1',
      frontierWeight: 1.0,
      midWeight: 1.0,
      smallWeight: 1.0,
    })

    const config2 = await caller.benchmarkAdmin.createWeightConfig({
      slug: 'weighted-v1',
      name: 'Weighted V1',
      frontierWeight: 1.5,
      midWeight: 1.0,
      smallWeight: 0.6,
    })

    expect(config1.isActive).toBe(false)

    // Activate first
    const activated1 = await caller.benchmarkAdmin.activateWeightConfig({ id: config1.id })
    expect(activated1.isActive).toBe(true)

    // Activate second (should deactivate first)
    await caller.benchmarkAdmin.activateWeightConfig({ id: config2.id })

    const configs = await caller.benchmarkAdmin.listWeightConfigs()
    const active = configs.filter((c) => c.isActive)
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(config2.id)
  })

  // ---------------------------------------------------------------------------
  // Run publishing
  // ---------------------------------------------------------------------------

  it('publishes a completed run', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()
    await seedPromptAndCategory(caller)

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    // Insert a run directly as completed
    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'completed',
        qcStatus: 'passed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const published = await caller.benchmarkAdmin.publishRun({ runId: run.id })
    expect(published.status).toBe('published')
  })

  it('rejects publishing a non-completed run', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'qc_failed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    try {
      await caller.benchmarkAdmin.publishRun({ runId: run.id })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
    }
  })

  it('rejects publishing a completed run when QC has not passed', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })

    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'completed',
        qcStatus: 'failed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    try {
      await caller.benchmarkAdmin.publishRun({ runId: run.id })
      expect.unreachable('Should have thrown')
    } catch (err) {
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
    }
  })

  it('returns case rows on benchmark run detail', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()
    const { category } = await seedPromptAndCategory(caller)

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })
    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    const tool = await caller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Failed to create tool')

    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'completed',
        qcStatus: 'passed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const [benchmarkCase] = await db.select().from(benchmarkCases)
    if (!benchmarkCase) throw new Error('No case found')

    const [caseResult] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: run.id,
        caseId: benchmarkCase.id,
        status: 'completed',
        returnedModelId: 'openai/gpt-4o',
      })
      .returning()
    if (!caseResult) throw new Error('Failed to create case result')

    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: caseResult.id,
      categoryId: category.id,
      decisionType: 'tool',
      toolId: tool.id,
      rawToolName: 'Clerk',
    })

    const detail = await caller.benchmarkAdmin.getBenchmarkRun({ id: run.id })

    expect(detail.caseRows).toHaveLength(1)
    expect(detail.caseRows[0]?.result?.status).toBe('completed')
    expect(detail.caseRows[0]?.result?.decisions[0]?.toolName).toBe('Clerk')
  })

  // ---------------------------------------------------------------------------
  // Tool candidate review
  // ---------------------------------------------------------------------------

  it('approves a candidate and replays decisions', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const protocol = await seedProtocol()
    const { category } = await seedPromptAndCategory(caller)

    // Create season and freeze
    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-1',
      name: 'Season 1',
    })
    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    // Create a tool to link to
    const tool = await caller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Failed to create tool')

    // Create a tool candidate
    const db = getTestDb()
    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'clerk.dev',
        normalizedName: 'clerk.dev',
        seenCount: 5,
      })
      .returning()
    if (!candidate) throw new Error('Failed to create candidate')

    // Create a run + case result + unresolved decision
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'completed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const detail = await caller.benchmarkAdmin.getSeasonById({ id: season.id })
    const caseRow = detail.seasonPrompts[0]
    if (!caseRow) throw new Error('No season prompt found')

    // Get the actual case ID
    const cases = await db.select().from(benchmarkCases)
    const testCase = cases[0]
    if (!testCase) throw new Error('No case found')

    const [caseResult] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: run.id,
        caseId: testCase.id,
        status: 'completed',
      })
      .returning()
    if (!caseResult) throw new Error('Failed to create case result')

    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: caseResult.id,
      categoryId: category.id,
      decisionType: 'tool',
      rawToolName: 'clerk.dev',
      resolutionStatus: 'unresolved_tool',
    })

    // Approve the candidate
    const approved = await caller.benchmarkAdmin.approveCandidate({
      candidateId: candidate.id,
      toolId: tool.id,
    })
    expect(approved.status).toBe('approved')
    expect(approved.approvedToolId).toBe(tool.id)

    // Replay decisions
    const replay = await caller.benchmarkAdmin.replayDecisions({
      candidateId: candidate.id,
    })
    expect(replay.updatedCount).toBe(1)
  })

  it('approves a candidate by creating a new tool', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const { category } = await seedPromptAndCategory(caller)

    const db = getTestDb()
    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'NewAuthTool',
        normalizedName: 'newauthtool',
        seenCount: 2,
        suggestedCategoryId: category.id,
      })
      .returning()
    if (!candidate) throw new Error('Failed to create candidate')

    const approved = await caller.benchmarkAdmin.approveCandidate({
      candidateId: candidate.id,
      newTool: {
        name: 'New Auth Tool',
        slug: 'new-auth-tool',
        categoryId: category.id,
      },
    })

    expect(approved.status).toBe('approved')
    expect(approved.approvedToolId).toBeTruthy()

    const approvedToolId = approved.approvedToolId
    if (!approvedToolId) {
      throw new Error('Expected approved tool id')
    }

    const createdTool = await db.query.tools.findFirst({
      where: (fields, { eq }) => eq(fields.id, approvedToolId),
    })
    expect(createdTool?.name).toBe('New Auth Tool')
    expect(createdTool?.slug).toBe('new-auth-tool')

    const alias = await db.query.toolAliases.findFirst({
      where: eq(toolAliases.normalizedAlias, candidate.normalizedName),
    })
    expect(alias?.toolId).toBe(approvedToolId)

    const toolCategory = await db.query.toolCategories.findFirst({
      where: eq(toolCategories.toolId, approvedToolId),
    })
    expect(toolCategory?.categoryId).toBe(category.id)
  })

  it('rejects a candidate with notes', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const db = getTestDb()
    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'FakeTool',
        normalizedName: 'faketool',
        seenCount: 1,
      })
      .returning()
    if (!candidate) throw new Error('Failed to create candidate')

    const rejected = await caller.benchmarkAdmin.rejectCandidate({
      candidateId: candidate.id,
      notes: 'Hallucinated tool name',
    })

    expect(rejected.status).toBe('rejected')
    expect(rejected.notes).toBe('Hallucinated tool name')
  })
})
