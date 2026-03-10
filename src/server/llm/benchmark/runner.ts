import { and, count, countDistinct, eq, inArray, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db as defaultDb } from '~/server/db'
import type * as schema from '~/server/db/schema'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelWeightConfigs,
  benchmarkRuns,
  subcategories,
} from '~/server/db/schema'
import { checkModelDrift } from '~/server/llm/benchmark/model-drift'
import { PARSER_VERSION, parseBenchmarkResponse } from '~/server/llm/benchmark/parser'
import { buildBenchmarkPrompt } from '~/server/llm/benchmark/prompt-builder'
import { evaluateQc, type QcCheckResult } from '~/server/llm/benchmark/qc'
import {
  buildToolResolutionIndex,
  resolveToolWithCandidateQueue,
} from '~/server/llm/benchmark/tool-resolver'
import { LlmService } from '~/server/llm/service'
import { buildGenerationSystemPrompt } from '~/server/llm/service/system-prompt'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export type BenchmarkRunOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  now?: () => Date
  runStaleAfterMs?: number
  runHeartbeatIntervalMs?: number
}

export type BenchmarkRunSummaryStatus = 'completed' | 'failed' | 'qc_failed' | 'running'

export type BenchmarkRunSummary = {
  runId: string
  seasonId: string
  status: BenchmarkRunSummaryStatus
  totalCases: number
  completedCases: number
  failedCases: number
  invalidOutputCases: number
  unresolvedToolCount: number
  qc: QcCheckResult
  errors: string[]
}

type BenchmarkRunRecord = Awaited<ReturnType<typeof createOrLoadRun>>
type RunMetrics = Omit<BenchmarkRunSummary, 'runId' | 'seasonId' | 'status' | 'errors'>
// Resumable runs stash their frozen case ids here until a terminal QC payload replaces it.
type RunCaseSnapshot = {
  snapshotCaseIds: string[]
  lastHeartbeatAt?: string
}

const RUN_STALE_AFTER_MS = 30 * 60 * 1000
const RUN_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function normalizeSummaryStatus(status: BenchmarkRunRecord['status']): BenchmarkRunSummaryStatus {
  if (status === 'published') return 'completed'
  if (status === 'pending') return 'running'
  return status
}

function isRunStale(run: BenchmarkRunRecord, currentTime: Date, staleAfterMs: number) {
  if (run.status !== 'running') return false
  const lastHeartbeatAt = getRunHeartbeatAt(run)
  const staleSince = lastHeartbeatAt ?? run.startedAt

  if (!staleSince) return true
  return currentTime.getTime() - staleSince.getTime() >= staleAfterMs
}

async function findRunById(database: DatabaseClient, runId: string) {
  const run = await database.query.benchmarkRuns.findFirst({
    where: eq(benchmarkRuns.id, runId),
  })

  if (!run) throw new Error('Benchmark run not found')
  return run
}

async function getRunTotalCases(
  database: DatabaseClient,
  seasonId: string,
  expectedCaseCount: number | null,
) {
  if (expectedCaseCount != null) return expectedCaseCount

  const [row] = await database
    .select({ cnt: count() })
    .from(benchmarkCases)
    .where(and(eq(benchmarkCases.seasonId, seasonId), eq(benchmarkCases.isActive, true)))

  return Number(row?.cnt ?? 0)
}

async function calculateRunMetrics(
  database: DatabaseClient,
  runId: string,
  totalCases: number,
): Promise<RunMetrics> {
  const statusCounts = await database
    .select({ status: benchmarkCaseResults.status, cnt: count() })
    .from(benchmarkCaseResults)
    .where(eq(benchmarkCaseResults.runId, runId))
    .groupBy(benchmarkCaseResults.status)

  const countByStatus = new Map(statusCounts.map((row) => [row.status, Number(row.cnt)]))
  const completedCases = countByStatus.get('completed') ?? 0
  const failedCases = countByStatus.get('failed') ?? 0
  const invalidOutputCases = countByStatus.get('invalid_output') ?? 0

  let unresolvedToolCount = 0
  let totalToolDecisions = 0

  if (completedCases > 0) {
    const [unresolvedRow] = await database
      .select({ cnt: count() })
      .from(benchmarkCaseDecisions)
      .innerJoin(
        benchmarkCaseResults,
        eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
      )
      .where(
        and(
          eq(benchmarkCaseResults.runId, runId),
          eq(benchmarkCaseDecisions.resolutionStatus, 'unresolved_tool'),
        ),
      )

    unresolvedToolCount = Number(unresolvedRow?.cnt ?? 0)

    const [toolDecisionRow] = await database
      .select({ cnt: count() })
      .from(benchmarkCaseDecisions)
      .innerJoin(
        benchmarkCaseResults,
        eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
      )
      .where(
        and(eq(benchmarkCaseResults.runId, runId), eq(benchmarkCaseDecisions.decisionType, 'tool')),
      )

    totalToolDecisions = Number(toolDecisionRow?.cnt ?? 0)
  }

  const [distinctModelsRow] = await database
    .select({ cnt: countDistinct(benchmarkCases.modelSnapshotId) })
    .from(benchmarkCaseResults)
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .where(and(eq(benchmarkCaseResults.runId, runId), eq(benchmarkCaseResults.status, 'completed')))

  const [distinctPromptsRow] = await database
    .select({ cnt: countDistinct(benchmarkCases.promptVersionId) })
    .from(benchmarkCaseResults)
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .where(and(eq(benchmarkCaseResults.runId, runId), eq(benchmarkCaseResults.status, 'completed')))

  const distinctModelSnapshots = Number(distinctModelsRow?.cnt ?? 0)
  const distinctPromptVersions = Number(distinctPromptsRow?.cnt ?? 0)

  const qc = evaluateQc({
    totalCases,
    completedCases,
    failedCases,
    invalidOutputCases,
    unresolvedToolDecisions: unresolvedToolCount,
    totalToolDecisions,
    distinctModelSnapshots,
    distinctPromptVersions,
  })

  return {
    totalCases,
    completedCases,
    failedCases,
    invalidOutputCases,
    unresolvedToolCount,
    qc,
  }
}

async function buildRunSummary(
  database: DatabaseClient,
  run: BenchmarkRunRecord,
  seasonId: string,
): Promise<BenchmarkRunSummary> {
  const totalCases = await getRunTotalCases(database, seasonId, run.expectedCaseCount ?? null)
  const metrics = await calculateRunMetrics(database, run.id, totalCases)

  return {
    runId: run.id,
    seasonId,
    status: normalizeSummaryStatus(run.status),
    ...metrics,
    errors: run.errorLog ? run.errorLog.split('\n').filter((line) => line.length > 0) : [],
  }
}

async function claimRunExecution(
  database: DatabaseClient,
  runId: string,
  currentTime: Date,
  staleAfterMs: number,
): Promise<{ run: BenchmarkRunRecord; execute: boolean }> {
  while (true) {
    const run = await findRunById(database, runId)

    if (run.status === 'completed' || run.status === 'published' || run.status === 'qc_failed') {
      return { run, execute: false }
    }

    if (run.status === 'running' && !isRunStale(run, currentTime, staleAfterMs)) {
      return { run, execute: false }
    }

    let whereClause: ReturnType<typeof and> | undefined

    if (run.status === 'pending' || run.status === 'failed') {
      whereClause = and(eq(benchmarkRuns.id, run.id), eq(benchmarkRuns.status, run.status))
    } else if (run.status === 'running') {
      whereClause = run.startedAt
        ? and(
            eq(benchmarkRuns.id, run.id),
            eq(benchmarkRuns.status, 'running'),
            eq(benchmarkRuns.startedAt, run.startedAt),
          )
        : and(
            eq(benchmarkRuns.id, run.id),
            eq(benchmarkRuns.status, 'running'),
            isNull(benchmarkRuns.startedAt),
          )
    }

    if (!whereClause) {
      return { run, execute: false }
    }

    const [claimedRun] = await database
      .update(benchmarkRuns)
      .set({
        status: 'running',
        startedAt: currentTime,
        completedAt: null,
      })
      .where(whereClause)
      .returning()

    if (claimedRun) {
      return { run: claimedRun, execute: true }
    }
  }
}

function getRunCaseSnapshot(run: BenchmarkRunRecord): RunCaseSnapshot | null {
  const qcSummary = run.qcSummaryJson
  if (!qcSummary || typeof qcSummary !== 'object' || Array.isArray(qcSummary)) {
    return null
  }

  const snapshotCaseIds = (qcSummary as Partial<RunCaseSnapshot>).snapshotCaseIds
  const lastHeartbeatAt = (qcSummary as Partial<RunCaseSnapshot>).lastHeartbeatAt

  if (!Array.isArray(snapshotCaseIds) || !snapshotCaseIds.every((id) => typeof id === 'string')) {
    return null
  }

  if (typeof lastHeartbeatAt !== 'string') {
    return { snapshotCaseIds }
  }

  return { snapshotCaseIds, lastHeartbeatAt }
}

function getRunHeartbeatAt(run: BenchmarkRunRecord): Date | null {
  const qcSummary = run.qcSummaryJson
  if (!qcSummary || typeof qcSummary !== 'object' || Array.isArray(qcSummary)) {
    return null
  }

  const heartbeatAt = (qcSummary as { lastHeartbeatAt?: unknown }).lastHeartbeatAt
  if (typeof heartbeatAt !== 'string') return null

  const parsed = new Date(heartbeatAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildRunCaseSummaryPatch(
  run: BenchmarkRunRecord,
  update: Partial<RunCaseSnapshot>,
): Record<string, unknown> {
  const qcSummary = run.qcSummaryJson
  const base =
    qcSummary && typeof qcSummary === 'object' && !Array.isArray(qcSummary) ? qcSummary : {}
  return { ...(base as Record<string, unknown>), ...update }
}

async function loadRunCases(database: DatabaseClient, run: BenchmarkRunRecord, seasonId: string) {
  const caseIds =
    getRunCaseSnapshot(run)?.snapshotCaseIds ??
    (
      await database
        .select({ id: benchmarkCases.id })
        .from(benchmarkCases)
        .where(and(eq(benchmarkCases.seasonId, seasonId), eq(benchmarkCases.isActive, true)))
        .orderBy(benchmarkCases.promptVersionId, benchmarkCases.modelSnapshotId, benchmarkCases.id)
    ).map((row) => row.id)

  if (getRunCaseSnapshot(run) == null) {
    const latestRun = await database.query.benchmarkRuns.findFirst({
      where: eq(benchmarkRuns.id, run.id),
    })

    if (!latestRun) throw new Error('Benchmark run not found')

    const nextQcSummary = buildRunCaseSummaryPatch(latestRun, { snapshotCaseIds: caseIds })

    await database
      .update(benchmarkRuns)
      .set({
        qcSummaryJson: nextQcSummary,
        expectedCaseCount: caseIds.length,
      })
      .where(eq(benchmarkRuns.id, run.id))
    run.qcSummaryJson = nextQcSummary
  } else if (run.expectedCaseCount == null) {
    await database
      .update(benchmarkRuns)
      .set({ expectedCaseCount: caseIds.length })
      .where(eq(benchmarkRuns.id, run.id))
  }

  if (caseIds.length === 0) {
    return []
  }

  const cases = await database.query.benchmarkCases.findMany({
    where: and(eq(benchmarkCases.seasonId, seasonId), inArray(benchmarkCases.id, caseIds)),
    with: {
      promptVersion: { with: { categories: true } },
      modelSnapshot: true,
    },
  })

  if (cases.length !== caseIds.length) {
    throw new Error('Benchmark run case snapshot no longer matches stored benchmark cases')
  }

  const orderById = new Map(caseIds.map((id, index) => [id, index]))
  cases.sort((left, right) => {
    const leftIndex = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })

  return cases
}

function startRunHeartbeat(
  database: DatabaseClient,
  run: BenchmarkRunRecord,
  now: () => Date,
  heartbeatIntervalMs: number,
) {
  let inFlightHeartbeat = Promise.resolve()
  let heartbeatError: unknown = null

  const heartbeat = () => {
    inFlightHeartbeat = inFlightHeartbeat
      .catch(() => undefined)
      .then(async () => {
        const heartbeatAt = now().toISOString()
        await database
          .update(benchmarkRuns)
          .set({
            qcSummaryJson: buildRunCaseSummaryPatch(run, { lastHeartbeatAt: heartbeatAt }),
          })
          .where(and(eq(benchmarkRuns.id, run.id), eq(benchmarkRuns.status, 'running')))
      })
      .catch((error) => {
        heartbeatError ??= error
      })

    return inFlightHeartbeat
  }

  const timer = setInterval(() => {
    void heartbeat()
  }, heartbeatIntervalMs)
  timer.unref?.()

  return {
    stop: async () => {
      clearInterval(timer)
      await inFlightHeartbeat
      if (heartbeatError) {
        throw heartbeatError
      }
    },
  }
}

async function createOrLoadRun(database: DatabaseClient, seasonId: string, scheduledFor: string) {
  const [inserted] = await database
    .insert(benchmarkRuns)
    .values({ seasonId, scheduledFor, trigger: 'cron', status: 'pending' })
    .onConflictDoNothing()
    .returning()

  if (inserted) return inserted

  const existing = await database.query.benchmarkRuns.findFirst({
    where: and(eq(benchmarkRuns.seasonId, seasonId), eq(benchmarkRuns.scheduledFor, scheduledFor)),
  })

  if (!existing) throw new Error('Failed to create or load benchmark run')
  return existing
}

export async function runBenchmark(
  seasonId: string,
  scheduledFor: string,
  options: BenchmarkRunOptions = {},
): Promise<BenchmarkRunSummary> {
  const database = options.database ?? defaultDb
  const llmService = options.llmService ?? new LlmService()
  const now = options.now ?? (() => new Date())
  const runStaleAfterMs = options.runStaleAfterMs ?? RUN_STALE_AFTER_MS
  const runHeartbeatIntervalMs = options.runHeartbeatIntervalMs ?? RUN_HEARTBEAT_INTERVAL_MS

  const initialRun = await createOrLoadRun(database, seasonId, scheduledFor)
  const currentTime = now()
  const { run, execute } = await claimRunExecution(
    database,
    initialRun.id,
    currentTime,
    runStaleAfterMs,
  )

  if (!execute) {
    return await buildRunSummary(database, run, seasonId)
  }

  try {
    return await executeRun(database, llmService, now, runHeartbeatIntervalMs, run, seasonId)
  } catch (error) {
    const message = getErrorMessage(error)
    await database
      .update(benchmarkRuns)
      .set({
        status: 'failed',
        completedAt: now(),
        errorLog: message,
      })
      .where(eq(benchmarkRuns.id, run.id))
    throw error
  }
}

async function executeRun(
  database: DatabaseClient,
  llmService: LlmService,
  now: () => Date,
  runHeartbeatIntervalMs: number,
  run: BenchmarkRunRecord,
  seasonId: string,
): Promise<BenchmarkRunSummary> {
  const heartbeat = startRunHeartbeat(database, run, now, runHeartbeatIntervalMs)

  try {
    const weightConfig = await database.query.benchmarkModelWeightConfigs.findFirst({
      where: eq(benchmarkModelWeightConfigs.isActive, true),
    })

    if (weightConfig) {
      await database
        .update(benchmarkRuns)
        .set({ weightConfigId: weightConfig.id })
        .where(eq(benchmarkRuns.id, run.id))
    }

    const allCases = await loadRunCases(database, run, seasonId)

    if (allCases.length === 0) {
      const qc = evaluateQc({
        totalCases: 0,
        completedCases: 0,
        failedCases: 0,
        invalidOutputCases: 0,
        unresolvedToolDecisions: 0,
        totalToolDecisions: 0,
        distinctModelSnapshots: 0,
        distinctPromptVersions: 0,
      })

      await database
        .update(benchmarkRuns)
        .set({
          status: 'qc_failed',
          completedAt: now(),
          completedCaseCount: 0,
          failedCaseCount: 0,
          qcStatus: 'failed',
          qcSummaryJson: qc,
        })
        .where(eq(benchmarkRuns.id, run.id))

      return {
        runId: run.id,
        seasonId,
        status: 'qc_failed',
        totalCases: 0,
        completedCases: 0,
        failedCases: 0,
        invalidOutputCases: 0,
        unresolvedToolCount: 0,
        qc,
        errors: [],
      }
    }

    const allSubcategories = await database
      .select({ id: subcategories.id, slug: subcategories.slug })
      .from(subcategories)

    const categorySlugById = new Map(allSubcategories.map((s) => [s.id, s.slug]))

    const existingResults = await database
      .select({ caseId: benchmarkCaseResults.caseId, status: benchmarkCaseResults.status })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, run.id))

    const completedCaseIds = new Set(
      existingResults.filter((r) => r.status === 'completed').map((r) => r.caseId),
    )
    const retryableCaseIds = existingResults
      .filter((r) => r.status === 'failed' || r.status === 'invalid_output')
      .map((r) => r.caseId)

    if (retryableCaseIds.length > 0) {
      await database
        .delete(benchmarkCaseResults)
        .where(
          and(
            eq(benchmarkCaseResults.runId, run.id),
            inArray(benchmarkCaseResults.caseId, retryableCaseIds),
          ),
        )
    }

    const pendingCases = allCases.filter((c) => !completedCaseIds.has(c.id))

    const toolIndex = await buildToolResolutionIndex(database)

    const errors: string[] = []

    for (const benchmarkCase of pendingCases) {
      try {
        const { promptVersion, modelSnapshot } = benchmarkCase

        const eligibleCategorySlugs = promptVersion.categories
          .map((c) => categorySlugById.get(c.categoryId))
          .filter((slug): slug is string => slug !== undefined)

        if (eligibleCategorySlugs.length === 0) {
          throw new Error('No eligible category slugs found for prompt version')
        }

        const userPrompt = buildBenchmarkPrompt(
          promptVersion.contentMd ?? '',
          eligibleCategorySlugs,
        )
        const systemPrompt =
          promptVersion.systemPromptSnapshot ??
          buildGenerationSystemPrompt(
            promptVersion.level as
              | 'vibe-coder'
              | 'software-dev-beginner'
              | 'software-dev-experienced',
          )

        const completion = await llmService.complete(modelSnapshot.provider, {
          model: modelSnapshot.requestedModelId,
          systemPrompt,
          userPrompt,
          temperature: modelSnapshot.temperature ?? undefined,
          topP: modelSnapshot.topP ?? undefined,
          maxTokens: modelSnapshot.maxTokens ?? undefined,
          seed: modelSnapshot.seed ?? undefined,
        })

        const drift = checkModelDrift(modelSnapshot.requestedModelId, completion.returnedModel)

        if (drift.hasDrift) {
          const [result] = await database
            .insert(benchmarkCaseResults)
            .values({
              seasonId,
              runId: run.id,
              caseId: benchmarkCase.id,
              status: 'invalid_output',
              rawResponse: completion.content,
              requestedModelId: modelSnapshot.requestedModelId,
              returnedModelId: completion.returnedModel,
              provider: completion.provider,
              finishReason: completion.finishReason,
              promptTokens: completion.usage.promptTokens,
              completionTokens: completion.usage.completionTokens,
              totalTokens: completion.usage.totalTokens,
              latencyMs: completion.latencyMs,
              temperature: modelSnapshot.temperature,
              topP: modelSnapshot.topP,
              maxTokens: modelSnapshot.maxTokens,
              parserVersion: PARSER_VERSION,
              systemPromptSnapshot: systemPrompt,
              errorMessage: `Model drift detected: requested ${drift.requestedModel}, got ${drift.returnedModel}`,
            })
            .onConflictDoNothing()
            .returning()

          if (!result) continue
          errors.push(
            `[case ${benchmarkCase.id}] Model drift: ${drift.requestedModel} → ${drift.returnedModel}`,
          )
          continue
        }

        const parseResult = parseBenchmarkResponse(completion.content, eligibleCategorySlugs)

        if (parseResult.status === 'ok') {
          const categoryIdBySlug = new Map(
            promptVersion.categories.map((c) => [categorySlugById.get(c.categoryId), c.categoryId]),
          )

          const caseResult = await database.transaction(async (tx) => {
            const [insertedCaseResult] = await tx
              .insert(benchmarkCaseResults)
              .values({
                seasonId,
                runId: run.id,
                caseId: benchmarkCase.id,
                status: 'completed',
                naturalResponse: parseResult.naturalResponse,
                appendixRaw: parseResult.rawAppendix,
                appendixJson: parseResult.appendix,
                rawResponse: completion.content,
                requestedModelId: modelSnapshot.requestedModelId,
                returnedModelId: completion.returnedModel,
                provider: completion.provider,
                finishReason: completion.finishReason,
                promptTokens: completion.usage.promptTokens,
                completionTokens: completion.usage.completionTokens,
                totalTokens: completion.usage.totalTokens,
                latencyMs: completion.latencyMs,
                temperature: modelSnapshot.temperature,
                topP: modelSnapshot.topP,
                maxTokens: modelSnapshot.maxTokens,
                parserVersion: PARSER_VERSION,
                systemPromptSnapshot: systemPrompt,
                errorMessage: null,
              })
              .onConflictDoNothing()
              .returning()

            if (!insertedCaseResult) return null

            for (const decision of parseResult.appendix.categories) {
              const categoryId = categoryIdBySlug.get(decision.category_slug)
              if (!categoryId) continue

              if (decision.decision === 'tool' && decision.tool) {
                const resolved = await resolveToolWithCandidateQueue(
                  tx,
                  decision.tool,
                  toolIndex,
                  categoryId,
                )

                await tx
                  .insert(benchmarkCaseDecisions)
                  .values({
                    caseResultId: insertedCaseResult.id,
                    categoryId,
                    decisionType: 'tool',
                    toolId: resolved.status === 'resolved' ? resolved.toolId : null,
                    rawToolName: decision.tool,
                    reasoning: decision.reasoning,
                    selfReportedConfidence: decision.confidence,
                    resolutionStatus:
                      resolved.status === 'resolved' ? 'resolved' : 'unresolved_tool',
                  })
                  .onConflictDoNothing()
              } else {
                await tx
                  .insert(benchmarkCaseDecisions)
                  .values({
                    caseResultId: insertedCaseResult.id,
                    categoryId,
                    decisionType: 'none',
                    toolId: null,
                    rawToolName: null,
                    reasoning: decision.reasoning,
                    selfReportedConfidence: decision.confidence,
                    resolutionStatus: 'resolved',
                  })
                  .onConflictDoNothing()
              }
            }

            return insertedCaseResult
          })

          if (!caseResult) continue
        } else {
          const [caseResult] = await database
            .insert(benchmarkCaseResults)
            .values({
              seasonId,
              runId: run.id,
              caseId: benchmarkCase.id,
              status: 'invalid_output',
              naturalResponse: null,
              appendixRaw: null,
              appendixJson: null,
              rawResponse: completion.content,
              requestedModelId: modelSnapshot.requestedModelId,
              returnedModelId: completion.returnedModel,
              provider: completion.provider,
              finishReason: completion.finishReason,
              promptTokens: completion.usage.promptTokens,
              completionTokens: completion.usage.completionTokens,
              totalTokens: completion.usage.totalTokens,
              latencyMs: completion.latencyMs,
              temperature: modelSnapshot.temperature,
              topP: modelSnapshot.topP,
              maxTokens: modelSnapshot.maxTokens,
              parserVersion: PARSER_VERSION,
              systemPromptSnapshot: systemPrompt,
              errorMessage: parseResult.reason,
            })
            .onConflictDoNothing()
            .returning()

          if (!caseResult) continue
          errors.push(`[case ${benchmarkCase.id}] Invalid output: ${parseResult.reason}`)
        }
      } catch (error) {
        const message = getErrorMessage(error)
        errors.push(`[case ${benchmarkCase.id}] ${message}`)

        await database
          .insert(benchmarkCaseResults)
          .values({
            seasonId,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'failed',
            errorMessage: message,
            parserVersion: PARSER_VERSION,
          })
          .onConflictDoNothing()
      }
    }

    const metrics = await calculateRunMetrics(database, run.id, allCases.length)
    const finalStatus = metrics.qc.passed ? 'completed' : 'qc_failed'

    await database
      .update(benchmarkRuns)
      .set({
        status: finalStatus,
        completedAt: now(),
        completedCaseCount: metrics.completedCases,
        failedCaseCount: metrics.failedCases,
        qcStatus: metrics.qc.passed ? 'passed' : 'failed',
        qcSummaryJson: metrics.qc,
        errorLog: errors.length > 0 ? errors.join('\n') : null,
      })
      .where(eq(benchmarkRuns.id, run.id))

    return {
      runId: run.id,
      seasonId,
      status: finalStatus,
      ...metrics,
      errors,
    }
  } finally {
    await heartbeat.stop()
  }
}
