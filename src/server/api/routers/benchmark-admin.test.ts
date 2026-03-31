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
      level: 'beginner',
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
      company: 'OpenAI',
      modelFamily: 'GPT',
      modelVersion: '4o',
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
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        completedAt: new Date('2026-03-01T00:05:00.000Z'),
        attemptCount: 2,
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
    expect(detail.resultStats.completed).toBe(1)
    expect(detail.caseRows[0]?.result?.status).toBe('completed')
    expect(detail.caseRows[0]?.result?.attemptCount).toBe(2)
    expect(detail.caseRows[0]?.result?.startedAt?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(detail.caseRows[0]?.result?.completedAt?.toISOString()).toBe('2026-03-01T00:05:00.000Z')
    expect(detail.caseRows[0]?.result?.decisions[0]?.toolName).toBe('Clerk')
  })

  it('shows running case rows in benchmark run detail', async () => {
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

    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'running',
        expectedCaseCount: 1,
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const [benchmarkCase] = await db.select().from(benchmarkCases)
    if (!benchmarkCase) throw new Error('No case found')

    await db.insert(benchmarkCaseResults).values({
      seasonId: season.id,
      runId: run.id,
      caseId: benchmarkCase.id,
      status: 'running',
      startedAt: new Date('2026-03-01T00:00:00.000Z'),
      attemptCount: 1,
    })

    const detail = await caller.benchmarkAdmin.getBenchmarkRun({ id: run.id })

    expect(detail.resultStats.running).toBe(1)
    expect(detail.caseRows[0]?.result?.status).toBe('running')
    expect(detail.caseRows[0]?.result?.attemptCount).toBe(1)
    expect(detail.caseRows[0]?.result?.completedAt).toBeNull()
  })

  it('synthesizes pending counts for pending runs before result rows exist', async () => {
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

    const db = getTestDb()
    const caseRows = await db.select({ id: benchmarkCases.id }).from(benchmarkCases)
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'pending',
        expectedCaseCount: caseRows.length,
        qcSummaryJson: { snapshotCaseIds: caseRows.map((row) => row.id) },
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const detail = await caller.benchmarkAdmin.getBenchmarkRun({ id: run.id })

    expect(detail.resultStats.pending).toBe(caseRows.length)
    expect(detail.resultStats.running ?? 0).toBe(0)
    expect(detail.caseRows).toHaveLength(caseRows.length)
    expect(detail.caseRows.every((row) => row.result === null)).toBe(true)
  })

  it('falls back to legacy case-result timestamps and attempt counts in benchmark run detail', async () => {
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

    const [legacyResult] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: run.id,
        caseId: benchmarkCase.id,
        status: 'completed',
      })
      .returning()
    if (!legacyResult) throw new Error('Failed to create legacy case result')

    const detail = await caller.benchmarkAdmin.getBenchmarkRun({ id: run.id })

    expect(detail.caseRows[0]?.result?.attemptCount).toBe(1)
    expect(detail.caseRows[0]?.result?.startedAt?.toISOString()).toBe(
      legacyResult.createdAt.toISOString(),
    )
    expect(detail.caseRows[0]?.result?.completedAt?.toISOString()).toBe(
      legacyResult.createdAt.toISOString(),
    )
  })

  it('retries failed cases on a published run by resetting rows in place', async () => {
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

    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'published',
        qcStatus: 'passed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const [benchmarkCase] = await db.select().from(benchmarkCases)
    if (!benchmarkCase) throw new Error('No case found')

    const tool = await caller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Failed to create tool')

    const [failedResult] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: run.id,
        caseId: benchmarkCase.id,
        status: 'failed',
        startedAt: new Date('2026-03-01T00:00:00.000Z'),
        completedAt: new Date('2026-03-01T00:05:00.000Z'),
        attemptCount: 3,
        rawResponse: 'Bad output',
        errorMessage: 'Timed out',
      })
      .returning()
    if (!failedResult) throw new Error('Failed to create failed case result')

    await db.insert(benchmarkCaseDecisions).values({
      caseResultId: failedResult.id,
      categoryId: category.id,
      decisionType: 'tool',
      toolId: tool.id,
      rawToolName: 'Clerk',
    })

    const result = await caller.benchmarkAdmin.retryFailedCases({ runId: run.id })
    expect(result.retriedCount).toBe(1)

    const updatedRun = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, run.id),
    })
    expect(updatedRun?.status).toBe('pending')
    expect(updatedRun?.startedAt).toBeNull()
    expect(updatedRun?.qcStatus).toBeNull()
    expect(updatedRun?.qcSummaryJson).toEqual({ snapshotCaseIds: [benchmarkCase.id] })

    const resetResult = await db.query.benchmarkCaseResults.findFirst({
      where: eq(benchmarkCaseResults.id, failedResult.id),
    })
    expect(resetResult?.status).toBe('pending')
    expect(resetResult?.startedAt).toBeNull()
    expect(resetResult?.completedAt).toBeNull()
    expect(resetResult?.attemptCount).toBe(0)
    expect(resetResult?.rawResponse).toBe('Bad output')
    expect(resetResult?.errorMessage).toBeNull()

    const decisionRows = await db
      .select({ id: benchmarkCaseDecisions.id })
      .from(benchmarkCaseDecisions)
      .where(eq(benchmarkCaseDecisions.caseResultId, failedResult.id))
    expect(decisionRows).toHaveLength(0)
  })

  it('rebuilds retry snapshots from the season when a failed run has no stored results', async () => {
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

    const db = getTestDb()
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'failed',
      })
      .returning()
    if (!run) throw new Error('Failed to create run')

    const caseRows = await db.select({ id: benchmarkCases.id }).from(benchmarkCases)
    const deactivatedCaseId = caseRows[0]?.id
    if (!deactivatedCaseId) throw new Error('Expected frozen benchmark case')

    await db
      .update(benchmarkCases)
      .set({ isActive: false })
      .where(eq(benchmarkCases.id, deactivatedCaseId))

    const expectedCaseIds = caseRows
      .filter((row) => row.id !== deactivatedCaseId)
      .map((row) => row.id)
      .sort()

    const result = await caller.benchmarkAdmin.retryFailedCases({ runId: run.id })
    expect(result.retriedCount).toBe(0)

    const updatedRun = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, run.id),
    })
    const snapshotCaseIds =
      (
        updatedRun?.qcSummaryJson as
          | {
              snapshotCaseIds?: string[]
            }
          | null
          | undefined
      )?.snapshotCaseIds ?? []

    expect(updatedRun?.status).toBe('pending')
    expect([...snapshotCaseIds].sort()).toEqual(expectedCaseIds)
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

    // Approve the candidate (replay happens atomically)
    const result = await caller.benchmarkAdmin.approveCandidate({
      candidateId: candidate.id,
      toolId: tool.id,
    })
    expect(result.candidate.status).toBe('approved')
    expect(result.candidate.approvedToolId).toBe(tool.id)
    expect(result.replayedCount).toBe(1)
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

    const result = await caller.benchmarkAdmin.approveCandidate({
      candidateId: candidate.id,
      newTool: {
        name: 'New Auth Tool',
        slug: 'new-auth-tool',
        categoryId: category.id,
      },
    })

    expect(result.candidate.status).toBe('approved')
    expect(result.candidate.approvedToolId).toBeTruthy()

    const approvedToolId = result.candidate.approvedToolId
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

  it('resets approval-owned aliases and replayed decisions', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const { category } = await seedPromptAndCategory(caller)
    const protocol = await seedProtocol()

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-reset-owned-alias',
      name: 'Season Reset Owned Alias',
    })
    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    const tool = await caller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Failed to create tool')

    const db = getTestDb()
    const [testCase] = await db.select().from(benchmarkCases)
    if (!testCase) throw new Error('No case found')

    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'clerk.dev',
        normalizedName: 'clerk.dev',
        seenCount: 2,
      })
      .returning()
    if (!candidate) throw new Error('Failed to create candidate')

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

    const [decision] = await db
      .insert(benchmarkCaseDecisions)
      .values({
        caseResultId: caseResult.id,
        categoryId: category.id,
        decisionType: 'tool',
        rawToolName: candidate.rawName,
        resolutionStatus: 'unresolved_tool',
      })
      .returning()
    if (!decision) throw new Error('Failed to create decision')

    await caller.benchmarkAdmin.approveCandidate({
      candidateId: candidate.id,
      toolId: tool.id,
    })

    const alias = await db.query.toolAliases.findFirst({
      where: eq(toolAliases.normalizedAlias, candidate.normalizedName),
    })
    expect(alias?.source).toBe('candidate_approval')

    const approvedDecision = await db.query.benchmarkCaseDecisions.findFirst({
      where: eq(benchmarkCaseDecisions.id, decision.id),
    })
    expect(approvedDecision?.toolId).toBe(tool.id)
    expect(approvedDecision?.resolutionStatus).toBe('resolved')

    const reset = await caller.benchmarkAdmin.resetCandidate({ candidateId: candidate.id })
    expect(reset.status).toBe('pending')
    expect(reset.approvedToolId).toBeNull()

    const aliasAfterReset = await db.query.toolAliases.findFirst({
      where: eq(toolAliases.normalizedAlias, candidate.normalizedName),
    })
    expect(aliasAfterReset).toBeUndefined()

    const revertedDecision = await db.query.benchmarkCaseDecisions.findFirst({
      where: eq(benchmarkCaseDecisions.id, decision.id),
    })
    expect(revertedDecision?.toolId).toBeNull()
    expect(revertedDecision?.resolutionStatus).toBe('unresolved_tool')
  })

  it('keeps pre-existing aliases and their resolved decisions when resetting', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const { category } = await seedPromptAndCategory(caller)
    const protocol = await seedProtocol()

    const season = await caller.benchmarkAdmin.createSeason({
      protocolId: protocol.id,
      slug: 'season-reset-existing-alias',
      name: 'Season Reset Existing Alias',
    })
    await caller.benchmarkAdmin.freezeSeason({ seasonId: season.id })

    const tool = await caller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Failed to create tool')

    const db = getTestDb()
    await db.insert(toolAliases).values({
      toolId: tool.id,
      alias: 'clerk.dev',
      normalizedAlias: 'clerk.dev',
      source: 'admin',
    })

    const [testCase] = await db.select().from(benchmarkCases)
    if (!testCase) throw new Error('No case found')

    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'clerk.dev',
        normalizedName: 'clerk.dev',
        seenCount: 2,
      })
      .returning()
    if (!candidate) throw new Error('Failed to create candidate')

    const [replayRun] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-01',
        trigger: 'manual',
        status: 'completed',
      })
      .returning()
    if (!replayRun) throw new Error('Failed to create replay run')

    const [replayCaseResult] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: replayRun.id,
        caseId: testCase.id,
        status: 'completed',
      })
      .returning()
    if (!replayCaseResult) throw new Error('Failed to create replay case result')

    const [replayedDecision] = await db
      .insert(benchmarkCaseDecisions)
      .values({
        caseResultId: replayCaseResult.id,
        categoryId: category.id,
        decisionType: 'tool',
        rawToolName: candidate.rawName,
        resolutionStatus: 'unresolved_tool',
      })
      .returning()
    if (!replayedDecision) throw new Error('Failed to create replay decision')

    const result = await caller.benchmarkAdmin.approveCandidate({
      candidateId: candidate.id,
      toolId: tool.id,
    })
    expect(result.replayedCount).toBe(1)

    const [resolvedRun] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-02',
        trigger: 'manual',
        status: 'completed',
      })
      .returning()
    if (!resolvedRun) throw new Error('Failed to create resolved run')

    const [resolvedCaseResult] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: resolvedRun.id,
        caseId: testCase.id,
        status: 'completed',
      })
      .returning()
    if (!resolvedCaseResult) throw new Error('Failed to create resolved case result')

    const [aliasBackedDecision] = await db
      .insert(benchmarkCaseDecisions)
      .values({
        caseResultId: resolvedCaseResult.id,
        categoryId: category.id,
        decisionType: 'tool',
        rawToolName: candidate.rawName,
        toolId: tool.id,
        resolutionStatus: 'resolved',
      })
      .returning()
    if (!aliasBackedDecision) throw new Error('Failed to create alias-backed decision')

    const reset = await caller.benchmarkAdmin.resetCandidate({ candidateId: candidate.id })
    expect(reset.status).toBe('pending')
    expect(reset.approvedToolId).toBeNull()

    const aliasAfterReset = await db.query.toolAliases.findFirst({
      where: eq(toolAliases.normalizedAlias, candidate.normalizedName),
    })
    expect(aliasAfterReset?.source).toBe('admin')
    expect(aliasAfterReset?.toolId).toBe(tool.id)

    const replayedDecisionAfterReset = await db.query.benchmarkCaseDecisions.findFirst({
      where: eq(benchmarkCaseDecisions.id, replayedDecision.id),
    })
    expect(replayedDecisionAfterReset?.toolId).toBe(tool.id)
    expect(replayedDecisionAfterReset?.resolutionStatus).toBe('resolved')

    const aliasBackedDecisionAfterReset = await db.query.benchmarkCaseDecisions.findFirst({
      where: eq(benchmarkCaseDecisions.id, aliasBackedDecision.id),
    })
    expect(aliasBackedDecisionAfterReset?.toolId).toBe(tool.id)
    expect(aliasBackedDecisionAfterReset?.resolutionStatus).toBe('resolved')
  })

  it('returns unique candidate suggestions for likely matches', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const { category } = await seedPromptAndCategory(caller)

    const tool = await caller.tool.create({
      name: 'Clerk',
      slug: 'clerk',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Expected tool to be created')

    const db = getTestDb()
    await db.insert(toolCandidates).values({
      rawName: 'clerk.dev',
      normalizedName: 'clerk.dev',
      seenCount: 3,
      suggestedCategoryId: category.id,
      status: 'pending',
    })

    const candidates = await caller.benchmarkAdmin.listToolCandidates({
      limit: 10,
      offset: 0,
      status: 'pending',
    })

    expect(candidates.items[0]?.suggestedTool?.id).toBe(tool.id)
    expect(candidates.items[0]?.suggestionReason).toBe(
      'Unique fingerprint match in suggested category',
    )
    expect(candidates.items[0]?.canAutoApprove).toBe(true)
  })

  it('prefers stored ai-reviewed suggestions over fallback matching', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const { category } = await seedPromptAndCategory(caller)

    const tool = await caller.tool.create({
      name: 'Simple',
      slug: 'simple',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Expected tool to be created')

    const db = getTestDb()
    await db.insert(toolCandidates).values({
      rawName: 'Simple Labs CI',
      normalizedName: 'simple labs ci',
      seenCount: 2,
      suggestedCategoryId: category.id,
      status: 'pending',
      aiSuggestedToolId: tool.id,
      aiReviewConfidence: 0.94,
      aiReviewReason: 'LLM confirmed this is a branded variant of Simple.',
      aiReviewModel: 'openai/gpt-5.4-mini',
      aiReviewedAt: new Date('2026-03-28T00:00:00Z'),
    })

    const candidates = await caller.benchmarkAdmin.listToolCandidates({
      limit: 10,
      offset: 0,
      status: 'pending',
    })

    expect(candidates.items[0]?.suggestedTool?.id).toBe(tool.id)
    expect(candidates.items[0]?.suggestionReason).toBe(
      'LLM confirmed this is a branded variant of Simple.',
    )
    expect(candidates.items[0]?.canAutoApprove).toBe(true)
  })

  it('does not mark low-confidence ai suggestions as auto-approvable', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const { category } = await seedPromptAndCategory(caller)

    const tool = await caller.tool.create({
      name: 'Simple',
      slug: 'simple',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Expected tool to be created')

    const db = getTestDb()
    await db.insert(toolCandidates).values({
      rawName: 'Simple Labs CI',
      normalizedName: 'simple labs ci',
      seenCount: 2,
      suggestedCategoryId: category.id,
      status: 'pending',
      aiSuggestedToolId: tool.id,
      aiReviewConfidence: 0.61,
      aiReviewReason: 'This might be a variant of Simple, but the evidence is weak.',
      aiReviewModel: 'openai/gpt-5.4-mini',
      aiReviewedAt: new Date('2026-03-28T00:00:00Z'),
    })

    const candidates = await caller.benchmarkAdmin.listToolCandidates({
      limit: 10,
      offset: 0,
      status: 'pending',
    })

    expect(candidates.items[0]?.suggestedTool?.id).toBe(tool.id)
    expect(candidates.items[0]?.suggestionReason).toBe(
      'This might be a variant of Simple, but the evidence is weak.',
    )
    expect(candidates.items[0]?.canAutoApprove).toBe(false)
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
