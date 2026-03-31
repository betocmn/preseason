import { createHash, randomUUID } from 'node:crypto'
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from 'drizzle-orm'
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

export type BenchmarkRunOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  now?: () => Date
  caseClaimStaleAfterMs?: number
  // Backward-compatible alias for older tests/helpers.
  runStaleAfterMs?: number
  // Backward-compatible no-op after removing run heartbeats.
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
type RunInitializationResult = {
  run: BenchmarkRunRecord
  state: 'ready' | 'legacy_in_flight' | 'terminal'
}
type ClaimedBenchmarkCase = {
  caseResultId: string
  caseId: string
  claimToken: string
  previousResult: BenchmarkCaseResultRecord
}
type ClaimCandidate = Pick<ClaimedBenchmarkCase, 'caseResultId' | 'caseId' | 'previousResult'>
type CaseProcessingResources = {
  toolIndex: Awaited<ReturnType<typeof buildToolResolutionIndex>>
  categorySlugById: Map<string, string>
}
type CaseProcessingResult = {
  processed: boolean
  error: string | null
}

const CASE_CLAIM_STALE_AFTER_MS = serverSettings.benchmark.caseClaimStaleAfterMs
const BENCHMARK_RUN_LOCK_NAMESPACE = 41_027
const TERMINAL_RUN_STATUSES = ['completed', 'published', 'qc_failed'] as const
const RETRYABLE_CASE_RESULT_STATUSES: Array<BenchmarkCaseResultRecord['status']> = [
  'failed',
  'invalid_output',
]
const MODEL_DRIFT_ERROR_PREFIX = 'Model drift detected:'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

function hasStoredInvalidOutputPayload(
  result: Pick<BenchmarkCaseResultRecord, 'rawResponse' | 'naturalResponse' | 'appendixJson'>,
) {
  return result.rawResponse !== null && result.naturalResponse === null && result.appendixJson === null
}

function isModelDriftInvalidOutput(
  result: Pick<
    BenchmarkCaseResultRecord,
    | 'errorMessage'
    | 'requestedModelId'
    | 'returnedModelId'
    | 'rawResponse'
    | 'naturalResponse'
    | 'appendixJson'
  >,
) {
  if (!hasStoredInvalidOutputPayload(result)) {
    return false
  }

  if (result.errorMessage?.startsWith(MODEL_DRIFT_ERROR_PREFIX)) {
    return true
  }

  if (result.requestedModelId && result.returnedModelId) {
    return checkModelDrift(result.requestedModelId, result.returnedModelId).hasDrift
  }

  return false
}

function shouldAttemptStoredInvalidOutputRecovery(
  result: Pick<
    BenchmarkCaseResultRecord,
    | 'errorMessage'
    | 'requestedModelId'
    | 'returnedModelId'
    | 'rawResponse'
    | 'naturalResponse'
    | 'appendixJson'
  >,
) {
  return hasStoredInvalidOutputPayload(result) && !isModelDriftInvalidOutput(result)
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

function isTerminalRunStatus(
  status: BenchmarkRunRecord['status'],
): status is (typeof TERMINAL_RUN_STATUSES)[number] {
  return TERMINAL_RUN_STATUSES.includes(status as (typeof TERMINAL_RUN_STATUSES)[number])
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

function getRunCaseSnapshot(
  run: Pick<BenchmarkRunRecord, 'qcSummaryJson'>,
): RunCaseSnapshot | null {
  const qcSummary = run.qcSummaryJson
  if (!qcSummary || typeof qcSummary !== 'object' || Array.isArray(qcSummary)) {
    return null
  }

  const snapshotCaseIds = (qcSummary as Partial<RunCaseSnapshot>).snapshotCaseIds
  const lastHeartbeatAt = (qcSummary as Partial<RunCaseSnapshot>).lastHeartbeatAt
  const executionToken = (qcSummary as Partial<RunCaseSnapshot>).executionToken

  if (!Array.isArray(snapshotCaseIds) || !snapshotCaseIds.every((id) => typeof id === 'string')) {
    return null
  }

  return {
    snapshotCaseIds,
    lastHeartbeatAt: typeof lastHeartbeatAt === 'string' ? lastHeartbeatAt : undefined,
    executionToken: typeof executionToken === 'string' ? executionToken : undefined,
  }
}

function getRunHeartbeatAt(run: Pick<BenchmarkRunRecord, 'qcSummaryJson'>): Date | null {
  const heartbeatAt = getRunCaseSnapshot(run)?.lastHeartbeatAt
  if (!heartbeatAt) return null

  const parsed = new Date(heartbeatAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getRunExecutionToken(run: Pick<BenchmarkRunRecord, 'qcSummaryJson'>): string | null {
  return getRunCaseSnapshot(run)?.executionToken ?? null
}

function buildSummaryErrors(run: Pick<BenchmarkRunRecord, 'errorLog'>, invocationErrors: string[]) {
  const persistedErrors = run.errorLog
    ? run.errorLog.split('\n').filter((line) => line.length > 0)
    : []
  return [...persistedErrors, ...invocationErrors]
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
  invocationErrors: string[] = [],
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
    errors: buildSummaryErrors(run, invocationErrors),
  }
}

async function withRunAdvisoryLock<T>(
  database: DatabaseClient,
  runId: string,
  fn: (tx: DatabaseClient) => Promise<T>,
) {
  return await database.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${BENCHMARK_RUN_LOCK_NAMESPACE}, hashtext(${runId}))`,
    )
    return await fn(tx)
  })
}

async function loadOrderedSeasonCaseIds(database: DatabaseClient, seasonId: string) {
  const rows = await database
    .select({ id: benchmarkCases.id })
    .from(benchmarkCases)
    .where(and(eq(benchmarkCases.seasonId, seasonId), eq(benchmarkCases.isActive, true)))
    .orderBy(benchmarkCases.promptVersionId, benchmarkCases.modelSnapshotId, benchmarkCases.id)

  return rows.map((row) => row.id)
}

function isFreshLegacyRun(run: BenchmarkRunRecord, currentTime: Date, staleAfterMs: number) {
  if (run.status !== 'running') return false
  if (!getRunExecutionToken(run)) return false

  const staleSince = getRunHeartbeatAt(run) ?? run.startedAt
  if (!staleSince) return true

  return currentTime.getTime() - staleSince.getTime() < staleAfterMs
}

async function initializeRunForCaseWorkers(
  database: DatabaseClient,
  runId: string,
  seasonId: string,
  currentTime: Date,
  staleAfterMs: number,
): Promise<RunInitializationResult> {
  return await withRunAdvisoryLock(database, runId, async (tx) => {
    const [run] = await tx
      .select()
      .from(benchmarkRuns)
      .where(eq(benchmarkRuns.id, runId))
      .for('update')

    if (!run) throw new Error('Benchmark run not found')

    if (isTerminalRunStatus(run.status)) {
      return { run, state: 'terminal' }
    }

    const legacyExecutionToken = getRunExecutionToken(run)
    if (legacyExecutionToken && isFreshLegacyRun(run, currentTime, staleAfterMs)) {
      return { run, state: 'legacy_in_flight' }
    }

    const snapshotCaseIds =
      getRunCaseSnapshot(run)?.snapshotCaseIds ?? (await loadOrderedSeasonCaseIds(tx, seasonId))

    if (snapshotCaseIds.length > 0) {
      await tx
        .insert(benchmarkCaseResults)
        .values(
          snapshotCaseIds.map((caseId) => ({
            seasonId,
            runId,
            caseId,
            status: 'pending' as const,
          })),
        )
        .onConflictDoNothing()
    }

    let weightConfigId = run.weightConfigId
    if (!weightConfigId) {
      const weightConfig = await tx.query.benchmarkModelWeightConfigs.findFirst({
        where: eq(benchmarkModelWeightConfigs.isActive, true),
      })
      weightConfigId = weightConfig?.id ?? null
    }

    const shouldRefreshRunState =
      run.status === 'pending' || run.status === 'failed' || legacyExecutionToken !== null

    const [updatedRun] = await tx
      .update(benchmarkRuns)
      .set({
        status: 'running',
        startedAt: shouldRefreshRunState ? currentTime : (run.startedAt ?? currentTime),
        completedAt: null,
        expectedCaseCount: run.expectedCaseCount ?? snapshotCaseIds.length,
        weightConfigId,
        completedCaseCount: run.completedCaseCount,
        failedCaseCount: run.failedCaseCount,
        qcStatus: null,
        qcSummaryJson: { snapshotCaseIds },
        errorLog: shouldRefreshRunState ? null : run.errorLog,
      })
      .where(eq(benchmarkRuns.id, runId))
      .returning()

    return { run: updatedRun ?? run, state: 'ready' }
  })
}

function getClaimOwnershipClause(claimedCase: ClaimedBenchmarkCase) {
  return and(
    eq(benchmarkCaseResults.id, claimedCase.caseResultId),
    eq(benchmarkCaseResults.status, 'running'),
    eq(benchmarkCaseResults.claimToken, claimedCase.claimToken),
  )
}

function buildClaimResetValues(currentTime: Date, claimToken: string) {
  return {
    status: 'running' as const,
    claimToken,
    startedAt: currentTime,
    completedAt: null,
    attemptCount: sql<number>`${benchmarkCaseResults.attemptCount} + 1`,
    naturalResponse: null,
    appendixRaw: null,
    appendixJson: null,
    rawResponse: null,
    requestedModelId: null,
    returnedModelId: null,
    provider: null,
    finishReason: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    latencyMs: null,
    temperature: null,
    topP: null,
    maxTokens: null,
    parserVersion: null,
    promptHash: null,
    systemPromptSnapshot: null,
    errorMessage: null,
  }
}

function buildExcludedCaseResultClause(excludedCaseResultIds: string[]) {
  return excludedCaseResultIds.length > 0
    ? notInArray(benchmarkCaseResults.id, excludedCaseResultIds)
    : undefined
}

async function selectClaimCandidate(
  tx: DatabaseClient,
  whereClause: ReturnType<typeof and> | undefined,
  orderBy: Array<ReturnType<typeof asc>>,
): Promise<ClaimCandidate | null> {
  const rows = await tx
    .select({
      caseResultId: benchmarkCaseResults.id,
      caseId: benchmarkCaseResults.caseId,
      previousResult: {
        id: benchmarkCaseResults.id,
        seasonId: benchmarkCaseResults.seasonId,
        runId: benchmarkCaseResults.runId,
        caseId: benchmarkCaseResults.caseId,
        status: benchmarkCaseResults.status,
        claimToken: benchmarkCaseResults.claimToken,
        attemptCount: benchmarkCaseResults.attemptCount,
        startedAt: benchmarkCaseResults.startedAt,
        completedAt: benchmarkCaseResults.completedAt,
        naturalResponse: benchmarkCaseResults.naturalResponse,
        appendixRaw: benchmarkCaseResults.appendixRaw,
        appendixJson: benchmarkCaseResults.appendixJson,
        rawResponse: benchmarkCaseResults.rawResponse,
        requestedModelId: benchmarkCaseResults.requestedModelId,
        returnedModelId: benchmarkCaseResults.returnedModelId,
        provider: benchmarkCaseResults.provider,
        finishReason: benchmarkCaseResults.finishReason,
        promptTokens: benchmarkCaseResults.promptTokens,
        completionTokens: benchmarkCaseResults.completionTokens,
        totalTokens: benchmarkCaseResults.totalTokens,
        latencyMs: benchmarkCaseResults.latencyMs,
        temperature: benchmarkCaseResults.temperature,
        topP: benchmarkCaseResults.topP,
        maxTokens: benchmarkCaseResults.maxTokens,
        parserVersion: benchmarkCaseResults.parserVersion,
        promptHash: benchmarkCaseResults.promptHash,
        systemPromptSnapshot: benchmarkCaseResults.systemPromptSnapshot,
        errorMessage: benchmarkCaseResults.errorMessage,
        createdAt: benchmarkCaseResults.createdAt,
      },
    })
    .from(benchmarkCaseResults)
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(1)
    .for('update', { skipLocked: true })

  const row = rows[0]
  return row
    ? {
        caseResultId: row.caseResultId,
        caseId: row.caseId,
        previousResult: row.previousResult,
      }
    : null
}

async function claimNextBenchmarkCase(
  database: DatabaseClient,
  runId: string,
  currentTime: Date,
  staleAfterMs: number,
  excludedCaseResultIds: string[],
): Promise<ClaimedBenchmarkCase | null> {
  return await database.transaction(async (tx) => {
    const excludedClause = buildExcludedCaseResultClause(excludedCaseResultIds)
    const staleBefore = new Date(currentTime.getTime() - staleAfterMs)

    const staleRunningCandidate =
      (await selectClaimCandidate(
        tx,
        and(
          eq(benchmarkCaseResults.runId, runId),
          eq(benchmarkCaseResults.status, 'running'),
          or(
            isNull(benchmarkCaseResults.startedAt),
            lte(benchmarkCaseResults.startedAt, staleBefore),
          ),
          excludedClause,
        ),
        [
          asc(benchmarkCaseResults.startedAt),
          asc(benchmarkCases.promptVersionId),
          asc(benchmarkCases.modelSnapshotId),
          asc(benchmarkCases.id),
        ],
      )) ??
      (await selectClaimCandidate(
        tx,
        and(
          eq(benchmarkCaseResults.runId, runId),
          eq(benchmarkCaseResults.status, 'pending'),
          excludedClause,
        ),
        [
          asc(benchmarkCases.promptVersionId),
          asc(benchmarkCases.modelSnapshotId),
          asc(benchmarkCases.id),
        ],
      )) ??
      (await selectClaimCandidate(
        tx,
        and(
          eq(benchmarkCaseResults.runId, runId),
          inArray(benchmarkCaseResults.status, RETRYABLE_CASE_RESULT_STATUSES),
          excludedClause,
        ),
        [
          asc(benchmarkCases.promptVersionId),
          asc(benchmarkCases.modelSnapshotId),
          asc(benchmarkCases.id),
        ],
      ))

    if (!staleRunningCandidate) {
      return null
    }

    const claimToken = randomUUID()

    const [claimedCase] = await tx
      .update(benchmarkCaseResults)
      .set(buildClaimResetValues(currentTime, claimToken))
      .where(eq(benchmarkCaseResults.id, staleRunningCandidate.caseResultId))
      .returning({
        caseResultId: benchmarkCaseResults.id,
        caseId: benchmarkCaseResults.caseId,
      })

    if (!claimedCase) {
      return null
    }

    await tx
      .delete(benchmarkCaseDecisions)
      .where(eq(benchmarkCaseDecisions.caseResultId, claimedCase.caseResultId))

    return {
      caseResultId: claimedCase.caseResultId,
      caseId: claimedCase.caseId,
      claimToken,
      previousResult: staleRunningCandidate.previousResult,
    }
  })
}

async function loadProcessingResources(database: DatabaseClient): Promise<CaseProcessingResources> {
  const [toolIndex, categoryRows] = await Promise.all([
    buildToolResolutionIndex(database),
    database.select({ id: subcategories.id, slug: subcategories.slug }).from(subcategories),
  ])

  return {
    toolIndex,
    categorySlugById: new Map(categoryRows.map((row) => [row.id, row.slug])),
  }
}

async function loadBenchmarkCaseForProcessing(database: DatabaseClient, caseId: string) {
  return await database.query.benchmarkCases.findFirst({
    where: eq(benchmarkCases.id, caseId),
    with: {
      promptVersion: { with: { categories: true } },
      modelSnapshot: true,
    },
  })
}

async function persistTerminalCaseResult(
  database: DatabaseClient,
  claimedCase: ClaimedBenchmarkCase,
  values: Omit<
    typeof benchmarkCaseResults.$inferInsert,
    'id' | 'seasonId' | 'runId' | 'caseId' | 'status' | 'claimToken' | 'startedAt' | 'attemptCount'
  > & {
    status: 'completed' | 'failed' | 'invalid_output'
    completedAt: Date
  },
) {
  const [updated] = await database
    .update(benchmarkCaseResults)
    .set({
      ...values,
      claimToken: null,
    })
    .where(getClaimOwnershipClause(claimedCase))
    .returning({ id: benchmarkCaseResults.id })

  return Boolean(updated)
}

async function persistCompletedCaseResult(
  database: DatabaseClient,
  claimedCase: ClaimedBenchmarkCase,
  values: Omit<
    typeof benchmarkCaseResults.$inferInsert,
    'id' | 'seasonId' | 'runId' | 'caseId' | 'status' | 'claimToken' | 'startedAt' | 'attemptCount'
  > & {
    completedAt: Date
  },
  appendix: BenchmarkAppendix,
  promptCategoryIds: Array<{ slug: string; categoryId: string }>,
  resources: CaseProcessingResources,
) {
  return await database.transaction(async (tx) => {
    const [updatedCaseResult] = await tx
      .update(benchmarkCaseResults)
      .set({
        ...values,
        status: 'completed',
        claimToken: null,
      })
      .where(getClaimOwnershipClause(claimedCase))
      .returning({ id: benchmarkCaseResults.id })

    if (!updatedCaseResult) {
      return false
    }

    const categoryIdBySlug = new Map(
      promptCategoryIds.map((entry) => [entry.slug, entry.categoryId]),
    )

    for (const decision of appendix.categories) {
      const categoryId = categoryIdBySlug.get(decision.category_slug)
      if (!categoryId) continue

      if (decision.decision === 'tool' && decision.tool) {
        const resolved = await resolveToolWithCandidateQueue(
          tx,
          decision.tool,
          resources.toolIndex,
          categoryId,
        )

        await tx
          .insert(benchmarkCaseDecisions)
          .values({
            caseResultId: updatedCaseResult.id,
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
            caseResultId: updatedCaseResult.id,
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

    return true
  })
}

async function processClaimedBenchmarkCase(
  database: DatabaseClient,
  llmService: LlmService,
  now: () => Date,
  claimedCase: ClaimedBenchmarkCase,
  resources: CaseProcessingResources,
): Promise<CaseProcessingResult> {
  const benchmarkCase = await loadBenchmarkCaseForProcessing(database, claimedCase.caseId)
  if (!benchmarkCase) {
    const processed = await persistTerminalCaseResult(database, claimedCase, {
      status: 'failed',
      completedAt: now(),
      errorMessage: 'Benchmark case not found',
      parserVersion: PARSER_VERSION,
    })

    return {
      processed,
      error: processed ? `[case ${claimedCase.caseId}] Benchmark case not found` : null,
    }
  }

  const { promptVersion, modelSnapshot } = benchmarkCase

  let userPrompt: string | null = null
  let systemPrompt: string | null = null
  let promptHash: string | null = null

  try {
    const promptCategoryIds = promptVersion.categories
      .map((entry) => ({
        categoryId: entry.categoryId,
        slug: resources.categorySlugById.get(entry.categoryId) ?? null,
      }))
      .filter((entry): entry is { categoryId: string; slug: string } => entry.slug !== null)

    const eligibleCategorySlugs = promptCategoryIds.map((entry) => entry.slug)

    if (eligibleCategorySlugs.length === 0) {
      throw new Error('No eligible category slugs found for prompt version')
    }

    userPrompt = buildBenchmarkPrompt(promptVersion.contentMd ?? '', eligibleCategorySlugs)
    systemPrompt =
      promptVersion.systemPromptSnapshot ??
      buildGenerationSystemPrompt(promptVersion.level as PromptLevel)
    promptHash = createHash('sha256').update(userPrompt).digest('hex').slice(0, 64)

    if (shouldAttemptStoredInvalidOutputRecovery(claimedCase.previousResult)) {
      const recovered = await resolveBenchmarkOutput(llmService, {
        promptContentMd: promptVersion.contentMd ?? '',
        rawResponse: claimedCase.previousResult.rawResponse ?? '',
        eligibleCategorySlugs,
      })

      if (recovered.status === 'completed') {
        const processed = await persistCompletedCaseResult(
          database,
          claimedCase,
          {
            completedAt: now(),
            naturalResponse: recovered.naturalResponse,
            appendixRaw: recovered.rawAppendix,
            appendixJson: recovered.appendix,
            rawResponse: claimedCase.previousResult.rawResponse,
            requestedModelId:
              claimedCase.previousResult.requestedModelId ?? modelSnapshot.requestedModelId,
            returnedModelId: claimedCase.previousResult.returnedModelId,
            provider: claimedCase.previousResult.provider,
            finishReason: claimedCase.previousResult.finishReason,
            promptTokens: claimedCase.previousResult.promptTokens,
            completionTokens: claimedCase.previousResult.completionTokens,
            totalTokens: claimedCase.previousResult.totalTokens,
            latencyMs: claimedCase.previousResult.latencyMs,
            temperature: claimedCase.previousResult.temperature ?? modelSnapshot.temperature,
            topP: claimedCase.previousResult.topP ?? modelSnapshot.topP,
            maxTokens: claimedCase.previousResult.maxTokens ?? modelSnapshot.maxTokens,
            parserVersion: recovered.parserVersion,
            promptHash: claimedCase.previousResult.promptHash ?? promptHash,
            systemPromptSnapshot:
              claimedCase.previousResult.systemPromptSnapshot ?? systemPrompt,
            errorMessage: null,
          },
          recovered.appendix,
          promptCategoryIds,
          resources,
        )

        return { processed, error: null }
      }
    }

    const completion = await llmService.complete(modelSnapshot.provider, {
      model: modelSnapshot.requestedModelId,
      systemPrompt,
      userPrompt,
      temperature: modelSnapshot.temperature ?? undefined,
      topP: modelSnapshot.topP ?? undefined,
      maxTokens: modelSnapshot.maxTokens ?? undefined,
      seed: modelSnapshot.seed ?? undefined,
    })

    const baseTerminalValues = {
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
      promptHash,
      systemPromptSnapshot: systemPrompt,
      completedAt: now(),
    }

    const drift = checkModelDrift(modelSnapshot.requestedModelId, completion.returnedModel)

    if (drift.hasDrift) {
      const processed = await persistTerminalCaseResult(database, claimedCase, {
        ...baseTerminalValues,
        status: 'invalid_output',
        errorMessage: `Model drift detected: requested ${drift.requestedModel}, got ${drift.returnedModel}`,
      })

      return {
        processed,
        error: processed
          ? `[case ${benchmarkCase.id}] Model drift: ${drift.requestedModel} -> ${drift.returnedModel}`
          : null,
      }
    }

    const resolvedOutput = await resolveBenchmarkOutput(llmService, {
      promptContentMd: promptVersion.contentMd ?? '',
      rawResponse: completion.content,
      eligibleCategorySlugs,
    })

    if (resolvedOutput.status === 'completed') {
      const processed = await persistCompletedCaseResult(
        database,
        claimedCase,
        {
          ...baseTerminalValues,
          completedAt: now(),
          naturalResponse: resolvedOutput.naturalResponse,
          appendixRaw: resolvedOutput.rawAppendix,
          appendixJson: resolvedOutput.appendix,
          parserVersion: resolvedOutput.parserVersion,
          errorMessage: null,
        },
        resolvedOutput.appendix,
        promptCategoryIds,
        resources,
      )

      return { processed, error: null }
    }

    const processed = await persistTerminalCaseResult(database, claimedCase, {
      ...baseTerminalValues,
      status: 'invalid_output',
      naturalResponse: null,
      appendixRaw: null,
      appendixJson: null,
      errorMessage: resolvedOutput.invalidReason,
    })

    return {
      processed,
      error: processed
        ? `[case ${benchmarkCase.id}] Invalid output: ${resolvedOutput.invalidReason}`
        : null,
    }
  } catch (error) {
    const message = getErrorMessage(error)
    const processed = await persistTerminalCaseResult(database, claimedCase, {
      status: 'failed',
      completedAt: now(),
      requestedModelId: modelSnapshot.requestedModelId,
      parserVersion: PARSER_VERSION,
      promptHash,
      systemPromptSnapshot: systemPrompt,
      temperature: modelSnapshot.temperature,
      topP: modelSnapshot.topP,
      maxTokens: modelSnapshot.maxTokens,
      errorMessage: message,
    })

    return {
      processed,
      error: processed ? `[case ${benchmarkCase.id}] ${message}` : null,
    }
  }
}

async function finalizeRunIfExhausted(
  database: DatabaseClient,
  runId: string,
  seasonId: string,
  currentTime: Date,
) {
  return await withRunAdvisoryLock(database, runId, async (tx) => {
    const [run] = await tx
      .select()
      .from(benchmarkRuns)
      .where(eq(benchmarkRuns.id, runId))
      .for('update')

    if (!run) throw new Error('Benchmark run not found')

    if (isTerminalRunStatus(run.status)) {
      return run
    }

    const totalCases = await getRunTotalCases(tx, seasonId, run.expectedCaseCount ?? null)
    const statusCounts = await tx
      .select({ status: benchmarkCaseResults.status, cnt: count() })
      .from(benchmarkCaseResults)
      .where(eq(benchmarkCaseResults.runId, runId))
      .groupBy(benchmarkCaseResults.status)

    const countByStatus = new Map(statusCounts.map((row) => [row.status, Number(row.cnt)]))
    const pendingCases = countByStatus.get('pending') ?? 0
    const runningCases = countByStatus.get('running') ?? 0
    const completedCases = countByStatus.get('completed') ?? 0
    const failedCases = countByStatus.get('failed') ?? 0

    if (pendingCases > 0 || runningCases > 0) {
      const [updatedRun] = await tx
        .update(benchmarkRuns)
        .set({
          status: 'running',
          completedAt: null,
          completedCaseCount: completedCases,
          failedCaseCount: failedCases,
          qcStatus: null,
        })
        .where(eq(benchmarkRuns.id, runId))
        .returning()

      return updatedRun ?? run
    }

    const metrics = await calculateRunMetrics(tx, runId, totalCases)
    const finalStatus = metrics.qc.passed ? 'published' : 'qc_failed'

    const [updatedRun] = await tx
      .update(benchmarkRuns)
      .set({
        status: finalStatus,
        completedAt: currentTime,
        completedCaseCount: metrics.completedCases,
        failedCaseCount: metrics.failedCases,
        qcStatus: metrics.qc.passed ? 'passed' : 'failed',
        qcSummaryJson: metrics.qc,
        errorLog: null,
      })
      .where(eq(benchmarkRuns.id, runId))
      .returning()

    return updatedRun ?? run
  })
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
  const caseClaimStaleAfterMs =
    options.caseClaimStaleAfterMs ?? options.runStaleAfterMs ?? CASE_CLAIM_STALE_AFTER_MS
  const maxCases = normalizeMaxCases(options.maxCases)

  const initialRun = await createOrLoadRun(database, seasonId, scheduledFor)
  const initializedRun = await initializeRunForCaseWorkers(
    database,
    initialRun.id,
    seasonId,
    now(),
    caseClaimStaleAfterMs,
  )

  if (initializedRun.state !== 'ready') {
    return await buildRunSummary(database, initializedRun.run, seasonId)
  }

  let resources: CaseProcessingResources | null = null
  const claimedCaseResultIds: string[] = []
  const invocationErrors: string[] = []
  let processedThisInvocation = 0

  try {
    for (let claimCount = 0; maxCases == null || claimCount < maxCases; claimCount++) {
      const claimedCase = await claimNextBenchmarkCase(
        database,
        initializedRun.run.id,
        now(),
        caseClaimStaleAfterMs,
        claimedCaseResultIds,
      )

      if (!claimedCase) {
        break
      }

      claimedCaseResultIds.push(claimedCase.caseResultId)
      resources ??= await loadProcessingResources(database)

      const result = await processClaimedBenchmarkCase(
        database,
        llmService,
        now,
        claimedCase,
        resources,
      )
      if (result.processed) {
        processedThisInvocation += 1
      }
      if (result.error) {
        invocationErrors.push(result.error)
      }
    }

    const finalizedRun = await finalizeRunIfExhausted(
      database,
      initializedRun.run.id,
      seasonId,
      now(),
    )

    return await buildRunSummary(
      database,
      finalizedRun,
      seasonId,
      processedThisInvocation,
      invocationErrors,
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
      .where(
        and(
          eq(benchmarkRuns.id, initializedRun.run.id),
          inArray(benchmarkRuns.status, ['pending', 'failed', 'running']),
        ),
      )

    throw error
  }
}
