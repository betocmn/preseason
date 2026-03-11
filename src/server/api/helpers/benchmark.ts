import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { db } from '~/server/db'
import { benchmarkProtocols, benchmarkSeasons } from '~/server/db/schema'

type DatabaseClient = typeof db

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
