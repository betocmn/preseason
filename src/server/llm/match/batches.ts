import crypto from 'node:crypto'
import { and, asc, count, eq, lte, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db as defaultDb } from '~/server/db'
import type * as schema from '~/server/db/schema'
import {
  benchmarkSeasonModels,
  matchBatches,
  matchEvaluations,
  toolCategories,
} from '~/server/db/schema'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export type CreateMatchBatchInput = {
  seasonId: string
  categoryId: string
  toolAId: string
  toolBId: string
  promptTemplateId: string
  configId?: string | null
  benchmarkRunId?: string | null
  triggerMode: 'manual' | 'benchmark_run'
  idempotencyKey?: string | null
  triggeredBy?: string | null
}

export type MatchBatchRecord = typeof matchBatches.$inferSelect

export type ClaimResult = {
  batch: MatchBatchRecord
  claimToken: string | null
  execute: boolean
}

export type ClaimNextResult =
  | ClaimResult
  | {
      batch: null
      claimToken: null
      execute: false
    }

const STALE_AFTER_MS = 10 * 60 * 1000
const MAX_DISPATCH_ATTEMPTS = 20

type MatchBatchDimensions = Pick<
  MatchBatchRecord,
  | 'seasonId'
  | 'categoryId'
  | 'toolAId'
  | 'toolBId'
  | 'promptTemplateId'
  | 'triggerMode'
  | 'benchmarkRunId'
  | 'configId'
>

function canonicalizeToolOrder(toolAId: string, toolBId: string): [string, string] {
  const normalizedToolAId = toolAId.toLowerCase()
  const normalizedToolBId = toolBId.toLowerCase()
  return normalizedToolAId < normalizedToolBId
    ? [normalizedToolAId, normalizedToolBId]
    : [normalizedToolBId, normalizedToolAId]
}

async function validateToolsInCategory(
  database: DatabaseClient,
  categoryId: string,
  toolAId: string,
  toolBId: string,
) {
  const [result] = await database
    .select({ cnt: count() })
    .from(toolCategories)
    .where(
      and(
        eq(toolCategories.categoryId, categoryId),
        or(eq(toolCategories.toolId, toolAId), eq(toolCategories.toolId, toolBId)),
      ),
    )

  if (Number(result?.cnt ?? 0) < 2) {
    throw new Error('Both tools must belong to the selected category')
  }
}

async function getSeasonModelCount(database: DatabaseClient, seasonId: string): Promise<number> {
  const [result] = await database
    .select({ cnt: count() })
    .from(benchmarkSeasonModels)
    .where(eq(benchmarkSeasonModels.seasonId, seasonId))

  return Number(result?.cnt ?? 0)
}

function validateTriggerModeInput(input: CreateMatchBatchInput) {
  if (input.triggerMode === 'benchmark_run' && !input.benchmarkRunId) {
    throw new Error('benchmarkRunId is required when triggerMode is benchmark_run')
  }

  if (input.triggerMode === 'manual' && input.benchmarkRunId) {
    throw new Error('benchmarkRunId must be omitted when triggerMode is manual')
  }
}

function normalizeIdempotencyKey(idempotencyKey: string | null | undefined): string | null {
  if (idempotencyKey == null) return null
  return idempotencyKey.trim().length === 0 ? null : idempotencyKey
}

function assertIdempotentBatchMatches(
  existing: MatchBatchRecord,
  expected: MatchBatchDimensions,
): MatchBatchRecord {
  const dimensionsMismatch =
    existing.seasonId !== expected.seasonId ||
    existing.categoryId !== expected.categoryId ||
    existing.toolAId !== expected.toolAId ||
    existing.toolBId !== expected.toolBId ||
    existing.promptTemplateId !== expected.promptTemplateId ||
    existing.triggerMode !== expected.triggerMode ||
    existing.benchmarkRunId !== expected.benchmarkRunId ||
    existing.configId !== expected.configId

  if (dimensionsMismatch) {
    throw new Error('Idempotency key conflict: existing batch has different dimensions')
  }

  return existing
}

async function findExistingBatchByIdempotencyKey(
  database: DatabaseClient,
  idempotencyKey: string,
  expected: MatchBatchDimensions,
): Promise<MatchBatchRecord | null> {
  const existing = await database.query.matchBatches.findFirst({
    where: eq(matchBatches.idempotencyKey, idempotencyKey),
  })

  if (!existing) return null
  return assertIdempotentBatchMatches(existing, expected)
}

export async function createMatchBatch(
  database: DatabaseClient = defaultDb,
  input: CreateMatchBatchInput,
): Promise<MatchBatchRecord> {
  validateTriggerModeInput(input)
  const normalizedIdempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)

  const [toolAId, toolBId] = canonicalizeToolOrder(input.toolAId, input.toolBId)
  const expectedDimensions: MatchBatchDimensions = {
    seasonId: input.seasonId,
    categoryId: input.categoryId,
    toolAId,
    toolBId,
    promptTemplateId: input.promptTemplateId,
    triggerMode: input.triggerMode,
    benchmarkRunId: input.benchmarkRunId ?? null,
    configId: input.configId ?? null,
  }

  try {
    return await database.transaction(async (tx) => {
      await validateToolsInCategory(tx, input.categoryId, toolAId, toolBId)

      const modelCount = await getSeasonModelCount(tx, input.seasonId)
      if (modelCount === 0) {
        throw new Error('Season has no frozen model snapshots — cannot create match batch')
      }

      if (normalizedIdempotencyKey) {
        const existing = await findExistingBatchByIdempotencyKey(
          tx,
          normalizedIdempotencyKey,
          expectedDimensions,
        )
        if (existing) return existing
      }

      const seasonModels = await tx.query.benchmarkSeasonModels.findMany({
        where: eq(benchmarkSeasonModels.seasonId, input.seasonId),
      })
      const totalEvaluations = seasonModels.length * 2 // a_first + b_first per model

      const [batch] = await tx
        .insert(matchBatches)
        .values({
          seasonId: input.seasonId,
          configId: input.configId ?? null,
          categoryId: input.categoryId,
          toolAId,
          toolBId,
          promptTemplateId: input.promptTemplateId,
          benchmarkRunId: input.benchmarkRunId ?? null,
          triggerMode: input.triggerMode,
          idempotencyKey: normalizedIdempotencyKey,
          totalEvaluations,
          triggeredBy: input.triggeredBy ?? null,
        })
        .returning()

      if (!batch) {
        throw new Error('Failed to create match batch')
      }

      const evaluationRows = seasonModels.flatMap((sm) => [
        {
          batchId: batch.id,
          seasonId: input.seasonId,
          modelSnapshotId: sm.modelSnapshotId,
          presentationOrder: 'a_first' as const,
        },
        {
          batchId: batch.id,
          seasonId: input.seasonId,
          modelSnapshotId: sm.modelSnapshotId,
          presentationOrder: 'b_first' as const,
        },
      ])

      if (evaluationRows.length > 0) {
        await tx.insert(matchEvaluations).values(evaluationRows)
      }

      return batch
    })
  } catch (error) {
    if (!normalizedIdempotencyKey) throw error

    const existing = await findExistingBatchByIdempotencyKey(
      database,
      normalizedIdempotencyKey,
      expectedDimensions,
    )
    if (existing) return existing

    throw error
  }
}

export async function claimMatchBatchExecution(
  database: DatabaseClient = defaultDb,
  batchId: string,
  options: { staleAfterMs?: number; now?: () => Date } = {},
): Promise<ClaimResult> {
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS
  const now = options.now ?? (() => new Date())

  while (true) {
    const batch = await database.query.matchBatches.findFirst({
      where: eq(matchBatches.id, batchId),
    })

    if (!batch) {
      throw new Error('Match batch not found')
    }

    if (batch.status === 'completed') {
      return { batch, claimToken: null, execute: false }
    }

    const currentTime = now()
    const freshClaimToken = crypto.randomUUID()

    if (batch.status === 'pending' || batch.status === 'failed') {
      const [claimed] = await database
        .update(matchBatches)
        .set({
          status: 'running',
          startedAt: currentTime,
          claimToken: freshClaimToken,
          lastHeartbeatAt: currentTime,
          completedAt: null,
        })
        .where(and(eq(matchBatches.id, batchId), eq(matchBatches.status, batch.status)))
        .returning()

      if (claimed) {
        return { batch: claimed, claimToken: freshClaimToken, execute: true }
      }
      // Retry if concurrent update happened
      continue
    }

    if (batch.status === 'running') {
      // Check if stale
      const heartbeatAt = batch.lastHeartbeatAt ?? batch.startedAt
      if (!heartbeatAt) {
        return { batch, claimToken: null, execute: false }
      }

      const isStale = currentTime.getTime() - heartbeatAt.getTime() >= staleAfterMs
      if (!isStale) {
        return { batch, claimToken: null, execute: false }
      }

      // Reclaim stale batch
      const [claimed] = await database
        .update(matchBatches)
        .set({
          claimToken: freshClaimToken,
          lastHeartbeatAt: currentTime,
        })
        .where(
          and(
            eq(matchBatches.id, batchId),
            eq(matchBatches.status, 'running'),
            lte(matchBatches.lastHeartbeatAt, new Date(currentTime.getTime() - staleAfterMs)),
          ),
        )
        .returning()

      if (claimed) {
        return { batch: claimed, claimToken: freshClaimToken, execute: true }
      }
      // Retry if concurrent update happened
      continue
    }

    return { batch, claimToken: null, execute: false }
  }
}

async function findNextDispatchableMatchBatchId(
  database: DatabaseClient,
  currentTime: Date,
  staleAfterMs: number,
  seasonId?: string,
) {
  const staleCutoff = new Date(currentTime.getTime() - staleAfterMs)
  const seasonClause = seasonId ? eq(matchBatches.seasonId, seasonId) : undefined

  const staleBatch = await database.query.matchBatches.findFirst({
    where: and(
      seasonClause,
      eq(matchBatches.status, 'running'),
      lte(matchBatches.lastHeartbeatAt, staleCutoff),
    ),
    orderBy: [asc(matchBatches.lastHeartbeatAt), asc(matchBatches.createdAt), asc(matchBatches.id)],
    columns: { id: true },
  })

  if (staleBatch) {
    return staleBatch.id
  }

  const pendingBatch = await database.query.matchBatches.findFirst({
    where: and(seasonClause, eq(matchBatches.status, 'pending')),
    orderBy: [asc(matchBatches.createdAt), asc(matchBatches.id)],
    columns: { id: true },
  })

  if (pendingBatch) {
    return pendingBatch.id
  }

  return null
}

export async function claimNextMatchBatchExecution(
  database: DatabaseClient = defaultDb,
  options: { staleAfterMs?: number; now?: () => Date; seasonId?: string } = {},
): Promise<ClaimNextResult> {
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS
  const now = options.now ?? (() => new Date())

  for (let attempt = 0; attempt < MAX_DISPATCH_ATTEMPTS; attempt++) {
    const currentTime = now()
    const batchId = await findNextDispatchableMatchBatchId(
      database,
      currentTime,
      staleAfterMs,
      options.seasonId,
    )

    if (!batchId) {
      return { batch: null, claimToken: null, execute: false }
    }

    const result = await claimMatchBatchExecution(database, batchId, {
      staleAfterMs,
      now: () => currentTime,
    })

    if (result.execute && result.claimToken) {
      return result
    }
  }

  return { batch: null, claimToken: null, execute: false }
}

export function buildBenchmarkRunIdempotencyKey(
  runId: string,
  configId: string,
  promptTemplateId: string,
): string {
  return `benchmark-run:${runId}:config:${configId}:template:${promptTemplateId}`
}
