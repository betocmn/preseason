import { createHash } from 'node:crypto'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db as defaultDb } from '~/server/db'
import type * as schema from '~/server/db/schema'
import {
  matchBatches,
  matchEvaluations,
  matchPromptTemplates,
  subcategories,
  tools,
} from '~/server/db/schema'
import { checkModelDrift } from '~/server/llm/benchmark/model-drift'
import { MATCH_PARSER_VERSION, parseMatchResponse } from '~/server/llm/match/parser'
import { buildMatchPrompt } from '~/server/llm/match/prompt-builder'
import type { MatchResponse } from '~/server/llm/match/schema'
import { SUPPORTED_SCHEMA_VERSION } from '~/server/llm/match/schema'
import { LlmService } from '~/server/llm/service'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export type MatchBatchRunOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  now?: () => Date
  heartbeatIntervalMs?: number
  maxEvaluations?: number
  maxRuntimeMs?: number
  minRemainingRuntimeMs?: number
  retryTerminalEvaluations?: boolean
}

export type MatchBatchRunSummary = {
  batchId: string
  status: 'pending' | 'completed' | 'failed' | 'ownership_lost'
  totalEvaluations: number
  completedEvaluations: number
  failedEvaluations: number
  invalidOutputEvaluations: number
}

const HEARTBEAT_INTERVAL_MS = 60 * 1000

class OwnershipLostError extends Error {
  constructor() {
    super('Batch ownership lost')
    this.name = 'OwnershipLostError'
  }
}

type MatchEvaluationCounts = {
  totalCount: number
  pendingCount: number
  completedCount: number
  failedCount: number
  invalidCount: number
}

function buildSummary(
  batchId: string,
  status: MatchBatchRunSummary['status'],
  counts: MatchEvaluationCounts,
): MatchBatchRunSummary {
  return {
    batchId,
    status,
    totalEvaluations: counts.totalCount,
    completedEvaluations: counts.completedCount,
    failedEvaluations: counts.failedCount,
    invalidOutputEvaluations: counts.invalidCount,
  }
}

function getOwnershipClause(batchId: string, claimToken: string) {
  return and(
    eq(matchBatches.id, batchId),
    eq(matchBatches.status, 'running'),
    eq(matchBatches.claimToken, claimToken),
  )
}

async function verifyOwnership(
  tx: DatabaseClient,
  batchId: string,
  claimToken: string,
): Promise<void> {
  const [owned] = await tx
    .select({ id: matchBatches.id })
    .from(matchBatches)
    .where(getOwnershipClause(batchId, claimToken))
    .for('update')
  if (!owned) throw new OwnershipLostError()
}

function startHeartbeat(
  database: DatabaseClient,
  batchId: string,
  claimToken: string,
  now: () => Date,
  intervalMs: number,
) {
  let inFlightHeartbeat = Promise.resolve()
  let failed = false
  let ownershipLost = false
  let failureReason: string | undefined

  const timer = setInterval(() => {
    if (failed) return

    inFlightHeartbeat = inFlightHeartbeat
      .catch(() => undefined)
      .then(async () => {
        const [updated] = await database
          .update(matchBatches)
          .set({ lastHeartbeatAt: now() })
          .where(getOwnershipClause(batchId, claimToken))
          .returning({ id: matchBatches.id })
        if (!updated) {
          failed = true
          ownershipLost = true
          failureReason = 'Batch ownership lost during heartbeat'
        }
      })
      .catch((error: unknown) => {
        failed = true
        ownershipLost = false
        failureReason = error instanceof Error ? error.message : 'Heartbeat write failed'
      })
  }, intervalMs)
  timer.unref?.()

  return {
    failed: () => failed,
    ownershipLost: () => ownershipLost,
    failureReason: () => failureReason,
    stop: async () => {
      clearInterval(timer)
      await inFlightHeartbeat
    },
  }
}

type RemappedResult = {
  winnerDecision: MatchResponse['winner']
  winnerId: string | null
  comparisonSummary: string
  toolAPros: unknown
  toolACons: unknown
  toolBPros: unknown
  toolBCons: unknown
  confidence: number
}

function remapMatchResult(
  response: MatchResponse,
  presentationOrder: 'a_first' | 'b_first',
  toolAId: string,
  toolBId: string,
): RemappedResult {
  if (presentationOrder === 'a_first') {
    let winnerId: string | null = null
    if (response.winner === 'tool_a') winnerId = toolAId
    else if (response.winner === 'tool_b') winnerId = toolBId

    return {
      winnerDecision: response.winner,
      winnerId,
      comparisonSummary: response.comparison_summary,
      toolAPros: response.tool_a.pros,
      toolACons: response.tool_a.cons,
      toolBPros: response.tool_b.pros,
      toolBCons: response.tool_b.cons,
      confidence: response.confidence,
    }
  }

  // b_first: swap everything
  let winnerId: string | null = null
  let winnerDecision = response.winner
  if (response.winner === 'tool_a') {
    winnerId = toolBId
    winnerDecision = 'tool_b'
  } else if (response.winner === 'tool_b') {
    winnerId = toolAId
    winnerDecision = 'tool_a'
  }

  return {
    winnerDecision,
    winnerId,
    comparisonSummary: response.comparison_summary,
    toolAPros: response.tool_b.pros,
    toolACons: response.tool_b.cons,
    toolBPros: response.tool_a.pros,
    toolBCons: response.tool_a.cons,
    confidence: response.confidence,
  }
}

export async function runMatchBatch(
  batchId: string,
  claimToken: string,
  options: MatchBatchRunOptions = {},
): Promise<MatchBatchRunSummary> {
  const database = options.database ?? defaultDb
  const llmService = options.llmService ?? new LlmService()
  const now = options.now ?? (() => new Date())
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
  const maxEvaluations = options.maxEvaluations ?? null
  const maxRuntimeMs = options.maxRuntimeMs ?? null
  const minRemainingRuntimeMs = options.minRemainingRuntimeMs ?? 0
  const retryTerminalEvaluations = options.retryTerminalEvaluations ?? true
  const startedAtMs = now().getTime()

  if (maxEvaluations != null && maxEvaluations < 1) {
    throw new Error('maxEvaluations must be at least 1')
  }

  // Load batch
  const batch = await database.query.matchBatches.findFirst({
    where: eq(matchBatches.id, batchId),
  })
  if (!batch) throw new Error('Match batch not found')
  if (batch.status !== 'running' || batch.claimToken !== claimToken) {
    throw new OwnershipLostError()
  }

  // Load prompt template
  const template = await database.query.matchPromptTemplates.findFirst({
    where: eq(matchPromptTemplates.id, batch.promptTemplateId),
  })
  if (!template) throw new Error('Match prompt template not found')

  // Validate schema version before running any evaluations
  if (template.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    const errorMessage = `Unsupported template schema version "${template.schemaVersion}" — expected "${SUPPORTED_SCHEMA_VERSION}"`
    await database
      .update(matchBatches)
      .set({
        status: 'failed',
        claimToken: null,
        lastHeartbeatAt: null,
        completedAt: now(),
      })
      .where(getOwnershipClause(batchId, claimToken))
    throw new Error(errorMessage)
  }

  // Load tool names
  const toolRows = await database
    .select({ id: tools.id, name: tools.name })
    .from(tools)
    .where(inArray(tools.id, [batch.toolAId, batch.toolBId]))
  const toolNameById = new Map(toolRows.map((t) => [t.id, t.name]))
  const toolAName = toolNameById.get(batch.toolAId)
  const toolBName = toolNameById.get(batch.toolBId)
  if (!toolAName || !toolBName) throw new Error('Tool not found')

  // Load category name
  const category = await database.query.subcategories.findFirst({
    where: eq(subcategories.id, batch.categoryId),
  })
  if (!category) throw new Error('Category not found')

  // Start heartbeat
  const heartbeat = startHeartbeat(database, batchId, claimToken, now, heartbeatIntervalMs)

  try {
    try {
      // Load materialized evaluation rows
      const evaluations = await database.query.matchEvaluations.findMany({
        where: eq(matchEvaluations.batchId, batchId),
        orderBy: [asc(matchEvaluations.modelSnapshotId), asc(matchEvaluations.presentationOrder)],
        with: { modelSnapshot: true },
      })

      const retryableEvaluations = evaluations.filter((evaluation) => {
        if (evaluation.status === 'pending') return true
        return (
          retryTerminalEvaluations &&
          (evaluation.status === 'failed' || evaluation.status === 'invalid_output')
        )
      })
      const processableEvaluations =
        maxEvaluations == null
          ? retryableEvaluations
          : retryableEvaluations.slice(0, maxEvaluations)

      for (const evaluation of processableEvaluations) {
        // Abort early if heartbeat detected ownership loss or write failure
        if (heartbeat.failed()) {
          break
        }

        if (maxRuntimeMs != null) {
          const elapsedMs = now().getTime() - startedAtMs
          const remainingMs = maxRuntimeMs - elapsedMs
          if (remainingMs <= minRemainingRuntimeMs) {
            break
          }
        }

        const { modelSnapshot } = evaluation

        // Determine presentation order names
        const promptToolAName = evaluation.presentationOrder === 'a_first' ? toolAName : toolBName
        const promptToolBName = evaluation.presentationOrder === 'a_first' ? toolBName : toolAName

        const userPrompt = buildMatchPrompt({
          templateMd: template.templateMd,
          toolAName: promptToolAName,
          toolBName: promptToolBName,
          categoryName: category.name,
        })

        const systemPrompt = template.systemPromptSnapshot ?? 'You are a helpful assistant.'
        const promptHash = createHash('sha256').update(userPrompt).digest('hex').slice(0, 64)

        try {
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
            await database.transaction(async (tx) => {
              await verifyOwnership(tx, batchId, claimToken)
              await tx
                .update(matchEvaluations)
                .set({
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
                  seed: modelSnapshot.seed,
                  parserVersion: MATCH_PARSER_VERSION,
                  renderedUserPrompt: userPrompt,
                  promptHash,
                  systemPromptSnapshot: systemPrompt,
                  errorMessage: `Model drift: requested ${drift.requestedModel}, got ${drift.returnedModel}`,
                })
                .where(eq(matchEvaluations.id, evaluation.id))
            })
            continue
          }

          const parseResult = parseMatchResponse(completion.content)

          if (parseResult.status === 'ok') {
            const remapped = remapMatchResult(
              parseResult.response,
              evaluation.presentationOrder,
              batch.toolAId,
              batch.toolBId,
            )

            await database.transaction(async (tx) => {
              await verifyOwnership(tx, batchId, claimToken)
              await tx
                .update(matchEvaluations)
                .set({
                  status: 'completed',
                  winnerDecision: remapped.winnerDecision,
                  winnerId: remapped.winnerId,
                  comparisonSummary: remapped.comparisonSummary,
                  toolAPros: remapped.toolAPros,
                  toolACons: remapped.toolACons,
                  toolBPros: remapped.toolBPros,
                  toolBCons: remapped.toolBCons,
                  confidence: remapped.confidence,
                  naturalResponse: parseResult.naturalResponse,
                  appendixRaw: parseResult.rawAppendix,
                  appendixJson: parseResult.response,
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
                  seed: modelSnapshot.seed,
                  parserVersion: MATCH_PARSER_VERSION,
                  renderedUserPrompt: userPrompt,
                  promptHash,
                  systemPromptSnapshot: systemPrompt,
                  errorMessage: null,
                })
                .where(eq(matchEvaluations.id, evaluation.id))
            })
          } else {
            await database.transaction(async (tx) => {
              await verifyOwnership(tx, batchId, claimToken)
              await tx
                .update(matchEvaluations)
                .set({
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
                  seed: modelSnapshot.seed,
                  parserVersion: MATCH_PARSER_VERSION,
                  renderedUserPrompt: userPrompt,
                  promptHash,
                  systemPromptSnapshot: systemPrompt,
                  errorMessage: parseResult.reason,
                })
                .where(eq(matchEvaluations.id, evaluation.id))
            })
          }
        } catch (error) {
          if (error instanceof OwnershipLostError) {
            break
          }

          const message = error instanceof Error ? error.message : 'Unknown error'
          try {
            await database.transaction(async (tx) => {
              await verifyOwnership(tx, batchId, claimToken)
              await tx
                .update(matchEvaluations)
                .set({
                  status: 'failed',
                  errorMessage: message,
                  parserVersion: MATCH_PARSER_VERSION,
                  renderedUserPrompt: userPrompt,
                  promptHash,
                  systemPromptSnapshot: systemPrompt,
                })
                .where(eq(matchEvaluations.id, evaluation.id))
            })
          } catch (innerError) {
            if (innerError instanceof OwnershipLostError) break
            throw innerError
          }
        }
      }
    } finally {
      await heartbeat.stop().catch(() => undefined)
    }

    if (heartbeat.failed() && heartbeat.ownershipLost()) {
      return await buildOwnershipLostSummary(database, batchId)
    }

    return await syncBatchState(database, batchId, claimToken, now)
  } catch (error) {
    if (error instanceof OwnershipLostError) {
      return await buildOwnershipLostSummary(database, batchId)
    }

    await database
      .update(matchBatches)
      .set({
        status: 'failed',
        claimToken: null,
        lastHeartbeatAt: null,
        completedAt: now(),
      })
      .where(getOwnershipClause(batchId, claimToken))

    throw error
  }
}

async function getEvaluationCounts(
  database: DatabaseClient,
  batchId: string,
): Promise<MatchEvaluationCounts> {
  const allEvals = await database.query.matchEvaluations.findMany({
    where: eq(matchEvaluations.batchId, batchId),
    columns: { status: true },
  })

  return {
    totalCount: allEvals.length,
    pendingCount: allEvals.filter((evaluation) => evaluation.status === 'pending').length,
    completedCount: allEvals.filter((evaluation) => evaluation.status === 'completed').length,
    failedCount: allEvals.filter((evaluation) => evaluation.status === 'failed').length,
    invalidCount: allEvals.filter((evaluation) => evaluation.status === 'invalid_output').length,
  }
}

async function buildOwnershipLostSummary(
  database: DatabaseClient,
  batchId: string,
): Promise<MatchBatchRunSummary> {
  const counts = await getEvaluationCounts(database, batchId)
  return buildSummary(batchId, 'ownership_lost', counts)
}

async function syncBatchState(
  database: DatabaseClient,
  batchId: string,
  claimToken: string,
  now: () => Date,
): Promise<MatchBatchRunSummary> {
  const counts = await getEvaluationCounts(database, batchId)
  const hasRemainingWork = counts.pendingCount > 0
  const finalStatus =
    counts.completedCount === counts.totalCount && counts.pendingCount === 0
      ? 'completed'
      : 'failed'
  const nextStatus = hasRemainingWork ? 'pending' : finalStatus

  const [updated] = await database
    .update(matchBatches)
    .set({
      status: nextStatus,
      completedEvaluations: counts.completedCount,
      failedEvaluations: counts.failedCount,
      invalidOutputEvaluations: counts.invalidCount,
      startedAt: hasRemainingWork ? null : undefined,
      claimToken: null,
      lastHeartbeatAt: null,
      completedAt: hasRemainingWork ? null : now(),
    })
    .where(getOwnershipClause(batchId, claimToken))
    .returning()

  if (!updated) {
    return buildSummary(batchId, 'ownership_lost', counts)
  }

  return buildSummary(batchId, nextStatus, counts)
}
