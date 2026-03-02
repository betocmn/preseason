import { and, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import { db } from '~/server/db'
import { matches, recommendations, runResults } from '~/server/db/schema'

type DatabaseClient = typeof db

export type SettleMatchesOptions = {
  database?: DatabaseClient
  now?: () => Date
}

export type SettledMatchResult = {
  id: string
  toolAScore: number
  toolBScore: number
  winnerToolId: string | null
}

export type SettleMatchesSummary = {
  settledCount: number
  settled: SettledMatchResult[]
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function toRangeStart(dateString: string) {
  return new Date(`${dateString}T00:00:00.000Z`)
}

function toRangeEnd(dateString: string) {
  return new Date(`${dateString}T23:59:59.999Z`)
}

export async function settleExpiredMatches(
  options: SettleMatchesOptions = {},
): Promise<SettleMatchesSummary> {
  const database = options.database ?? db
  const now = options.now ?? (() => new Date())

  const today = toDateString(now())

  const activeExpiredMatches = await database.query.matches.findMany({
    where: and(eq(matches.status, 'active'), lt(matches.periodEnd, today)),
  })

  const settled: SettledMatchResult[] = []

  for (const match of activeExpiredMatches) {
    const rows = await database
      .select({
        toolId: recommendations.toolId,
        promptId: runResults.promptId,
      })
      .from(recommendations)
      .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
      .where(
        and(
          eq(recommendations.categoryId, match.categoryId),
          inArray(recommendations.toolId, [match.toolAId, match.toolBId]),
          gte(recommendations.createdAt, toRangeStart(match.periodStart)),
          lte(recommendations.createdAt, toRangeEnd(match.periodEnd)),
        ),
      )

    const toolAScore = rows.filter((row) => row.toolId === match.toolAId).length
    const toolBScore = rows.filter((row) => row.toolId === match.toolBId).length
    const promptIds = new Set(rows.map((row) => row.promptId))

    const winnerToolId =
      toolAScore === toolBScore ? null : toolAScore > toolBScore ? match.toolAId : match.toolBId

    const updated = await database
      .update(matches)
      .set({
        status: 'settled',
        settledAt: now(),
        toolAScore,
        toolBScore,
        totalPrompts: promptIds.size,
        winnerToolId,
      })
      .where(eq(matches.id, match.id))
      .returning({
        id: matches.id,
        toolAScore: matches.toolAScore,
        toolBScore: matches.toolBScore,
        winnerToolId: matches.winnerToolId,
      })

    const result = updated[0]
    if (result) {
      settled.push(result)
    }
  }

  return {
    settledCount: settled.length,
    settled,
  }
}
