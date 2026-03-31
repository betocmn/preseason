import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
import type { LlmService } from '~/server/llm/service'
import type { CompletionRequest, CompletionResponse } from '~/server/llm/service/types'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { runBenchmark } from './runner'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

function buildValidResponse(categorySlugs: string[]) {
  const appendix = JSON.stringify({
    schema_version: 'benchmark-v1',
    categories: categorySlugs.map((slug) => ({
      category_slug: slug,
      decision: 'tool',
      tool: slug === 'auth' ? 'Clerk' : 'Supabase',
      reasoning: 'Good fit',
      confidence: 0.85,
    })),
  })

  return `Here is my recommendation.\n\n<preseason_benchmark_json>\n${appendix}\n</preseason_benchmark_json>`
}

function mockCompletionForRequest(
  content: string,
  request: CompletionRequest,
  overrides: Partial<CompletionResponse> = {},
): CompletionResponse {
  return {
    content,
    requestedModel: request.model,
    returnedModel: request.model,
    provider: 'anthropic',
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    latencyMs: 1500,
    ...overrides,
  }
}

type MockCompleteFn = (_provider: string, request: CompletionRequest) => Promise<CompletionResponse>
type TestDb = ReturnType<typeof getTestDb>

function createMockLlmService(completeFn: MockCompleteFn) {
  const service = {
    complete: vi.fn(completeFn),
    getProvider: vi.fn(),
  }

  return service as unknown as LlmService & { complete: ReturnType<typeof vi.fn> }
}

function createDeferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitFor(assertion: () => void, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch {
      await wait(10)
    }
  }

  assertion()
}

async function seedBenchmarkPanel(
  db: TestDb,
  options: {
    promptCount?: number
    modelCount?: number
  } = {},
) {
  const promptCount = options.promptCount ?? 5
  const modelCount = options.modelCount ?? 3

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
  const databaseCat = first(
    await db
      .insert(subcategories)
      .values({ categoryId: group.id, name: 'Database', slug: 'database', displayOrder: 2 })
      .returning(),
  )

  await db.insert(tools).values([
    { name: 'Clerk', slug: 'clerk' },
    { name: 'Supabase', slug: 'supabase' },
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

  const [weightConfig] = await db
    .insert(benchmarkModelWeightConfigs)
    .values({
      slug: 'uniform-v1',
      name: 'Uniform',
      isActive: true,
    })
    .returning()
  if (!weightConfig) throw new Error('Failed to create weight config')

  const promptSeed = first(
    await db
      .insert(prompts)
      .values({
        title: 'Build a todo app',
        slug: 'build-todo-app',
        level: 'beginner',
        contentMd: '# Todo app',
      })
      .returning(),
  )

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
        modelId: 'claude-3-opus-20240229',
      },
      {
        name: 'GPT-4o',
        slug: 'gpt-4o',
        provider: 'openai',
        company: 'OpenAI',
        modelFamily: 'GPT',
        modelVersion: '4o',
        modelId: 'openai/gpt-4o',
      },
      {
        name: 'Gemini Pro',
        slug: 'gemini-pro',
        provider: 'google',
        company: 'Google',
        modelFamily: 'Gemini Pro',
        modelVersion: '1.5',
        modelId: 'google/gemini-1.5-pro',
      },
    ])
    .returning()

  const promptVersions = []
  for (let index = 0; index < promptCount; index++) {
    const prompt =
      index === 0
        ? promptSeed
        : first(
            await db
              .insert(prompts)
              .values({
                title: `Prompt ${index + 1}`,
                slug: `prompt-${index + 1}`,
                level: 'beginner',
                contentMd: `# Prompt ${index + 1}`,
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
          contentMd: prompt.contentMd ?? `# ${prompt.title}`,
          contentHash: `hash-${index}-${Date.now()}`,
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        })
        .returning(),
    )

    await db.insert(benchmarkPromptVersionCategories).values([
      { promptVersionId: promptVersion.id, categoryId: authCat.id, displayOrder: 1 },
      { promptVersionId: promptVersion.id, categoryId: databaseCat.id, displayOrder: 2 },
    ])

    promptVersions.push(promptVersion)
  }

  const modelSnapshots = []
  for (const llm of llmRows.slice(0, modelCount)) {
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
          snapshotKey: `${llm.modelId}:0.2:default:default:default`,
        })
        .returning(),
    )

    modelSnapshots.push(modelSnapshot)
  }

  const caseRows = []
  for (const promptVersion of promptVersions) {
    await db.insert(benchmarkSeasonPrompts).values({
      seasonId: season.id,
      promptVersionId: promptVersion.id,
    })

    for (const modelSnapshot of modelSnapshots) {
      await db
        .insert(benchmarkSeasonModels)
        .values({ seasonId: season.id, modelSnapshotId: modelSnapshot.id })
        .onConflictDoNothing()

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

      caseRows.push(benchmarkCase)
    }
  }

  return { season, caseRows, authCat, databaseCat, weightConfig }
}

async function seedEmptyBenchmarkSeason(db: TestDb) {
  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-empty',
        name: 'Benchmark Empty',
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
        slug: 'empty-season',
        name: 'Empty Season',
        status: 'active',
      })
      .returning(),
  )

  return { season }
}

async function findRun(db: TestDb, seasonId: string, scheduledFor: string) {
  const run = await db.query.benchmarkRuns.findFirst({
    where: and(eq(benchmarkRuns.seasonId, seasonId), eq(benchmarkRuns.scheduledFor, scheduledFor)),
  })

  if (!run) throw new Error('Expected benchmark run')
  return run
}

describe('runBenchmark', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('precreates pending case rows for a fresh run', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db)
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })

    expect(summary.status).toBe('running')
    expect(summary.processedThisInvocation).toBe(1)
    expect(summary.completedCases).toBe(1)
    expect(summary.remainingCases).toBe(14)

    const run = await findRun(db, season.id, '2026-03-10')
    expect(run.status).toBe('running')
    expect(run.expectedCaseCount).toBe(15)

    const results = await db
      .select({
        caseId: benchmarkCaseResults.caseId,
        status: benchmarkCaseResults.status,
        attemptCount: benchmarkCaseResults.attemptCount,
      })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, run.id))

    expect(results).toHaveLength(15)
    expect(results.filter((row) => row.status === 'pending')).toHaveLength(14)
    expect(results.filter((row) => row.status === 'completed')).toHaveLength(1)
    expect(results.filter((row) => row.attemptCount === 0)).toHaveLength(14)
  })

  it('auto-publishes a full run with valid responses', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db)
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('published')
    expect(summary.completedCases).toBe(15)
    expect(summary.invalidOutputCases).toBe(0)
    expect(summary.qc.passed).toBe(true)

    const run = await findRun(db, season.id, '2026-03-10')
    expect(run.status).toBe('published')
    expect(run.qcStatus).toBe('passed')
  })

  it('persists aggregate error summaries for qc_failed runs', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db)
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('Just a plain response with no appendix tags', request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('qc_failed')

    const run = await findRun(db, season.id, '2026-03-10')
    expect(run.errorLog).toContain('[invalid_output x15] Missing <preseason_benchmark_json> tags')
  })

  it('resumes the same run across chunked invocations without duplicate case rows', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db)
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const firstSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 8,
    })
    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 8,
    })

    expect(firstSummary.runId).toBe(secondSummary.runId)
    expect(firstSummary.status).toBe('running')
    expect(secondSummary.status).toBe('published')
    expect(secondSummary.completedCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(15)

    const results = await db
      .select({ id: benchmarkCaseResults.id, caseId: benchmarkCaseResults.caseId })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, firstSummary.runId))

    expect(results).toHaveLength(15)
    expect(new Set(results.map((row) => row.caseId)).size).toBe(15)
  })

  it('allows overlapping invocations to claim different pending cases', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db)
    const releaseCalls = createDeferred()
    const firstCallStarted = createDeferred()
    const secondCallStarted = createDeferred()

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount += 1
      if (callCount === 1) firstCallStarted.resolve()
      if (callCount === 2) secondCallStarted.resolve()
      if (callCount <= 2) {
        await releaseCalls.promise
      }
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    await firstCallStarted.promise

    const secondRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    await secondCallStarted.promise

    const run = await findRun(db, season.id, '2026-03-10')
    const runningRows = await db
      .select({ caseId: benchmarkCaseResults.caseId, status: benchmarkCaseResults.status })
      .from(benchmarkCaseResults)
      .where(
        and(eq(benchmarkCaseResults.runId, run.id), eq(benchmarkCaseResults.status, 'running')),
      )

    expect(runningRows).toHaveLength(2)
    expect(new Set(runningRows.map((row) => row.caseId)).size).toBe(2)
    expect(llmService.complete).toHaveBeenCalledTimes(2)

    releaseCalls.resolve()
    const [firstSummary, secondSummary] = await Promise.all([firstRunPromise, secondRunPromise])

    expect(firstSummary.status).toBe('running')
    expect(secondSummary.status).toBe('running')
    expect(firstSummary.processedThisInvocation).toBe(1)
    expect(secondSummary.processedThisInvocation).toBe(1)
  })

  it('returns running with no new work when fresh workers already hold the remaining cases', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db, { promptCount: 1, modelCount: 1 })
    const releaseCall = createDeferred()
    const firstCallStarted = createDeferred()

    const llmService = createMockLlmService(async (_provider, request) => {
      firstCallStarted.resolve()
      await releaseCall.promise
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    await firstCallStarted.promise

    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })

    expect(secondSummary.status).toBe('running')
    expect(secondSummary.processedThisInvocation).toBe(0)
    expect(secondSummary.remainingCases).toBe(1)
    expect(llmService.complete).toHaveBeenCalledTimes(1)

    releaseCall.resolve()
    const firstSummary = await firstRunPromise
    expect(firstSummary.status).toBe('qc_failed')
  })

  it('reclaims stale running cases and blocks the stale owner from writing a terminal result', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db, { promptCount: 1, modelCount: 1 })
    const releaseFirstCall = createDeferred()
    const firstCallStarted = createDeferred()
    let currentTime = new Date('2026-03-10T00:00:00.000Z')

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount += 1
      if (callCount === 1) {
        firstCallStarted.resolve()
        await releaseFirstCall.promise
      }
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      now: () => currentTime,
      runStaleAfterMs: 100,
    })
    await firstCallStarted.promise

    currentTime = new Date('2026-03-10T00:00:01.000Z')
    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      now: () => currentTime,
      runStaleAfterMs: 100,
    })

    releaseFirstCall.resolve()
    const firstSummary = await firstRunPromise

    expect(secondSummary.status).toBe('qc_failed')
    expect(secondSummary.processedThisInvocation).toBe(1)
    expect(firstSummary.processedThisInvocation).toBe(0)
    expect(callCount).toBe(2)

    const run = await findRun(db, season.id, '2026-03-10')
    const [result] = await db
      .select({
        status: benchmarkCaseResults.status,
        attemptCount: benchmarkCaseResults.attemptCount,
      })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, run.id))

    expect(run.status).toBe('qc_failed')
    expect(result?.status).toBe('completed')
    expect(result?.attemptCount).toBe(2)
  })

  it('preserves completed rows while backfilling missing rows for a legacy unfinished run', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedBenchmarkPanel(db, { promptCount: 3, modelCount: 1 })
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        status: 'pending',
        expectedCaseCount: caseRows.length,
        qcSummaryJson: {
          snapshotCaseIds: caseRows.map((benchmarkCase) => benchmarkCase.id),
          executionToken: 'legacy-token',
        },
      })
      .returning()
    if (!run) throw new Error('Expected seeded run')

    const [existingCompleted] = await db
      .insert(benchmarkCaseResults)
      .values({
        seasonId: season.id,
        runId: run.id,
        caseId: caseRows[0]?.id ?? '',
        status: 'completed',
        attemptCount: 1,
      })
      .returning()
    if (!existingCompleted) throw new Error('Expected seeded completed result')

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })

    expect(summary.status).toBe('running')
    expect(summary.processedThisInvocation).toBe(1)
    expect(summary.completedCases).toBe(2)

    const results = await db
      .select({
        id: benchmarkCaseResults.id,
        caseId: benchmarkCaseResults.caseId,
        status: benchmarkCaseResults.status,
      })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, run.id))

    expect(results).toHaveLength(caseRows.length)
    expect(results.find((row) => row.caseId === existingCompleted.caseId)?.id).toBe(
      existingCompleted.id,
    )
    expect(results.filter((row) => row.status === 'pending')).toHaveLength(1)

    const updatedRun = await findRun(db, season.id, '2026-03-10')
    expect(updatedRun.qcSummaryJson).toEqual({
      snapshotCaseIds: caseRows.map((benchmarkCase) => benchmarkCase.id),
    })
  })

  it('leaves a fresh legacy running run alone until it becomes stale', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedBenchmarkPanel(db, { promptCount: 1, modelCount: 1 })
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )
    let currentTime = new Date('2026-03-10T00:00:00.000Z')

    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        status: 'running',
        startedAt: currentTime,
        expectedCaseCount: caseRows.length,
        qcSummaryJson: {
          snapshotCaseIds: caseRows.map((benchmarkCase) => benchmarkCase.id),
          executionToken: 'legacy-token',
          lastHeartbeatAt: currentTime.toISOString(),
        },
      })
      .returning()
    if (!run) throw new Error('Expected seeded run')

    const freshSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      now: () => currentTime,
      runStaleAfterMs: 1_000,
    })

    expect(freshSummary.status).toBe('running')
    expect(freshSummary.processedThisInvocation).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(0)

    const freshRun = await findRun(db, season.id, '2026-03-10')
    expect(freshRun.qcSummaryJson).toEqual({
      snapshotCaseIds: caseRows.map((benchmarkCase) => benchmarkCase.id),
      executionToken: 'legacy-token',
      lastHeartbeatAt: currentTime.toISOString(),
    })

    currentTime = new Date('2026-03-10T00:00:02.000Z')
    const staleSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      now: () => currentTime,
      runStaleAfterMs: 1_000,
    })

    expect(staleSummary.status).toBe('qc_failed')
    expect(staleSummary.processedThisInvocation).toBe(1)
    expect(llmService.complete).toHaveBeenCalledTimes(1)
  })

  it('freezes weight config once when a run is initialized', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db, { promptCount: 2, modelCount: 1 })
    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const firstSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    const runAfterFirstInvocation = await findRun(db, season.id, '2026-03-10')
    const initialWeightConfigId = runAfterFirstInvocation.weightConfigId

    if (!initialWeightConfigId) throw new Error('Expected frozen weight config')

    await db
      .update(benchmarkModelWeightConfigs)
      .set({ isActive: false })
      .where(eq(benchmarkModelWeightConfigs.id, initialWeightConfigId))

    await db.insert(benchmarkModelWeightConfigs).values({
      slug: 'uniform-v2',
      name: 'Uniform 2',
      isActive: true,
    })

    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    const runAfterSecondInvocation = await findRun(db, season.id, '2026-03-10')

    expect(firstSummary.status).toBe('running')
    expect(secondSummary.status).toBe('qc_failed')
    expect(runAfterSecondInvocation.weightConfigId).toBe(initialWeightConfigId)
  })

  it('finalizes zero-case runs as qc_failed', async () => {
    const db = getTestDb()
    const { season } = await seedEmptyBenchmarkSeason(db)

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      maxCases: 1,
    })

    expect(summary.status).toBe('qc_failed')
    expect(summary.totalCases).toBe(0)
    expect(summary.remainingCases).toBe(0)
    expect(summary.qc.passed).toBe(false)
  })

  it('finalizes once after concurrent workers finish the last cases', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db, { promptCount: 2, modelCount: 1 })
    const releaseCalls = createDeferred()
    const secondCallStarted = createDeferred()

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount += 1
      if (callCount === 2) secondCallStarted.resolve()
      if (callCount <= 2) {
        await releaseCalls.promise
      }
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    await waitFor(() => expect(llmService.complete).toHaveBeenCalledTimes(1))

    const secondRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })
    await secondCallStarted.promise

    releaseCalls.resolve()
    const [firstSummary, secondSummary] = await Promise.all([firstRunPromise, secondRunPromise])

    expect(callCount).toBe(2)
    expect([firstSummary.status, secondSummary.status].sort()).toEqual(['qc_failed', 'qc_failed'])

    const run = await findRun(db, season.id, '2026-03-10')
    expect(run.status).toBe('qc_failed')
  })

  it('stops retrying a case after maxCaseAttempts and finalizes the run', async () => {
    const db = getTestDb()
    const { season } = await seedBenchmarkPanel(db, { promptCount: 1, modelCount: 1 })

    let callCount = 0
    const llmService = createMockLlmService(async () => {
      callCount += 1
      throw new Error('Simulated transient failure')
    })

    // First attempt — case fails, run stays running (1 case total).
    const first = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      caseClaimStaleAfterMs: 0,
    })
    expect(first.status).toBe('running')
    expect(callCount).toBe(1)

    // Second attempt — case fails again.
    const second = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      caseClaimStaleAfterMs: 0,
    })
    expect(second.status).toBe('running')
    expect(callCount).toBe(2)

    // Third attempt — case fails, hits maxCaseAttempts (3), run finalizes.
    const third = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      caseClaimStaleAfterMs: 0,
    })
    expect(third.status).toBe('qc_failed')
    expect(callCount).toBe(3)

    // Fourth invocation — no more work, run stays finalized.
    const fourth = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      caseClaimStaleAfterMs: 0,
    })
    expect(fourth.status).toBe('qc_failed')
    expect(fourth.processedThisInvocation).toBe(0)
    expect(callCount).toBe(3)

    const run = await findRun(db, season.id, '2026-03-10')
    expect(run.status).toBe('qc_failed')
  })

  it('finalizes a run with exhausted running cases instead of blocking forever', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedBenchmarkPanel(db, {
      promptCount: 1,
      modelCount: 1,
    })
    const benchmarkCase = caseRows[0]
    if (!benchmarkCase) throw new Error('Expected a case')

    // Seed a run with a single case already in running state at max attempts.
    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        trigger: 'cron',
        status: 'running',
        expectedCaseCount: 1,
        qcSummaryJson: { snapshotCaseIds: [benchmarkCase.id] },
      })
      .returning()
    if (!run) throw new Error('Expected run')

    await db.insert(benchmarkCaseResults).values({
      seasonId: season.id,
      runId: run.id,
      caseId: benchmarkCase.id,
      status: 'running',
      attemptCount: 3,
      startedAt: new Date('2026-03-09T00:00:00.000Z'),
    })

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
      caseClaimStaleAfterMs: 0,
    })

    expect(summary.status).toBe('qc_failed')
    expect(summary.processedThisInvocation).toBe(0)
    expect(llmService.complete).not.toHaveBeenCalled()

    const finalRun = await findRun(db, season.id, '2026-03-10')
    expect(finalRun.status).toBe('qc_failed')
  })
})
