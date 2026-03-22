import crypto from 'node:crypto'
import { and, count, eq, lt, or, sql } from 'drizzle-orm'
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

const STALE_AFTER_MS = 10 * 60 * 1000

function canonicalizeToolOrder(toolAId: string, toolBId: string): [string, string] {
  return toolAId < toolBId ? [toolAId, toolBId] : [toolBId, toolAId]
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

export async function createMatchBatch(
  database: DatabaseClient = defaultDb,
  input: CreateMatchBatchInput,
): Promise<MatchBatchRecord> {
  const [toolAId, toolBId] = canonicalizeToolOrder(input.toolAId, input.toolBId)

  await validateToolsInCategory(database, input.categoryId, toolAId, toolBId)

  const modelCount = await getSeasonModelCount(database, input.seasonId)
  if (modelCount === 0) {
    throw new Error('Season has no frozen model snapshots — cannot create match batch')
  }

  // Idempotency check
  if (input.idempotencyKey) {
    const existing = await database.query.matchBatches.findFirst({
      where: eq(matchBatches.idempotencyKey, input.idempotencyKey),
    })

    if (existing) {
      const dimensionsMismatch =
        existing.seasonId !== input.seasonId ||
        existing.categoryId !== input.categoryId ||
        existing.toolAId !== toolAId ||
        existing.toolBId !== toolBId ||
        existing.promptTemplateId !== input.promptTemplateId ||
        existing.triggerMode !== input.triggerMode ||
        existing.benchmarkRunId !== (input.benchmarkRunId ?? null) ||
        existing.configId !== (input.configId ?? null)

      if (dimensionsMismatch) {
        throw new Error('Idempotency key conflict: existing batch has different dimensions')
      }

      return existing
    }
  }

  // Get season models for materialization
  const seasonModels = await database.query.benchmarkSeasonModels.findMany({
    where: eq(benchmarkSeasonModels.seasonId, input.seasonId),
  })

  const totalEvaluations = seasonModels.length * 2 // a_first + b_first per model

  // Insert batch
  const [batch] = await database
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
      idempotencyKey: input.idempotencyKey ?? null,
      totalEvaluations,
      triggeredBy: input.triggeredBy ?? null,
    })
    .returning()

  if (!batch) {
    throw new Error('Failed to create match batch')
  }

  // Materialize evaluation rows
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
    await database.insert(matchEvaluations).values(evaluationRows)
  }

  return batch
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
            lt(matchBatches.lastHeartbeatAt, new Date(currentTime.getTime() - staleAfterMs)),
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

export function buildBenchmarkRunIdempotencyKey(
  runId: string,
  configId: string,
  promptTemplateId: string,
): string {
  return `benchmark-run:${runId}:config:${configId}:template:${promptTemplateId}`
}
