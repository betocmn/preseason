import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import type { db } from '~/server/db'
import { benchmarkProtocols, benchmarkRuns, benchmarkSeasons } from '~/server/db/schema'

type DatabaseClient = typeof db
type BenchmarkRunStatus = typeof benchmarkRuns.$inferSelect.status

const BENCHMARK_RUN_STALE_AFTER_MS = serverSettings.benchmark.staleRunThresholdMs
const UNFINISHED_BENCHMARK_RUN_STATUSES: BenchmarkRunStatus[] = ['pending', 'failed', 'running']

export const anchorDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealCalendarDate, {
    message: 'anchorDate must be a real calendar date',
  })

export async function findLatestActiveBenchmarkSeasonId(database: DatabaseClient) {
  const rows = await database
    .select({ id: benchmarkSeasons.id })
    .from(benchmarkSeasons)
    .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
    .where(and(eq(benchmarkSeasons.status, 'active'), eq(benchmarkProtocols.mode, 'benchmark')))
    .orderBy(desc(benchmarkSeasons.createdAt), desc(benchmarkSeasons.id))
    .limit(1)

  return rows[0]?.id ?? null
}

export async function findLatestPublishedBenchmarkSeasonId(
  database: DatabaseClient,
  anchorDate?: string,
) {
  const rows = await database
    .select({ id: benchmarkSeasons.id })
    .from(benchmarkRuns)
    .innerJoin(benchmarkSeasons, eq(benchmarkRuns.seasonId, benchmarkSeasons.id))
    .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
    .where(
      and(
        eq(benchmarkRuns.status, 'published'),
        eq(benchmarkProtocols.mode, 'benchmark'),
        anchorDate ? lte(benchmarkRuns.scheduledFor, anchorDate) : undefined,
      ),
    )
    .orderBy(
      desc(benchmarkRuns.scheduledFor),
      desc(benchmarkSeasons.createdAt),
      desc(benchmarkRuns.id),
    )
    .limit(1)

  return rows[0]?.id ?? null
}

export async function findBenchmarkSeasonId(database: DatabaseClient, seasonId: string) {
  const rows = await database
    .select({ id: benchmarkSeasons.id })
    .from(benchmarkSeasons)
    .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
    .where(and(eq(benchmarkSeasons.id, seasonId), eq(benchmarkProtocols.mode, 'benchmark')))
    .limit(1)

  return rows[0]?.id ?? null
}

type ResolveBenchmarkCronRunTargetOptions = {
  now?: Date
  runStaleAfterMs?: number
}

export type BenchmarkCronRunTarget = {
  seasonId: string
  scheduledFor: string
  source: 'unfinished' | 'today'
  runId?: string
}

function formatScheduledFor(date: Date): string {
  const [scheduledFor] = date.toISOString().split('T')
  return scheduledFor ?? date.toISOString()
}

function getRunHeartbeatAt(qcSummaryJson: unknown): Date | null {
  if (!qcSummaryJson || typeof qcSummaryJson !== 'object' || Array.isArray(qcSummaryJson)) {
    return null
  }

  const heartbeatAt = (qcSummaryJson as { lastHeartbeatAt?: unknown }).lastHeartbeatAt
  if (typeof heartbeatAt !== 'string') return null

  const parsed = new Date(heartbeatAt)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isStaleRunningBenchmarkRun(
  run: Pick<typeof benchmarkRuns.$inferSelect, 'status' | 'startedAt' | 'qcSummaryJson'>,
  currentTime: Date,
  staleAfterMs: number,
) {
  if (run.status !== 'running') {
    return false
  }

  const staleSince = getRunHeartbeatAt(run.qcSummaryJson) ?? run.startedAt
  if (!staleSince) {
    return true
  }

  return currentTime.getTime() - staleSince.getTime() >= staleAfterMs
}

export async function resolveBenchmarkCronRunTarget(
  database: DatabaseClient,
  options: ResolveBenchmarkCronRunTargetOptions = {},
): Promise<BenchmarkCronRunTarget | null> {
  const seasonId = await findLatestActiveBenchmarkSeasonId(database)
  if (!seasonId) {
    return null
  }

  const currentTime = options.now ?? new Date()
  const runStaleAfterMs = options.runStaleAfterMs ?? BENCHMARK_RUN_STALE_AFTER_MS

  const unfinishedRuns = await database
    .select({
      id: benchmarkRuns.id,
      scheduledFor: benchmarkRuns.scheduledFor,
      status: benchmarkRuns.status,
      startedAt: benchmarkRuns.startedAt,
      qcSummaryJson: benchmarkRuns.qcSummaryJson,
    })
    .from(benchmarkRuns)
    .where(
      and(
        eq(benchmarkRuns.seasonId, seasonId),
        inArray(benchmarkRuns.status, UNFINISHED_BENCHMARK_RUN_STATUSES),
      ),
    )
    .orderBy(asc(benchmarkRuns.scheduledFor), asc(benchmarkRuns.createdAt), asc(benchmarkRuns.id))

  const runToResume = unfinishedRuns.find((run) => {
    if (run.status === 'running') {
      return isStaleRunningBenchmarkRun(run, currentTime, runStaleAfterMs)
    }

    return run.status === 'pending' || run.status === 'failed'
  })

  if (runToResume) {
    return {
      seasonId,
      scheduledFor: runToResume.scheduledFor,
      source: 'unfinished',
      runId: runToResume.id,
    }
  }

  return {
    seasonId,
    scheduledFor: formatScheduledFor(currentTime),
    source: 'today',
  }
}

function isRealCalendarDate(value: string) {
  const [yearString, monthString, dayString] = value.split('-')
  if (yearString === undefined || monthString === undefined || dayString === undefined) {
    return false
  }

  const year = Number(yearString)
  const month = Number(monthString)
  const day = Number(dayString)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}
