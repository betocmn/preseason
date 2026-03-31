import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
  toolCandidates,
  tools,
} from '~/server/db/schema'
import type { LlmService } from '~/server/llm/service'
import type { CompletionRequest, CompletionResponse } from '~/server/llm/service/types'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { REPAIR_PARSER_VERSION } from './repair'
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

type TestDb = ReturnType<typeof getTestDb>

function createDelayedCaseSnapshotDb(
  db: TestDb,
  options: {
    caseIdQueryStarted: ReturnType<typeof createDeferred>
    allowCaseIdQuery: ReturnType<typeof createDeferred>
  },
) {
  let shouldDelayCaseIdQuery = true

  function wrapBuilder(builder: unknown, isCaseIdQuery: boolean, delayOnExecute: boolean): unknown {
    if (
      builder === null ||
      builder === undefined ||
      (typeof builder !== 'object' && typeof builder !== 'function')
    ) {
      return builder
    }

    return new Proxy(builder, {
      get(target, prop, receiver) {
        if (prop === 'then') {
          const then = Reflect.get(target, prop, receiver)

          if (typeof then !== 'function') {
            return then
          }

          return (...args: unknown[]) => {
            if (delayOnExecute) {
              shouldDelayCaseIdQuery = false
              options.caseIdQueryStarted.resolve()

              return options.allowCaseIdQuery.promise.then(() => Reflect.apply(then, target, args))
            }

            return Reflect.apply(then, target, args)
          }
        }

        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') {
          return value
        }

        return (...args: unknown[]) => {
          const result = Reflect.apply(value, target, args)
          const nextDelayOnExecute =
            delayOnExecute ||
            (prop === 'from' &&
              isCaseIdQuery &&
              shouldDelayCaseIdQuery &&
              args[0] === benchmarkCases)

          return wrapBuilder(result, isCaseIdQuery, nextDelayOnExecute)
        }
      },
    })
  }

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'select') {
        return (...args: unknown[]) => {
          const selection = args[0]
          const isCaseIdQuery =
            shouldDelayCaseIdQuery &&
            args.length === 1 &&
            selection !== null &&
            typeof selection === 'object' &&
            !Array.isArray(selection) &&
            Object.keys(selection as Record<string, unknown>).length === 1 &&
            (selection as { id?: unknown }).id === benchmarkCases.id

          const builder = Reflect.apply(target.select, target, args)
          return wrapBuilder(builder, isCaseIdQuery, false)
        }
      }

      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as TestDb
}

async function seedFullPanel(db: TestDb) {
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

  await db.insert(benchmarkModelWeightConfigs).values({
    slug: 'uniform-v1',
    name: 'Uniform',
    isActive: true,
  })

  const prompt1 = first(
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

  const pvs = []
  for (let i = 0; i < 5; i++) {
    const p =
      i === 0
        ? prompt1
        : first(
            await db
              .insert(prompts)
              .values({
                title: `Prompt ${i + 1}`,
                slug: `prompt-${i + 1}`,
                level: 'beginner',
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
          level: 'beginner',
          version: 1,
          contentMd: p.contentMd ?? `# ${p.title}`,
          contentHash: `hash-${i}-${Date.now()}`,
          promptContractVersion: '1.0',
          systemPromptSnapshot: 'You are a pragmatic assistant.',
        })
        .returning(),
    )

    await db.insert(benchmarkPromptVersionCategories).values([
      { promptVersionId: pv.id, categoryId: authCat.id, displayOrder: 1 },
      { promptVersionId: pv.id, categoryId: dbCat.id, displayOrder: 2 },
    ])

    pvs.push(pv)
  }

  const snapshots = []
  for (const llm of llmRows) {
    const ms = first(
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
    snapshots.push(ms)
  }

  const caseRows = []
  for (const pv of pvs) {
    await db.insert(benchmarkSeasonPrompts).values({ seasonId: season.id, promptVersionId: pv.id })
    for (const ms of snapshots) {
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

  return { season, caseRows, authCat, dbCat }
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

  it('should auto-publish a full run with valid responses', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('published')
    expect(summary.totalCases).toBe(15)
    expect(summary.completedCases).toBe(15)
    expect(summary.failedCases).toBe(0)
    expect(summary.invalidOutputCases).toBe(0)
    expect(summary.qc.passed).toBe(true)

    const run = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, summary.runId),
    })
    expect(run?.status).toBe('published')
    expect(run?.qcStatus).toBe('passed')
  })

  it('should be idempotent — same (season, date) returns same run', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary1 = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })
    const summary2 = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary1.runId).toBe(summary2.runId)

    const allRuns = await db
      .select()
      .from(benchmarkRuns)
      .where(
        and(eq(benchmarkRuns.seasonId, season.id), eq(benchmarkRuns.scheduledFor, '2026-03-10')),
      )
    expect(allRuns).toHaveLength(1)
  })

  it('should process only maxCases and keep the run resumable when work remains', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 4,
    })

    expect(summary.status).toBe('running')
    expect(summary.processedThisInvocation).toBe(4)
    expect(summary.completedCases).toBe(4)
    expect(summary.remainingCases).toBe(11)
    expect(summary.hasRemainingWork).toBe(true)
    expect(llmService.complete).toHaveBeenCalledTimes(4)

    const persistedRun = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, summary.runId),
    })
    expect(persistedRun?.status).toBe('pending')
    expect(persistedRun?.completedAt).toBeNull()
  })

  it('should resume the same run across chunked invocations without duplicate case results', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

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
    expect(firstSummary.hasRemainingWork).toBe(true)
    expect(secondSummary.status).toBe('published')
    expect(secondSummary.hasRemainingWork).toBe(false)
    expect(secondSummary.remainingCases).toBe(0)
    expect(secondSummary.completedCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(15)

    const runResults = await db
      .select({
        id: benchmarkCaseResults.id,
        caseId: benchmarkCaseResults.caseId,
      })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, firstSummary.runId))

    expect(runResults).toHaveLength(15)
    expect(new Set(runResults.map((result) => result.caseId)).size).toBe(15)
  })

  it('should finalize as qc_failed on the final chunk when QC does not pass', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('Just a plain response with no appendix tags', request),
    )

    const firstSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 10,
    })
    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 10,
    })

    expect(firstSummary.status).toBe('running')
    expect(firstSummary.invalidOutputCases).toBe(10)
    expect(firstSummary.hasRemainingWork).toBe(true)
    expect(secondSummary.status).toBe('qc_failed')
    expect(secondSummary.invalidOutputCases).toBe(15)
    expect(secondSummary.hasRemainingWork).toBe(false)
    expect(secondSummary.remainingCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(45)
  })

  it('should repair schema-validity failures into completed benchmark results', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const semanticallyInvalidAppendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.9,
        },
      ],
    })

    const repairedAppendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.9,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Good fit',
          confidence: 0.8,
        },
      ],
    })

    const llmService = createMockLlmService(async (_provider, request) => {
      if (request.model === 'openai/gpt-5.4-mini') {
        return mockCompletionForRequest(repairedAppendix, request, {
          provider: 'openai',
          returnedModel: 'openai/gpt-5.4-mini',
        })
      }

      return mockCompletionForRequest(
        `Use Clerk for auth.\n\n<preseason_benchmark_json>\n${semanticallyInvalidAppendix}\n</preseason_benchmark_json>`,
        request,
      )
    })

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('published')
    expect(summary.completedCases).toBe(15)
    expect(summary.invalidOutputCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(30)
    expect(
      llmService.complete.mock.calls.filter(
        ([, request]) => request.model === 'openai/gpt-5.4-mini',
      ),
    ).toHaveLength(15)
  })

  it('should repair tagless outputs into completed benchmark results', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const repairedAppendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.9,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Good fit',
          confidence: 0.8,
        },
      ],
    })

    const llmService = createMockLlmService(async (_provider, request) => {
      if (request.model === 'openai/gpt-5.4-mini') {
        return mockCompletionForRequest(repairedAppendix, request, {
          provider: 'openai',
          returnedModel: 'openai/gpt-5.4-mini',
        })
      }

      return mockCompletionForRequest('Use Clerk for auth and Supabase for the database.', request)
    })

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('published')
    expect(summary.completedCases).toBe(15)
    expect(summary.invalidOutputCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(30)
    expect(
      llmService.complete.mock.calls.filter(
        ([, request]) => request.model === 'openai/gpt-5.4-mini',
      ),
    ).toHaveLength(15)
  })

  it('should keep blank outputs invalid without attempting repair', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('   \n\t', request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('qc_failed')
    expect(summary.completedCases).toBe(0)
    expect(summary.invalidOutputCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(15)
    expect(
      llmService.complete.mock.calls.filter(
        ([, request]) => request.model === 'openai/gpt-5.4-mini',
      ),
    ).toHaveLength(0)
  })

  it('should not repair stray appendix-tag mentions into completed benchmark results', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(
        'Do not literally print <preseason_benchmark_json> in prose.',
        request,
      ),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('qc_failed')
    expect(summary.completedCases).toBe(0)
    expect(summary.invalidOutputCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(15)
    expect(
      llmService.complete.mock.calls.filter(
        ([, request]) => request.model === 'openai/gpt-5.4-mini',
      ),
    ).toHaveLength(0)
  })

  it('should repair outputs truncated immediately after the opening tag', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const repairedAppendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.9,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Good fit',
          confidence: 0.8,
        },
      ],
    })

    const llmService = createMockLlmService(async (_provider, request) => {
      if (request.model === 'openai/gpt-5.4-mini') {
        return mockCompletionForRequest(repairedAppendix, request, {
          provider: 'openai',
          returnedModel: 'openai/gpt-5.4-mini',
        })
      }

      return mockCompletionForRequest(
        'Use Clerk for auth and Supabase for the database.\n\n<preseason_benchmark_json>\n',
        request,
        {
          finishReason: 'length',
          usage: { promptTokens: 100, completionTokens: 1200, totalTokens: 1300 },
        },
      )
    })

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('published')
    expect(summary.completedCases).toBe(15)
    expect(summary.invalidOutputCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(30)

    const repairedResult = await db.query.benchmarkCaseResults.findFirst({
      where: eq(benchmarkCaseResults.runId, summary.runId),
    })

    expect(repairedResult?.parserVersion).toBe(REPAIR_PARSER_VERSION)
    expect(repairedResult?.naturalResponse).toBe(
      'Use Clerk for auth and Supabase for the database.',
    )
  })

  it('should repair truncated benchmark appendices with a secondary extraction pass', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const repairedAppendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.9,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Good fit',
          confidence: 0.8,
        },
      ],
    })

    const llmService = createMockLlmService(async (_provider, request) => {
      if (request.model === 'openai/gpt-5.4-mini') {
        return mockCompletionForRequest(repairedAppendix, request, {
          provider: 'openai',
          returnedModel: 'openai/gpt-5.4-mini',
        })
      }

      return mockCompletionForRequest(
        [
          'Use Clerk for auth and Supabase for the database.',
          '',
          '<preseason_benchmark_json>',
          '{"schema_version":"benchmark-v1","categories":[{"category_slug":"auth"',
          '',
          'Do not literally print <preseason_benchmark_json> in prose after the appendix.',
        ].join('\n'),
        request,
        {
          finishReason: 'length',
          usage: { promptTokens: 100, completionTokens: 1200, totalTokens: 1300 },
        },
      )
    })

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
    })

    expect(summary.status).toBe('published')
    expect(summary.completedCases).toBe(15)
    expect(summary.invalidOutputCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(30)

    const repairedResult = await db.query.benchmarkCaseResults.findFirst({
      where: eq(benchmarkCaseResults.runId, summary.runId),
    })

    expect(repairedResult?.parserVersion).toBe(REPAIR_PARSER_VERSION)
    expect(repairedResult?.naturalResponse).toBe(
      'Use Clerk for auth and Supabase for the database.',
    )
  })

  it('should recover stored invalid outputs before making a fresh benchmark call', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedFullPanel(db)
    const benchmarkCase = first(caseRows)

    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        trigger: 'manual',
        status: 'pending',
        expectedCaseCount: 1,
        qcSummaryJson: { snapshotCaseIds: [benchmarkCase.id] },
      })
      .returning()

    const storedRawResponse = 'Use Clerk for auth and Supabase for the database.'

    await db.insert(benchmarkCaseResults).values({
      seasonId: season.id,
      runId: run.id,
      caseId: benchmarkCase.id,
      status: 'invalid_output',
      rawResponse: storedRawResponse,
      requestedModelId: 'anthropic/claude-opus',
      returnedModelId: 'anthropic/claude-opus',
      provider: 'anthropic',
      finishReason: 'stop',
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      latencyMs: 1500,
      temperature: 0.2,
      topP: 1,
      maxTokens: 4096,
      parserVersion: 'strict-v3',
      systemPromptSnapshot: 'You are a pragmatic assistant.',
      errorMessage: 'Missing <preseason_benchmark_json> tags',
    })

    const repairedAppendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.9,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Good fit',
          confidence: 0.8,
        },
      ],
    })

    const llmService = createMockLlmService(async (_provider, request) => {
      if (request.model === 'openai/gpt-5.4-mini') {
        return mockCompletionForRequest(repairedAppendix, request, {
          provider: 'openai',
          returnedModel: 'openai/gpt-5.4-mini',
        })
      }

      throw new Error('Fresh benchmark call should not run')
    })

    const summary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      maxCases: 1,
    })

    expect(summary.completedCases).toBe(1)
    expect(summary.invalidOutputCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(1)

    const recoveredResult = await db.query.benchmarkCaseResults.findFirst({
      where: eq(benchmarkCaseResults.runId, run.id),
    })

    expect(recoveredResult?.status).toBe('completed')
    expect(recoveredResult?.parserVersion).toBe(REPAIR_PARSER_VERSION)
    expect(recoveredResult?.rawResponse).toBe(storedRawResponse)
  })

  it('should return the persisted summary for an already published run', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary1 = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })
    const summary2 = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary1.status).toBe('published')
    expect(summary2.status).toBe('published')
    expect(summary2.qc.passed).toBe(true)
    expect(summary2.completedCases).toBe(15)
    expect(summary2.invalidOutputCases).toBe(0)
    expect(llmService.complete).toHaveBeenCalledTimes(15)
  })

  it('should return the persisted summary for an already qc_failed run', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('Just a plain response with no appendix tags', request),
    )

    const summary1 = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })
    const summary2 = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary1.status).toBe('qc_failed')
    expect(summary2.status).toBe('qc_failed')
    expect(summary2.invalidOutputCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(30)
  })

  it('should not execute duplicate LLM calls while the same run is already running', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const firstCallBlocked = createDeferred()
    const firstCallStarted = createDeferred()

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount++
      if (callCount === 1) {
        firstCallStarted.resolve()
        await firstCallBlocked.promise
      }
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', { database: db, llmService })
    await firstCallStarted.promise

    const secondSummary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(secondSummary.status).toBe('running')
    expect(llmService.complete).toHaveBeenCalledTimes(1)

    firstCallBlocked.resolve()
    const firstSummary = await firstRunPromise

    expect(firstSummary.status).toBe('published')
    expect(llmService.complete).toHaveBeenCalledTimes(15)
  })

  it('should keep an active long-running run from being reclaimed as stale', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const firstCallBlocked = createDeferred()
    const firstCallStarted = createDeferred()

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount++
      if (callCount === 1) {
        firstCallStarted.resolve()
        await firstCallBlocked.promise
      }
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 20,
    })
    await firstCallStarted.promise
    const runBeforeSecondCall = await db.query.benchmarkRuns.findFirst({
      where: and(
        eq(benchmarkRuns.seasonId, season.id),
        eq(benchmarkRuns.scheduledFor, '2026-03-10'),
      ),
    })
    expect(runBeforeSecondCall).toBeDefined()
    expect(runBeforeSecondCall?.startedAt).toBeInstanceOf(Date)
    const startedAtBeforeHeartbeat = runBeforeSecondCall?.startedAt
    if (!startedAtBeforeHeartbeat) {
      throw new Error('Expected running benchmark run start time')
    }

    await wait(160)

    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 20,
    })
    const runAfterHeartbeat = await db.query.benchmarkRuns.findFirst({
      where: and(
        eq(benchmarkRuns.seasonId, season.id),
        eq(benchmarkRuns.scheduledFor, '2026-03-10'),
      ),
    })
    expect(runAfterHeartbeat?.startedAt?.getTime()).toBe(startedAtBeforeHeartbeat.getTime())

    expect(secondSummary.status).toBe('running')
    expect(llmService.complete).toHaveBeenCalledTimes(1)

    firstCallBlocked.resolve()
    const firstSummary = await firstRunPromise

    expect(firstSummary.status).toBe('published')
    expect(llmService.complete).toHaveBeenCalledTimes(15)
  })

  it('should refresh heartbeat metadata immediately when reclaiming a stale run', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedFullPanel(db)
    const caseIds = caseRows.map((benchmarkCase) => benchmarkCase.id)
    const staleHeartbeatAt = new Date('2026-03-10T00:00:00.000Z')
    const reclaimTime = new Date('2026-03-10T01:00:00.000Z')

    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        status: 'running',
        startedAt: staleHeartbeatAt,
        qcSummaryJson: {
          snapshotCaseIds: caseIds,
          lastHeartbeatAt: staleHeartbeatAt.toISOString(),
        },
        expectedCaseCount: caseIds.length,
      })
      .returning()

    if (!run) {
      throw new Error('Expected seeded stale benchmark run')
    }

    const firstCallBlocked = createDeferred()
    const firstCallStarted = createDeferred()

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount++
      if (callCount === 1) {
        firstCallStarted.resolve()
        await firstCallBlocked.promise
      }
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const firstRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      now: () => reclaimTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })
    await firstCallStarted.promise

    const reclaimedRun = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, run.id),
    })
    expect(reclaimedRun?.startedAt?.toISOString()).toBe(reclaimTime.toISOString())
    expect(reclaimedRun?.qcSummaryJson).toEqual(
      expect.objectContaining({
        snapshotCaseIds: caseIds,
        lastHeartbeatAt: reclaimTime.toISOString(),
      }),
    )

    const secondSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService,
      now: () => reclaimTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    expect(secondSummary.status).toBe('running')
    expect(llmService.complete).toHaveBeenCalledTimes(1)

    firstCallBlocked.resolve()
    const firstSummary = await firstRunPromise

    expect(firstSummary.status).toBe('published')
    expect(llmService.complete).toHaveBeenCalledTimes(15)
  })

  it('should stop a reclaimed worker from inheriting the new execution token before snapshot setup', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const caseIdQueryStarted = createDeferred()
    const allowCaseIdQuery = createDeferred()
    const staleWorkerDb = createDelayedCaseSnapshotDb(db, {
      caseIdQueryStarted,
      allowCaseIdQuery,
    })

    const staleWorkerService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('Just a plain response with no appendix tags', request),
    )

    const reclaimingWorkerFirstCallStarted = createDeferred()
    const reclaimingWorkerFirstCallBlocked = createDeferred()

    let reclaimingWorkerCallCount = 0
    const reclaimingWorkerService = createMockLlmService(async (_provider, request) => {
      reclaimingWorkerCallCount++
      if (reclaimingWorkerCallCount === 1) {
        reclaimingWorkerFirstCallStarted.resolve()
        await reclaimingWorkerFirstCallBlocked.promise
      }

      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const staleStartTime = new Date('2026-03-10T00:00:00.000Z')
    const reclaimTime = new Date('2026-03-10T01:00:00.000Z')

    const staleRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: staleWorkerDb,
      llmService: staleWorkerService,
      now: () => staleStartTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    await caseIdQueryStarted.promise

    const reclaimedRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService: reclaimingWorkerService,
      now: () => reclaimTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    await reclaimingWorkerFirstCallStarted.promise

    allowCaseIdQuery.resolve()
    const staleSummary = await staleRunPromise

    expect(staleWorkerService.complete).not.toHaveBeenCalled()
    expect(staleSummary.status).toBe('running')

    reclaimingWorkerFirstCallBlocked.resolve()
    const reclaimedSummary = await reclaimedRunPromise

    expect(staleSummary.runId).toBe(reclaimedSummary.runId)
    expect(reclaimedSummary.status).toBe('published')
    expect(reclaimedSummary.completedCases).toBe(15)
    expect(reclaimingWorkerService.complete).toHaveBeenCalledTimes(15)

    const persistedRun = await db.query.benchmarkRuns.findFirst({
      where: and(
        eq(benchmarkRuns.seasonId, season.id),
        eq(benchmarkRuns.scheduledFor, '2026-03-10'),
      ),
    })

    expect(persistedRun?.status).toBe('published')
    expect(persistedRun?.qcStatus).toBe('passed')
  })

  it('should ignore terminal updates from a stale worker after reclaim finalizes the run', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const staleWorkerBlocked = createDeferred()
    const staleWorkerPaused = createDeferred()

    let staleWorkerCallCount = 0
    const staleWorkerService = createMockLlmService(async (_provider, request) => {
      staleWorkerCallCount++
      if (staleWorkerCallCount === 2) {
        staleWorkerPaused.resolve()
        await staleWorkerBlocked.promise
      }

      return mockCompletionForRequest('Just a plain response with no appendix tags', request)
    })

    const reclaimingWorkerService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const staleStartTime = new Date('2026-03-10T00:00:00.000Z')
    const reclaimTime = new Date('2026-03-10T01:00:00.000Z')

    const staleRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService: staleWorkerService,
      now: () => staleStartTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    await staleWorkerPaused.promise

    const reclaimedSummary = await runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService: reclaimingWorkerService,
      now: () => reclaimTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    expect(reclaimedSummary.status).toBe('published')
    expect(reclaimedSummary.errors).toHaveLength(0)

    staleWorkerBlocked.resolve()
    const staleSummary = await staleRunPromise

    expect(staleSummary.status).toBe('published')
    expect(staleSummary.errors).toHaveLength(0)

    const persistedRun = await db.query.benchmarkRuns.findFirst({
      where: and(
        eq(benchmarkRuns.seasonId, season.id),
        eq(benchmarkRuns.scheduledFor, '2026-03-10'),
      ),
    })

    expect(persistedRun?.status).toBe('published')
    expect(persistedRun?.qcStatus).toBe('passed')
    expect(persistedRun?.errorLog).toBeNull()
    expect(reclaimingWorkerService.complete).toHaveBeenCalledTimes(15)
  })

  it('should stop a stale worker from inserting case results after reclaim', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const staleWorkerFirstCallStarted = createDeferred()
    const staleWorkerFirstCallBlocked = createDeferred()

    let staleWorkerCallCount = 0
    const staleWorkerService = createMockLlmService(async (_provider, request) => {
      staleWorkerCallCount++
      if (staleWorkerCallCount === 1) {
        staleWorkerFirstCallStarted.resolve()
        await staleWorkerFirstCallBlocked.promise
      }

      return mockCompletionForRequest('Just a plain response with no appendix tags', request)
    })

    const reclaimingWorkerFirstCallStarted = createDeferred()
    const reclaimingWorkerFirstCallBlocked = createDeferred()

    let reclaimingWorkerCallCount = 0
    const reclaimingWorkerService = createMockLlmService(async (_provider, request) => {
      reclaimingWorkerCallCount++
      if (reclaimingWorkerCallCount === 1) {
        reclaimingWorkerFirstCallStarted.resolve()
        await reclaimingWorkerFirstCallBlocked.promise
      }

      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const staleStartTime = new Date('2026-03-10T00:00:00.000Z')
    const reclaimTime = new Date('2026-03-10T01:00:00.000Z')

    const staleRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService: staleWorkerService,
      now: () => staleStartTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    await staleWorkerFirstCallStarted.promise

    const reclaimedRunPromise = runBenchmark(season.id, '2026-03-10', {
      database: db,
      llmService: reclaimingWorkerService,
      now: () => reclaimTime,
      runStaleAfterMs: 100,
      runHeartbeatIntervalMs: 60_000,
    })

    await reclaimingWorkerFirstCallStarted.promise

    staleWorkerFirstCallBlocked.resolve()
    await wait(150)
    reclaimingWorkerFirstCallBlocked.resolve()

    const staleSummary = await staleRunPromise
    const reclaimedSummary = await reclaimedRunPromise

    expect(reclaimedSummary.status).toBe('published')
    expect(reclaimedSummary.completedCases).toBe(15)
    expect(reclaimedSummary.invalidOutputCases).toBe(0)
    expect(staleWorkerService.complete).toHaveBeenCalledTimes(2)
    expect(staleSummary.runId).toBe(reclaimedSummary.runId)

    const invalidResults = await db
      .select({ id: benchmarkCaseResults.id })
      .from(benchmarkCaseResults)
      .where(
        and(
          eq(benchmarkCaseResults.runId, reclaimedSummary.runId),
          eq(benchmarkCaseResults.status, 'invalid_output'),
        ),
      )
    expect(invalidResults).toHaveLength(0)
  })

  it('should resume a partially completed run', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedFullPanel(db)

    const [run] = await db
      .insert(benchmarkRuns)
      .values({ seasonId: season.id, scheduledFor: '2026-03-10', status: 'running' })
      .returning()

    expect(run).toBeDefined()
    const runId = run?.id
    expect(runId).toBeDefined()

    const firstCase = caseRows[0]
    expect(firstCase).toBeDefined()
    if (!runId || !firstCase) {
      throw new Error('Expected seeded run and case')
    }

    await db.insert(benchmarkCaseResults).values({
      seasonId: season.id,
      runId,
      caseId: firstCase.id,
      status: 'completed',
      parserVersion: 'strict-v1',
    })

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.runId).toBe(runId)
    expect(summary.completedCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(14)
  })

  it('should resume a failed run using its stored case snapshot', async () => {
    const db = getTestDb()
    const { season, caseRows } = await seedFullPanel(db)
    const caseIds = caseRows.map((benchmarkCase) => benchmarkCase.id)

    const [run] = await db
      .insert(benchmarkRuns)
      .values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        status: 'failed',
        qcSummaryJson: { snapshotCaseIds: caseIds },
        expectedCaseCount: caseIds.length,
      })
      .returning()

    const firstCase = caseRows[0]
    if (!run || !firstCase) {
      throw new Error('Expected seeded run and case')
    }

    await db
      .update(benchmarkCases)
      .set({ isActive: false })
      .where(eq(benchmarkCases.id, firstCase.id))

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.runId).toBe(run.id)
    expect(summary.totalCases).toBe(15)
    expect(summary.completedCases).toBe(15)
    expect(llmService.complete).toHaveBeenCalledTimes(15)

    const resumedRun = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, run.id),
    })
    expect(resumedRun?.expectedCaseCount).toBe(caseIds.length)
  })

  it('should handle invalid output — missing tags', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('Just a plain response with no appendix tags', request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.invalidOutputCases).toBe(15)
    expect(summary.completedCases).toBe(0)

    const invalidResults = await db
      .select()
      .from(benchmarkCaseResults)
      .where(
        and(
          eq(benchmarkCaseResults.runId, summary.runId),
          eq(benchmarkCaseResults.status, 'invalid_output'),
        ),
      )
    expect(invalidResults).toHaveLength(15)
    expect(invalidResults[0]?.errorMessage).toContain('Missing')
  })

  it('should persist failedCaseCount as failed outcomes only', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest('Just a plain response with no appendix tags', request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.failedCases).toBe(0)
    expect(summary.invalidOutputCases).toBe(15)

    const run = await db.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, summary.runId),
    })
    expect(run?.failedCaseCount).toBe(0)
  })

  it('should handle LLM call failure', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    let callCount = 0
    const llmService = createMockLlmService(async (_provider, request) => {
      callCount++
      if (callCount <= 2) throw new Error('LLM service unavailable')
      return mockCompletionForRequest(buildValidResponse(['auth', 'database']), request)
    })

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.failedCases).toBe(2)
    expect(summary.completedCases).toBe(13)
    expect(summary.errors.length).toBeGreaterThanOrEqual(2)
    expect(summary.errors[0]).toContain('LLM service unavailable')
  })

  it('should roll back completed results when decision persistence fails', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const appendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'X'.repeat(300),
          reasoning: 'Too long',
          confidence: 0.7,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Fine',
          confidence: 0.9,
        },
      ],
    })
    const response = `Answer\n\n<preseason_benchmark_json>\n${appendix}\n</preseason_benchmark_json>`

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(response, request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.failedCases).toBe(15)
    expect(summary.completedCases).toBe(0)

    const completedResults = await db
      .select()
      .from(benchmarkCaseResults)
      .where(
        and(
          eq(benchmarkCaseResults.runId, summary.runId),
          eq(benchmarkCaseResults.status, 'completed'),
        ),
      )
    expect(completedResults).toHaveLength(0)

    const failedResults = await db
      .select()
      .from(benchmarkCaseResults)
      .where(
        and(
          eq(benchmarkCaseResults.runId, summary.runId),
          eq(benchmarkCaseResults.status, 'failed'),
        ),
      )
    expect(failedResults).toHaveLength(15)

    const decisions = await db
      .select()
      .from(benchmarkCaseDecisions)
      .innerJoin(
        benchmarkCaseResults,
        eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
      )
      .where(eq(benchmarkCaseResults.runId, summary.runId))
    expect(decisions).toHaveLength(0)
  })

  it('should create tool candidates for unresolved tools', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const appendix = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'SomeUnknownAuthTool',
          reasoning: 'New',
          confidence: 0.7,
        },
        {
          category_slug: 'database',
          decision: 'tool',
          tool: 'Supabase',
          reasoning: 'Great',
          confidence: 0.9,
        },
      ],
    })
    const response = `Answer\n\n<preseason_benchmark_json>\n${appendix}\n</preseason_benchmark_json>`

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(response, request),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })
    expect(summary.unresolvedToolCount).toBeGreaterThan(0)

    const candidates = await db
      .select()
      .from(toolCandidates)
      .where(eq(toolCandidates.normalizedName, 'someunknownauthtool'))
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.seenCount).toBeGreaterThanOrEqual(1)
  })

  it('should detect model drift and mark as invalid_output', async () => {
    const db = getTestDb()
    const { season } = await seedFullPanel(db)

    const llmService = createMockLlmService(async (_provider, request) =>
      mockCompletionForRequest(buildValidResponse(['auth', 'database']), request, {
        returnedModel: 'completely-different-model',
      }),
    )

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })

    expect(summary.invalidOutputCases).toBe(15)

    const results = await db
      .select()
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, summary.runId))
    for (const result of results) {
      expect(result.status).toBe('invalid_output')
      expect(result.errorMessage).toContain('Model drift')
    }
  })

  it('should handle empty season with no cases', async () => {
    const db = getTestDb()
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
        .values({ protocolId: protocol.id, slug: 'empty-season', name: 'Empty', status: 'active' })
        .returning(),
    )

    const llmService = createMockLlmService(async () => {
      throw new Error('Should not be called')
    })

    const summary = await runBenchmark(season.id, '2026-03-10', { database: db, llmService })
    expect(summary.status).toBe('qc_failed')
    expect(summary.totalCases).toBe(0)
    expect(summary.qc.passed).toBe(false)
  })
})
