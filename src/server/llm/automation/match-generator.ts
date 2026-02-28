import { eq, sql } from 'drizzle-orm'
import { db } from '~/server/db'
import { matches, recommendations } from '~/server/db/schema'

type DatabaseClient = typeof db

export type GenerateMatchesOptions = {
  database?: DatabaseClient
  now?: () => Date
  minimumRecommendations?: number
  periodDays?: number
}

export type GeneratedMatch = {
  id: string
  categoryId: string
  toolAId: string
  toolBId: string
  periodStart: string
  periodEnd: string | null
}

export type GenerateMatchesSummary = {
  createdCount: number
  created: GeneratedMatch[]
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

function toKey(categoryId: string, toolAId: string, toolBId: string) {
  return `${categoryId}:${toolAId}:${toolBId}`
}

export async function generateMatches(
  options: GenerateMatchesOptions = {},
): Promise<GenerateMatchesSummary> {
  const database = options.database ?? db
  const now = options.now ?? (() => new Date())
  const minimumRecommendations = options.minimumRecommendations ?? 3
  const periodDays = options.periodDays ?? 7

  const currentDate = now()
  const periodStart = toDateString(currentDate)
  const periodEnd = toDateString(addDays(currentDate, Math.max(periodDays - 1, 0)))

  const [activeMatches, recommendationCounts] = await Promise.all([
    database.query.matches.findMany({
      where: eq(matches.status, 'active'),
      columns: {
        categoryId: true,
        toolAId: true,
        toolBId: true,
      },
    }),
    database
      .select({
        categoryId: recommendations.categoryId,
        toolId: recommendations.toolId,
        recommendationCount: sql<number>`count(*)`,
      })
      .from(recommendations)
      .groupBy(recommendations.categoryId, recommendations.toolId),
  ])

  const activeKeys = new Set(
    activeMatches.map((match) => toKey(match.categoryId, match.toolAId, match.toolBId)),
  )

  const toolsByCategory = new Map<string, string[]>()

  for (const row of recommendationCounts) {
    const count = Number(row.recommendationCount)
    if (!Number.isFinite(count) || count < minimumRecommendations) {
      continue
    }

    const toolIds = toolsByCategory.get(row.categoryId) ?? []
    toolIds.push(row.toolId)
    toolsByCategory.set(row.categoryId, toolIds)
  }

  const matchesToCreate: Array<{
    toolAId: string
    toolBId: string
    categoryId: string
    status: 'active'
    startedAt: Date
    periodStart: string
    periodEnd: string
  }> = []

  for (const [categoryId, toolIds] of toolsByCategory) {
    const uniqueToolIds = Array.from(new Set(toolIds)).sort((left, right) => left.localeCompare(right))

    for (let leftIndex = 0; leftIndex < uniqueToolIds.length; leftIndex += 1) {
      const leftId = uniqueToolIds[leftIndex]
      if (!leftId) {
        continue
      }

      for (let rightIndex = leftIndex + 1; rightIndex < uniqueToolIds.length; rightIndex += 1) {
        const rightId = uniqueToolIds[rightIndex]
        if (!rightId) {
          continue
        }

        const key = toKey(categoryId, leftId, rightId)
        if (activeKeys.has(key)) {
          continue
        }

        activeKeys.add(key)

        matchesToCreate.push({
          toolAId: leftId,
          toolBId: rightId,
          categoryId,
          status: 'active',
          startedAt: currentDate,
          periodStart,
          periodEnd,
        })
      }
    }
  }

  if (matchesToCreate.length === 0) {
    return {
      createdCount: 0,
      created: [],
    }
  }

  const createdMatches = await database
    .insert(matches)
    .values(matchesToCreate)
    .onConflictDoNothing()
    .returning({
      id: matches.id,
      categoryId: matches.categoryId,
      toolAId: matches.toolAId,
      toolBId: matches.toolBId,
      periodStart: matches.periodStart,
      periodEnd: matches.periodEnd,
    })

  return {
    createdCount: createdMatches.length,
    created: createdMatches,
  }
}
