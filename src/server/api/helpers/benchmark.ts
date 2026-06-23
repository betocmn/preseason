import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import type { db } from '~/server/db'
import { benchmarkProtocols, benchmarkRuns, benchmarkSeasons } from '~/server/db/schema'

type DatabaseClient = typeof db
const UNFINISHED_BENCHMARK_RUN_STATUSES: Array<typeof benchmarkRuns.$inferSelect.status> = [
  'pending',
  'failed',
  'running',
]

export const anchorDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealCalendarDate, {
    message: 'anchorDate must be a real calendar date',
  })

/**
 * Returns the YYYY-MM-DD date that is `months` calendar months before `anchorDate`
 * (UTC). Used to translate the public rankings date-range filter
 * (last month / 3 / 6 months) into a `scheduledFor` lower bound.
 */
export function monthsAgo(anchorDate: string, months: number): string {
  const [year, month, day] = anchorDate.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
  date.setUTCMonth(date.getUTCMonth() - months)
  return formatScheduledFor(date)
}

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

export async function findPublishedBenchmarkSeasonIds(
  database: DatabaseClient,
  anchorDate?: string,
) {
  const rows = await database
    .selectDistinct({ id: benchmarkSeasons.id })
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

  return rows.map((row) => row.id)
}

export async function findPublicManualBenchmarkSeasonIds(
  database: DatabaseClient,
  anchorDate?: string,
) {
  const publishedSeasonIds = await findPublishedBenchmarkSeasonIds(database, anchorDate)

  if (publishedSeasonIds.length === 0) {
    return findAllBenchmarkSeasonIds(database)
  }

  const activeSeasonId = await findLatestActiveBenchmarkSeasonId(database)
  if (!activeSeasonId || publishedSeasonIds.includes(activeSeasonId)) {
    return publishedSeasonIds
  }

  return [...publishedSeasonIds, activeSeasonId]
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

export async function findAllBenchmarkSeasonIds(database: DatabaseClient) {
  const rows = await database
    .select({ id: benchmarkSeasons.id })
    .from(benchmarkSeasons)
    .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
    .where(eq(benchmarkProtocols.mode, 'benchmark'))

  return rows.map((row) => row.id)
}

type ResolveBenchmarkCronRunTargetOptions = {
  now?: Date
}

export type BenchmarkCronRunTarget = {
  seasonId: string
  scheduledFor: string
  source: 'unfinished' | 'today'
  runId?: string
}

export type BenchmarkCronRunIdle = {
  kind: 'idle'
  reason: 'no_active_season' | 'waiting_for_next_run_window'
  seasonId?: string
  latestScheduledFor?: string
  nextEligibleAt?: string
}

export type BenchmarkCronRunResolution =
  | (BenchmarkCronRunTarget & { kind: 'run' })
  | BenchmarkCronRunIdle

function formatScheduledFor(date: Date): string {
  const [scheduledFor] = date.toISOString().split('T')
  return scheduledFor ?? date.toISOString()
}

function parseScheduledForStart(scheduledFor: string) {
  return new Date(`${scheduledFor}T00:00:00.000Z`)
}

export function getNextEligibleBenchmarkRunAt(
  scheduledFor: string,
  newRunIntervalHours: number = serverSettings.benchmark.newRunIntervalHours,
) {
  const nextEligibleAt = parseScheduledForStart(scheduledFor)
  nextEligibleAt.setUTCHours(nextEligibleAt.getUTCHours() + newRunIntervalHours)
  return nextEligibleAt
}

export function isBenchmarkRunDue(
  currentTime: Date,
  latestScheduledFor: string,
  newRunIntervalHours: number = serverSettings.benchmark.newRunIntervalHours,
) {
  return currentTime >= getNextEligibleBenchmarkRunAt(latestScheduledFor, newRunIntervalHours)
}

export async function resolveBenchmarkCronRunTarget(
  database: DatabaseClient,
  options: ResolveBenchmarkCronRunTargetOptions = {},
): Promise<BenchmarkCronRunResolution> {
  const seasonId = await findLatestActiveBenchmarkSeasonId(database)
  if (!seasonId) {
    return {
      kind: 'idle',
      reason: 'no_active_season',
    }
  }

  const currentTime = options.now ?? new Date()

  const unfinishedRuns = await database
    .select({
      id: benchmarkRuns.id,
      scheduledFor: benchmarkRuns.scheduledFor,
    })
    .from(benchmarkRuns)
    .where(
      and(
        eq(benchmarkRuns.seasonId, seasonId),
        inArray(benchmarkRuns.status, UNFINISHED_BENCHMARK_RUN_STATUSES),
      ),
    )
    .orderBy(asc(benchmarkRuns.scheduledFor), asc(benchmarkRuns.createdAt), asc(benchmarkRuns.id))

  const runToResume = unfinishedRuns[0]

  if (runToResume) {
    return {
      kind: 'run',
      seasonId,
      scheduledFor: runToResume.scheduledFor,
      source: 'unfinished',
      runId: runToResume.id,
    }
  }

  const latestRun = await database
    .select({
      scheduledFor: benchmarkRuns.scheduledFor,
    })
    .from(benchmarkRuns)
    .where(eq(benchmarkRuns.seasonId, seasonId))
    .orderBy(
      desc(benchmarkRuns.scheduledFor),
      desc(benchmarkRuns.createdAt),
      desc(benchmarkRuns.id),
    )
    .limit(1)

  const latestScheduledFor = latestRun[0]?.scheduledFor
  if (latestScheduledFor) {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt(latestScheduledFor)

    if (!isBenchmarkRunDue(currentTime, latestScheduledFor)) {
      return {
        kind: 'idle',
        reason: 'waiting_for_next_run_window',
        seasonId,
        latestScheduledFor,
        nextEligibleAt: nextEligibleAt.toISOString(),
      }
    }
  }

  return {
    kind: 'run',
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
