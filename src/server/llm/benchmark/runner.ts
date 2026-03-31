import { randomUUID } from 'node:crypto'
import { and, count, countDistinct, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { serverSettings } from '~/constants/server-settings'
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
import {
  PARSER_VERSION,
  parseBenchmarkResponse,
  shouldRepairBenchmarkParseFailure,
} from '~/server/llm/benchmark/parser'
import { buildBenchmarkPrompt } from '~/server/llm/benchmark/prompt-builder'
import { evaluateQc, type QcCheckResult } from '~/server/llm/benchmark/qc'
import { REPAIR_PARSER_VERSION, repairBenchmarkResponse } from '~/server/llm/benchmark/repair'
import type { BenchmarkAppendix } from '~/server/llm/benchmark/schema'
import {
  buildToolResolutionIndex,
  resolveToolWithCandidateQueue,
} from '~/server/llm/benchmark/tool-resolver'
import type { PromptLevel } from '~/server/llm/prompts'
import { LlmService } from '~/server/llm/service'
import { buildGenerationSystemPrompt } from '~/server/llm/service/system-prompt'

type DatabaseClient = PostgresJsDatabase<typeof schema>
type BenchmarkCaseResultRecord = typeof benchmarkCaseResults.$inferSelect
type BenchmarkCaseResultWriteMetadata = Pick<
  BenchmarkCaseResultRecord,
  | 'rawResponse'
  | 'requestedModelId'
  | 'returnedModelId'
  | 'provider'
  | 'finishReason'
  | 'promptTokens'
  | 'completionTokens'
  | 'totalTokens'
  | 'latencyMs'
  | 'temperature'
  | 'topP'
  | 'maxTokens'
  | 'systemPromptSnapshot'
>

export type BenchmarkRunOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  now?: () => Date
  runStaleAfterMs?: number
  runHeartbeatIntervalMs?: number
  maxCases?: number
}

export type BenchmarkRunSummaryStatus =
  | 'completed'
  | 'failed'
  | 'published'
  | 'qc_failed'
  | 'running'

export type BenchmarkRunSummary = {
  runId: string
  seasonId: string
  scheduledFor: string
  status: BenchmarkRunSummaryStatus
  totalCases: number
  completedCases: number
  failedCases: number
  invalidOutputCases: number
  unresolvedToolCount: number
  processedThisInvocation: number
  remainingCases: number
  hasRemainingWork: boolean
  qc: QcCheckResult
  errors: string[]
}

type BenchmarkRunRecord = Awaited<ReturnType<typeof createOrLoadRun>>
type RunMetrics = {
  totalCases: number
  completedCases: number
  failedCases: number
  invalidOutputCases: number
  unresolvedToolCount: number
  qc: QcCheckResult
}

type ResolvedBenchmarkOutput =
  | {
      status: 'completed'
      appendix: BenchmarkAppendix
      rawAppendix: string
      naturalResponse: string
      parserVersion: string
    }
  | {
      status: 'invalid_output'
      invalidReason: string
      parserVersion: string
    }
// Resumable runs stash their frozen case ids here until a terminal QC payload replaces it.
type RunCaseSnapshot = {
  snapshotCaseIds: string[]
  lastHeartbeatAt?: string
  executionToken?: string
}

const RUN_STALE_AFTER_MS = serverSettings.benchmark.staleRunThresholdMs
const RUN_HEARTBEAT_INTERVAL_MS = serverSettings.benchmark.heartbeatIntervalMs

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function resolveBenchmarkOutput(
  llmService: LlmService,
  options: {
    promptContentMd: string
    rawResponse: string
    eligibleCategorySlugs: string[]
  },
): Promise<ResolvedBenchmarkOutput> {
  const parseResult = parseBenchmarkResponse(options.rawResponse, options.eligibleCategorySlugs)

  if (parseResult.status === 'ok') {
    return {
      status: 'completed',
      appendix: parseResult.appendix,
      rawAppendix: parseResult.rawAppendix,
      naturalResponse: parseResult.naturalResponse,
      parserVersion: PARSER_VERSION,
    }
  }

  const originalParseReason = parseResult.reason
  if (!shouldRepairBenchmarkParseFailure(parseResult)) {
    return {
      status: 'invalid_output',
      invalidReason: originalParseReason,
      parserVersion: PARSER_VERSION,
    }
  }

  try {
    const repaired = await repairBenchmarkResponse(llmService, {
      promptContentMd: options.promptContentMd,
      parseFailureReason: originalParseReason,
      rawResponse: options.rawResponse,
      repairBoundaryIdx: parseResult.repairBoundaryIdx,
      eligibleCategorySlugs: options.eligibleCategorySlugs,
    })

    if (repaired.status === 'recovered') {
      return {
        status: 'completed',
        appendix: repaired.appendix,
        rawAppendix: repaired.rawAppendix,
        naturalResponse: repaired.naturalResponse,
        parserVersion: REPAIR_PARSER_VERSION,
      }
    }

    return {
      status: 'invalid_output',
      invalidReason: `${originalParseReason}; ${repaired.reason}`,
      parserVersion: PARSER_VERSION,
    }
  } catch (error) {
    return {
      status: 'invalid_output',
      invalidReason: `${originalParseReason}; Repair attempt failed: ${getErrorMessage(error)}`,
      parserVersion: PARSER_VERSION,
    }
  }
}

async function insertCompletedBenchmarkCaseResult(
  tx: DatabaseClient,
  options: {
    seasonId: string
    runId: string
    caseId: string
    appendix: BenchmarkAppendix
    rawAppendix: string
    naturalResponse: string
    parserVersion: string
    metadata: BenchmarkCaseResultWriteMetadata
    categoryIdBySlug: Map<string, string>
    toolIndex: Awaited<ReturnType<typeof buildToolResolutionIndex>>
  },
) {
  const [insertedCaseResult] = await tx
    .insert(benchmarkCaseResults)
    .values({
      seasonId: options.seasonId,
      runId: options.runId,
      caseId: options.caseId,
      status: 'completed',
      naturalResponse: options.naturalResponse,
      appendixRaw: options.rawAppendix,
      appendixJson: options.appendix,
      rawResponse: options.metadata.rawResponse,
      requestedModelId: options.metadata.requestedModelId,
      returnedModelId: options.metadata.returnedModelId,
      provider: options.metadata.provider,
      finishReason: options.metadata.finishReason,
      promptTokens: options.metadata.promptTokens,
      completionTokens: options.metadata.completionTokens,
      totalTokens: options.metadata.totalTokens,
      latencyMs: options.metadata.latencyMs,
      temperature: options.metadata.temperature,
      topP: options.metadata.topP,
      maxTokens: options.metadata.maxTokens,
      parserVersion: options.parserVersion,
      systemPromptSnapshot: options.metadata.systemPromptSnapshot,
      errorMessage: null,
    })
    .onConflictDoNothing()
    .returning()

  if (!insertedCaseResult) return null

  for (const decision of options.appendix.categories) {
    const categoryId = options.categoryIdBySlug.get(decision.category_slug)
    if (!categoryId) continue

    if (decision.decision === 'tool' && decision.tool) {
      const resolved = await resolveToolWithCandidateQueue(
        tx,
        decision.tool,
        options.toolIndex,
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
          resolutionStatus: resolved.status === 'resolved' ? 'resolved' : 'unresolved_tool',
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
}

function normalizeSummaryStatus(status: BenchmarkRunRecord['status']): BenchmarkRunSummaryStatus {
  if (status === 'pending') return 'running'
  return status
}

function normalizeMaxCases(maxCases: number | undefined): number | null {
  if (maxCases == null) {
    return null
  }

  if (!Number.isInteger(maxCases) || maxCases <= 0) {
    throw new Error('maxCases must be a positive integer')
  }

  return maxCases
}

function calculateRemainingCases(metrics: RunMetrics): number {
  const processed = metrics.completedCases + metrics.failedCases + metrics.invalidOutputCases
  return Math.max(metrics.totalCases - processed, 0)
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
  processedThisInvocation = 0,
): Promise<BenchmarkRunSummary> {
  const totalCases = await getRunTotalCases(database, seasonId, run.expectedCaseCount ?? null)
  const metrics = await calculateRunMetrics(database, run.id, totalCases)
  const remainingCases = calculateRemainingCases(metrics)

  return {
    runId: run.id,
    seasonId,
    scheduledFor: run.scheduledFor,
    status: normalizeSummaryStatus(run.status),
    ...metrics,
    processedThisInvocation,
    remainingCases,
    hasRemainingWork: remainingCases > 0,
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
      whereClause = and(
        eq(benchmarkRuns.id, run.id),
        eq(benchmarkRuns.status, 'running'),
        getRunStartedAtClaimClause(run),
        getRunHeartbeatClaimClause(run),
      )
    }

    if (!whereClause) {
      return { run, execute: false }
    }

    const claimedHeartbeatAt = currentTime.toISOString()
    const executionToken = randomUUID()
    const [claimedRun] = await database
      .update(benchmarkRuns)
      .set({
        status: 'running',
        startedAt: currentTime,
        completedAt: null,
        qcSummaryJson: buildRunCaseSummaryPatch(run, {
          executionToken,
          lastHeartbeatAt: claimedHeartbeatAt,
        }),
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

function getRunExecutionToken(run: Pick<BenchmarkRunRecord, 'qcSummaryJson'>): string | null {
  const qcSummary = run.qcSummaryJson
  if (!qcSummary || typeof qcSummary !== 'object' || Array.isArray(qcSummary)) {
    return null
  }

  const executionToken = (qcSummary as { executionToken?: unknown }).executionToken
  return typeof executionToken === 'string' && executionToken.length > 0 ? executionToken : null
}

function getRunHeartbeatClaimClause(run: BenchmarkRunRecord) {
  if (
    run.qcSummaryJson &&
    typeof run.qcSummaryJson === 'object' &&
    !Array.isArray(run.qcSummaryJson)
  ) {
    return eq(benchmarkRuns.qcSummaryJson, run.qcSummaryJson as Record<string, unknown>)
  }

  return isNull(benchmarkRuns.qcSummaryJson)
}

function getRunStartedAtClaimClause(run: Pick<BenchmarkRunRecord, 'startedAt'>) {
  return run.startedAt
    ? eq(benchmarkRuns.startedAt, run.startedAt)
    : isNull(benchmarkRuns.startedAt)
}

function getRunExecutionOwnershipClause(
  run: Pick<BenchmarkRunRecord, 'id' | 'startedAt' | 'qcSummaryJson'>,
) {
  const executionToken = getRunExecutionToken(run)

  return and(
    eq(benchmarkRuns.id, run.id),
    eq(benchmarkRuns.status, 'running'),
    getRunStartedAtClaimClause(run),
    executionToken
      ? sql`${benchmarkRuns.qcSummaryJson} ->> 'executionToken' = ${executionToken}`
      : undefined,
  )
}

class OwnershipLostError extends Error {
  constructor() {
    super('Run ownership lost')
    this.name = 'OwnershipLostError'
  }
}

async function verifyRunOwnershipForUpdate(
  tx: DatabaseClient,
  run: Pick<BenchmarkRunRecord, 'id' | 'startedAt' | 'qcSummaryJson'>,
): Promise<void> {
  const [owned] = await tx
    .select({ id: benchmarkRuns.id })
    .from(benchmarkRuns)
    .where(getRunExecutionOwnershipClause(run))
    .for('update')
  if (!owned) throw new OwnershipLostError()
}

async function getRunSummaryIfOwnershipLost(
  database: DatabaseClient,
  run: Pick<BenchmarkRunRecord, 'id' | 'startedAt' | 'qcSummaryJson'>,
  seasonId: string,
): Promise<BenchmarkRunSummary | null> {
  const ownedRun = await database.query.benchmarkRuns.findFirst({
    columns: { id: true },
    where: getRunExecutionOwnershipClause(run),
  })

  if (ownedRun) {
    return null
  }

  const latestRun = await findRunById(database, run.id)
  return await buildRunSummary(database, latestRun, seasonId)
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

function buildRunCaseSummaryMergeSql(update: Partial<RunCaseSnapshot>) {
  return sql`coalesce(${benchmarkRuns.qcSummaryJson}, '{}'::jsonb) || ${JSON.stringify(update)}::jsonb`
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
    const [ownedRun] = await database
      .update(benchmarkRuns)
      .set({
        qcSummaryJson: buildRunCaseSummaryMergeSql({ snapshotCaseIds: caseIds }),
        expectedCaseCount: caseIds.length,
      })
      .where(getRunExecutionOwnershipClause(run))
      .returning({
        expectedCaseCount: benchmarkRuns.expectedCaseCount,
        qcSummaryJson: benchmarkRuns.qcSummaryJson,
      })

    if (!ownedRun) {
      throw new OwnershipLostError()
    }

    run.expectedCaseCount = ownedRun.expectedCaseCount
    run.qcSummaryJson = ownedRun.qcSummaryJson
  } else if (run.expectedCaseCount == null) {
    const [ownedRun] = await database
      .update(benchmarkRuns)
      .set({ expectedCaseCount: caseIds.length })
      .where(getRunExecutionOwnershipClause(run))
      .returning({ expectedCaseCount: benchmarkRuns.expectedCaseCount })

    if (!ownedRun) {
      throw new OwnershipLostError()
    }

    run.expectedCaseCount = ownedRun.expectedCaseCount
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
          .where(getRunExecutionOwnershipClause(run))
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
  const maxCases = normalizeMaxCases(options.maxCases)

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
    return await executeRun(
      database,
      llmService,
      now,
      runHeartbeatIntervalMs,
      run,
      seasonId,
      maxCases,
    )
  } catch (error) {
    const message = getErrorMessage(error)
    await database
      .update(benchmarkRuns)
      .set({
        status: 'failed',
        completedAt: now(),
        errorLog: message,
      })
      .where(getRunExecutionOwnershipClause(run))
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
  maxCases: number | null,
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

    let allCases: Awaited<ReturnType<typeof loadRunCases>>
    try {
      allCases = await loadRunCases(database, run, seasonId)
    } catch (error) {
      if (error instanceof OwnershipLostError) {
        const latestRun = await findRunById(database, run.id)
        return await buildRunSummary(database, latestRun, seasonId)
      }
      throw error
    }

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

      const [finalizedRun] = await database
        .update(benchmarkRuns)
        .set({
          status: 'qc_failed',
          completedAt: now(),
          completedCaseCount: 0,
          failedCaseCount: 0,
          qcStatus: 'failed',
          qcSummaryJson: qc,
        })
        .where(getRunExecutionOwnershipClause(run))
        .returning({ id: benchmarkRuns.id })

      if (!finalizedRun) {
        const latestRun = await findRunById(database, run.id)
        return await buildRunSummary(database, latestRun, seasonId)
      }

      return {
        runId: run.id,
        seasonId,
        scheduledFor: run.scheduledFor,
        status: 'qc_failed',
        totalCases: 0,
        completedCases: 0,
        failedCases: 0,
        invalidOutputCases: 0,
        unresolvedToolCount: 0,
        processedThisInvocation: 0,
        remainingCases: 0,
        hasRemainingWork: false,
        qc,
        errors: [],
      }
    }

    const allSubcategories = await database
      .select({ id: subcategories.id, slug: subcategories.slug })
      .from(subcategories)

    const categorySlugById = new Map(allSubcategories.map((s) => [s.id, s.slug]))

    const existingResults = await database
      .select()
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, run.id))

    const existingResultByCaseId = new Map(existingResults.map((result) => [result.caseId, result]))
    const completedCaseIds = new Set(
      existingResults.filter((result) => result.status === 'completed').map((result) => result.caseId),
    )
    const retryableCaseIds = existingResults
      .filter((result) => result.status === 'failed' || result.status === 'invalid_output')
      .map((result) => result.caseId)
    const retryableCaseIdSet = new Set(retryableCaseIds)
    const untouchedCases = allCases.filter(
      (benchmarkCase) =>
        !completedCaseIds.has(benchmarkCase.id) && !retryableCaseIdSet.has(benchmarkCase.id),
    )
    const retryableCases = allCases.filter((benchmarkCase) =>
      retryableCaseIdSet.has(benchmarkCase.id),
    )
    const pendingCases = [...untouchedCases, ...retryableCases]
    const casesToProcess = maxCases == null ? pendingCases : pendingCases.slice(0, maxCases)

    const toolIndex = await buildToolResolutionIndex(database)

    const errors: string[] = []
    let processedThisInvocation = 0

    for (const benchmarkCase of casesToProcess) {
      const summaryIfOwnershipLostBeforeCase = await getRunSummaryIfOwnershipLost(
        database,
        run,
        seasonId,
      )
      if (summaryIfOwnershipLostBeforeCase) {
        return summaryIfOwnershipLostBeforeCase
      }

      try {
        const { promptVersion, modelSnapshot } = benchmarkCase
        const existingResult = existingResultByCaseId.get(benchmarkCase.id)

        const eligibleCategorySlugs = promptVersion.categories
          .map((c) => categorySlugById.get(c.categoryId))
          .filter((slug): slug is string => slug !== undefined)

        if (eligibleCategorySlugs.length === 0) {
          throw new Error('No eligible category slugs found for prompt version')
        }

        const promptContentMd = promptVersion.contentMd ?? ''
        const categoryIdBySlug = new Map(
          promptVersion.categories.flatMap((category) => {
            const slug = categorySlugById.get(category.categoryId)
            return slug ? ([[slug, category.categoryId]] as const) : []
          }),
        )

        if (existingResult?.status === 'invalid_output') {
          const recovered = await resolveBenchmarkOutput(llmService, {
            promptContentMd,
            rawResponse: existingResult.rawResponse ?? '',
            eligibleCategorySlugs,
          })

          if (recovered.status === 'completed') {
            const restoredCaseResult = await database.transaction(async (tx) => {
              await verifyRunOwnershipForUpdate(tx, run)
              await tx
                .delete(benchmarkCaseResults)
                .where(eq(benchmarkCaseResults.id, existingResult.id))

              return await insertCompletedBenchmarkCaseResult(tx, {
                seasonId,
                runId: run.id,
                caseId: benchmarkCase.id,
                appendix: recovered.appendix,
                rawAppendix: recovered.rawAppendix,
                naturalResponse: recovered.naturalResponse,
                parserVersion: recovered.parserVersion,
                metadata: {
                  rawResponse: existingResult.rawResponse,
                  requestedModelId: existingResult.requestedModelId,
                  returnedModelId: existingResult.returnedModelId,
                  provider: existingResult.provider,
                  finishReason: existingResult.finishReason,
                  promptTokens: existingResult.promptTokens,
                  completionTokens: existingResult.completionTokens,
                  totalTokens: existingResult.totalTokens,
                  latencyMs: existingResult.latencyMs,
                  temperature: existingResult.temperature,
                  topP: existingResult.topP,
                  maxTokens: existingResult.maxTokens,
                  systemPromptSnapshot: existingResult.systemPromptSnapshot,
                },
                categoryIdBySlug,
                toolIndex,
              })
            })

            if (!restoredCaseResult) continue
            processedThisInvocation += 1
            continue
          }
        }

        if (existingResult && (existingResult.status === 'failed' || existingResult.status === 'invalid_output')) {
          await database.transaction(async (tx) => {
            await verifyRunOwnershipForUpdate(tx, run)
            await tx.delete(benchmarkCaseResults).where(eq(benchmarkCaseResults.id, existingResult.id))
          })
        }

        const userPrompt = buildBenchmarkPrompt(promptContentMd, eligibleCategorySlugs)
        const systemPrompt =
          promptVersion.systemPromptSnapshot ??
          buildGenerationSystemPrompt(promptVersion.level as PromptLevel)

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
          const result = await database.transaction(async (tx) => {
            await verifyRunOwnershipForUpdate(tx, run)
            const [inserted] = await tx
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
            return inserted ?? null
          })

          if (!result) continue
          processedThisInvocation += 1
          errors.push(
            `[case ${benchmarkCase.id}] Model drift: ${drift.requestedModel} → ${drift.returnedModel}`,
          )
          continue
        }

        const resolvedOutput = await resolveBenchmarkOutput(llmService, {
          promptContentMd,
          rawResponse: completion.content,
          eligibleCategorySlugs,
        })

        if (resolvedOutput.status === 'completed') {
          const caseResult = await database.transaction(async (tx) => {
            await verifyRunOwnershipForUpdate(tx, run)
            return await insertCompletedBenchmarkCaseResult(tx, {
              seasonId,
              runId: run.id,
              caseId: benchmarkCase.id,
              appendix: resolvedOutput.appendix,
              rawAppendix: resolvedOutput.rawAppendix,
              naturalResponse: resolvedOutput.naturalResponse,
              parserVersion: resolvedOutput.parserVersion,
              metadata: {
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
                systemPromptSnapshot: systemPrompt,
              },
              categoryIdBySlug,
              toolIndex,
            })
          })

          if (!caseResult) continue
          processedThisInvocation += 1
        } else {
          const caseResult = await database.transaction(async (tx) => {
            await verifyRunOwnershipForUpdate(tx, run)
            const [inserted] = await tx
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
                errorMessage: resolvedOutput.invalidReason,
              })
              .onConflictDoNothing()
              .returning()
            return inserted ?? null
          })

          if (!caseResult) continue
          processedThisInvocation += 1
          errors.push(`[case ${benchmarkCase.id}] Invalid output: ${resolvedOutput.invalidReason}`)
        }
      } catch (error) {
        if (error instanceof OwnershipLostError) {
          const latestRun = await findRunById(database, run.id)
          return await buildRunSummary(database, latestRun, seasonId)
        }

        const message = getErrorMessage(error)
        errors.push(`[case ${benchmarkCase.id}] ${message}`)

        try {
          await database.transaction(async (tx) => {
            await verifyRunOwnershipForUpdate(tx, run)
            const [inserted] = await tx
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
              .returning({ id: benchmarkCaseResults.id })

            if (inserted) {
              processedThisInvocation += 1
            }
          })
        } catch (writeError) {
          if (writeError instanceof OwnershipLostError) {
            const latestRun = await findRunById(database, run.id)
            return await buildRunSummary(database, latestRun, seasonId)
          }
          throw writeError
        }
      }
    }

    const metrics = await calculateRunMetrics(database, run.id, allCases.length)
    const remainingCases = calculateRemainingCases(metrics)

    if (remainingCases > 0) {
      const [resumedRun] = await database
        .update(benchmarkRuns)
        .set({
          status: 'pending',
          completedAt: null,
          completedCaseCount: metrics.completedCases,
          failedCaseCount: metrics.failedCases,
          qcStatus: null,
          errorLog: errors.length > 0 ? errors.join('\n') : null,
        })
        .where(getRunExecutionOwnershipClause(run))
        .returning({ id: benchmarkRuns.id })

      if (!resumedRun) {
        const latestRun = await findRunById(database, run.id)
        return await buildRunSummary(database, latestRun, seasonId)
      }

      return {
        runId: run.id,
        seasonId,
        scheduledFor: run.scheduledFor,
        status: 'running',
        ...metrics,
        processedThisInvocation,
        remainingCases,
        hasRemainingWork: true,
        errors,
      }
    }

    const finalStatus = metrics.qc.passed ? 'published' : 'qc_failed'

    const [finalizedRun] = await database
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
      .where(getRunExecutionOwnershipClause(run))
      .returning({ id: benchmarkRuns.id })

    if (!finalizedRun) {
      const latestRun = await findRunById(database, run.id)
      return await buildRunSummary(database, latestRun, seasonId)
    }

    return {
      runId: run.id,
      seasonId,
      scheduledFor: run.scheduledFor,
      status: finalStatus,
      ...metrics,
      processedThisInvocation,
      remainingCases: 0,
      hasRemainingWork: false,
      errors,
    }
  } finally {
    await heartbeat.stop()
  }
}
