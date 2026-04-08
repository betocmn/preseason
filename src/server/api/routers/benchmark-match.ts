import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, gte, inArray, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import {
  anchorDateSchema,
  findBenchmarkSeasonId,
  findLatestPublishedBenchmarkSeasonId,
} from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import type { db as DatabaseInstance } from '~/server/db'
import {
  categories,
  matchBatches,
  matchEvaluations,
  subcategories,
  tools,
} from '~/server/db/schema'
import {
  computeHeadToHead,
  type DecisionRow,
  fetchDecisions,
  type HeadToHeadBreakdownEntry,
  type HeadToHeadResult,
  headToHeadFromDecisions,
  type ModelTier,
  prepareScoringContext,
  rankFromDecisions,
  type WindowType,
  wilsonInterval,
} from '~/server/llm/benchmark/scoring'
import { type PromptLevel, promptLevelSchema } from '~/server/llm/prompts'

type MatchupEntry = {
  category: { id: string; name: string; slug: string }
  toolA: { id: string; name: string; slug: string; logoUrl: string | null }
  toolB: { id: string; name: string; slug: string; logoUrl: string | null }
  result: HeadToHeadResult
}

function matchupKey(categoryId: string, toolAId: string, toolBId: string) {
  return [categoryId, toolAId < toolBId ? toolAId : toolBId, toolAId < toolBId ? toolBId : toolAId]
    .join(':')
    .toLowerCase()
}

type ManualHeadToHeadScope = {
  seasonId?: string
  windowType?: WindowType
  anchorDate?: string
  promptLevel?: PromptLevel
  modelTier?: ModelTier
}

type ManualHeadToHeadBatch = {
  toolAId: string
  toolBId: string
  evaluations: Array<{
    modelSnapshotId: string
    winnerDecision: (typeof matchEvaluations.$inferSelect)['winnerDecision']
    modelSnapshot: {
      name: string
      tier: ModelTier
    }
  }>
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getManualWindowBounds(windowType: WindowType, anchorDate: string) {
  const dayStart = new Date(`${anchorDate}T00:00:00.000Z`)
  const dayEndExclusive = addDaysUtc(dayStart, 1)

  switch (windowType) {
    case 'run_day':
      return { startInclusive: dayStart, endExclusive: dayEndExclusive }
    case 'trailing_7d':
      return { startInclusive: addDaysUtc(dayStart, -6), endExclusive: dayEndExclusive }
    case 'trailing_28d':
      return { startInclusive: addDaysUtc(dayStart, -27), endExclusive: dayEndExclusive }
    case 'season_to_date':
      return { startInclusive: null, endExclusive: dayEndExclusive }
  }
}

function buildHeadToHeadFromManualBatches(args: {
  batches: ManualHeadToHeadBatch[]
  categoryId: string
  toolAId: string
  toolBId: string
  modelTier?: ModelTier
}): HeadToHeadResult | null {
  const { batches, categoryId, toolAId, toolBId, modelTier } = args
  if (batches.length === 0) return null

  let aWins = 0
  let bWins = 0
  let abstains = 0
  const modelBreakdownMap = new Map<string, HeadToHeadBreakdownEntry>()

  for (const batch of batches) {
    const flipped = batch.toolAId !== toolAId
    for (const ev of batch.evaluations) {
      const tier = ev.modelSnapshot.tier as ModelTier
      if (modelTier && tier !== modelTier) continue

      const decision = ev.winnerDecision
      const isA = flipped ? decision === 'tool_b' : decision === 'tool_a'
      const isB = flipped ? decision === 'tool_a' : decision === 'tool_b'

      if (isA) aWins++
      else if (isB) bWins++
      else abstains++

      const msId = ev.modelSnapshotId
      let entry = modelBreakdownMap.get(msId)
      if (!entry) {
        entry = {
          id: msId,
          label: ev.modelSnapshot.name,
          tier,
          aWins: 0,
          bWins: 0,
          abstains: 0,
          otherToolCount: 0,
          decisiveCaseCount: 0,
          aWinRate: 0,
        }
        modelBreakdownMap.set(msId, entry)
      }
      if (isA) {
        entry.aWins++
        entry.decisiveCaseCount++
      } else if (isB) {
        entry.bWins++
        entry.decisiveCaseCount++
      } else entry.abstains++
    }
  }

  const decisiveCaseCount = aWins + bWins
  if (decisiveCaseCount === 0) return null

  const aWinRate = aWins / decisiveCaseCount
  const bWinRate = bWins / decisiveCaseCount
  const ci = wilsonInterval(aWins, decisiveCaseCount)

  return {
    toolAId,
    toolBId,
    categoryId,
    aWins,
    bWins,
    abstains,
    otherToolCount: 0,
    decisiveCaseCount,
    aWinRate,
    bWinRate,
    ciLow: ci.low,
    ciHigh: ci.high,
    weightedAWins: aWins,
    weightedBWins: bWins,
    weightedAWinRate: aWinRate,
    modelBreakdown: Array.from(modelBreakdownMap.values()).map((entry) => ({
      ...entry,
      aWinRate: entry.decisiveCaseCount > 0 ? entry.aWins / entry.decisiveCaseCount : 0,
    })),
    promptBreakdown: [],
    meetsPublicationThreshold: decisiveCaseCount >= 30,
  }
}

async function buildManualHeadToHead(
  database: typeof DatabaseInstance,
  categoryId: string,
  toolAId: string,
  toolBId: string,
  scope?: ManualHeadToHeadScope,
): Promise<HeadToHeadResult | null> {
  // Manual batches do not carry prompt-level metadata, so promptLevel-scoped
  // requests should not return unscoped manual fallback results.
  if (scope?.promptLevel) return null

  const conditions = [
    eq(matchBatches.triggerMode, 'manual'),
    eq(matchBatches.status, 'completed'),
    eq(matchBatches.categoryId, categoryId),
    or(
      and(eq(matchBatches.toolAId, toolAId), eq(matchBatches.toolBId, toolBId)),
      and(eq(matchBatches.toolAId, toolBId), eq(matchBatches.toolBId, toolAId)),
    ),
    scope?.seasonId ? eq(matchBatches.seasonId, scope.seasonId) : undefined,
  ]

  if (scope?.anchorDate) {
    const bounds = getManualWindowBounds(scope.windowType ?? 'trailing_28d', scope.anchorDate)
    conditions.push(lt(matchBatches.createdAt, bounds.endExclusive))
    if (bounds.startInclusive) {
      conditions.push(gte(matchBatches.createdAt, bounds.startInclusive))
    }
  }

  const batches = await database.query.matchBatches.findMany({
    where: and(...conditions),
    orderBy: [desc(matchBatches.createdAt)],
    with: {
      evaluations: {
        where: eq(matchEvaluations.status, 'completed'),
        with: { modelSnapshot: true },
      },
    },
  })

  return buildHeadToHeadFromManualBatches({
    batches,
    categoryId,
    toolAId,
    toolBId,
    modelTier: scope?.modelTier,
  })
}

export const benchmarkMatchRouter = createTRPCRouter({
  headToHead: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100),
          toolASlug: z.string().min(1).max(255),
          toolBSlug: z.string().min(1).max(255),
          seasonId: z.string().uuid().optional(),
          windowType: z
            .enum(['run_day', 'trailing_7d', 'trailing_28d', 'season_to_date'])
            .default('trailing_28d'),
          anchorDate: anchorDateSchema.optional(),
          promptLevel: promptLevelSchema.optional(),
          modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
        })
        .refine((input) => input.toolASlug !== input.toolBSlug, {
          message: 'toolASlug and toolBSlug must be different',
          path: ['toolBSlug'],
        }),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const [category, toolA, toolB] = await Promise.all([
        ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        }),
        ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolASlug),
        }),
        ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolBSlug),
        }),
      ])

      if (!category || !toolA || !toolB) {
        return {
          category: category ?? null,
          toolA: toolA ?? null,
          toolB: toolB ?? null,
          result: null,
        }
      }

      let seasonId = input.seasonId
      if (seasonId) {
        const benchmarkSeasonId = await findBenchmarkSeasonId(ctx.db, seasonId)
        if (!benchmarkSeasonId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'seasonId must reference a benchmark season',
          })
        }
        seasonId = benchmarkSeasonId
      } else {
        const defaultSeasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
        if (!defaultSeasonId) {
          const manualResult = await buildManualHeadToHead(
            ctx.db,
            category.id,
            toolA.id,
            toolB.id,
            {
              windowType: input.windowType,
              anchorDate,
              promptLevel: input.promptLevel,
              modelTier: input.modelTier,
            },
          )
          return { category, toolA, toolB, result: manualResult }
        }
        seasonId = defaultSeasonId
      }

      const benchmarkResult = await computeHeadToHead(ctx.db, {
        categoryId: category.id,
        seasonId,
        toolAId: toolA.id,
        toolBId: toolB.id,
        windowType: input.windowType,
        anchorDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
      })

      // If benchmark data has decisive cases, use it
      if (benchmarkResult.decisiveCaseCount > 0) {
        return { category, toolA, toolB, result: benchmarkResult }
      }

      // Otherwise, fall back to manual match batch data
      const manualResult = await buildManualHeadToHead(ctx.db, category.id, toolA.id, toolB.id, {
        seasonId,
        windowType: input.windowType,
        anchorDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
      })

      return { category, toolA, toolB, result: manualResult ?? benchmarkResult }
    }),

  listFeatured: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(50).default(12),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 12
      const anchorDate = new Date().toISOString().slice(0, 10)

      const matchups: MatchupEntry[] = []
      const seenKeys = new Set<string>()

      // ---------------------------------------------------------------
      // 1. Auto-generated benchmark matchups (top 2 per category)
      // ---------------------------------------------------------------
      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)

      let subs: { id: string; name: string; slug: string }[] = []
      if (input?.categorySlug) {
        const group = await ctx.db.query.categories.findFirst({
          where: eq(categories.slug, input.categorySlug),
          with: {
            subcategories: {
              orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
            },
          },
        })
        subs = group?.subcategories ?? []
      }

      if (seasonId) {
        if (!input?.categorySlug) {
          subs = await ctx.db.query.subcategories.findMany({
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          })
        }

        const scoringCtx = await prepareScoringContext(ctx.db, seasonId, 'trailing_28d', anchorDate)

        if (scoringCtx.runIds.length > 0) {
          const allCategoryIds = subs.map((s) => s.id)
          const allDecisions = await fetchDecisions(ctx.db, scoringCtx.runIds, allCategoryIds)

          const decisionsByCategory = new Map<string, DecisionRow[]>()
          for (const d of allDecisions) {
            let list = decisionsByCategory.get(d.categoryId)
            if (!list) {
              list = []
              decisionsByCategory.set(d.categoryId, list)
            }
            list.push(d)
          }

          for (const sub of subs) {
            if (matchups.length >= limit) break

            const catDecisions = decisionsByCategory.get(sub.id) ?? []
            const ranking = rankFromDecisions(
              catDecisions,
              scoringCtx.weightConfigs,
              sub.id,
              'trailing_28d',
              anchorDate,
            )

            if (ranking.items.length < 2) continue

            const [top1, top2] = ranking.items
            if (!top1 || !top2) continue

            const key = matchupKey(sub.id, top1.toolId, top2.toolId)
            seenKeys.add(key)

            const result = headToHeadFromDecisions(
              catDecisions,
              scoringCtx.weightConfigs,
              top1.toolId,
              top2.toolId,
              sub.id,
            )

            matchups.push({
              category: sub,
              toolA: {
                id: top1.toolId,
                name: top1.toolName,
                slug: top1.toolSlug,
                logoUrl: top1.toolLogoUrl,
              },
              toolB: {
                id: top2.toolId,
                name: top2.toolName,
                slug: top2.toolSlug,
                logoUrl: top2.toolLogoUrl,
              },
              result,
            })
          }
        }
      }

      // ---------------------------------------------------------------
      // 2. Fill remaining slots with manual match batches
      // ---------------------------------------------------------------
      if (matchups.length < limit) {
        const scopedSubcategoryIds = input?.categorySlug ? subs.map((sub) => sub.id) : null
        const manualBatches =
          scopedSubcategoryIds && scopedSubcategoryIds.length === 0
            ? []
            : await ctx.db.query.matchBatches.findMany({
                where: and(
                  eq(matchBatches.triggerMode, 'manual'),
                  eq(matchBatches.status, 'completed'),
                  scopedSubcategoryIds
                    ? inArray(matchBatches.categoryId, scopedSubcategoryIds)
                    : undefined,
                ),
                orderBy: [desc(matchBatches.createdAt)],
                with: {
                  category: true,
                  toolA: true,
                  toolB: true,
                  evaluations: {
                    where: eq(matchEvaluations.status, 'completed'),
                    with: { modelSnapshot: true },
                  },
                },
              })

        type ManualBatch = (typeof manualBatches)[number]
        const groupedBatchesByKey = new Map<
          string,
          {
            representative: ManualBatch
            batches: ManualBatch[]
          }
        >()

        for (const batch of manualBatches) {
          const key = matchupKey(batch.categoryId, batch.toolAId, batch.toolBId)
          let grouped = groupedBatchesByKey.get(key)
          if (!grouped) {
            grouped = { representative: batch, batches: [] }
            groupedBatchesByKey.set(key, grouped)
          }
          grouped.batches.push(batch)
        }

        for (const [key, grouped] of groupedBatchesByKey) {
          if (matchups.length >= limit) break

          if (seenKeys.has(key)) continue
          const { representative, batches } = grouped
          const result = buildHeadToHeadFromManualBatches({
            batches,
            categoryId: representative.categoryId,
            toolAId: representative.toolAId,
            toolBId: representative.toolBId,
          })
          if (!result) continue

          seenKeys.add(key)

          matchups.push({
            category: representative.category,
            toolA: {
              id: representative.toolA.id,
              name: representative.toolA.name,
              slug: representative.toolA.slug,
              logoUrl: representative.toolA.logoUrl,
            },
            toolB: {
              id: representative.toolB.id,
              name: representative.toolB.name,
              slug: representative.toolB.slug,
              logoUrl: representative.toolB.logoUrl,
            },
            result,
          })
        }
      }

      return matchups
    }),
})
