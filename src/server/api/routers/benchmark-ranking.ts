import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  anchorDateSchema,
  findBenchmarkSeasonId,
  findLatestPublishedBenchmarkSeasonId,
} from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { categories, subcategories } from '~/server/db/schema'
import {
  type CategoryRankingResult,
  computeCategoryRanking,
  type ToolRankingEntry,
  wilsonInterval,
} from '~/server/llm/benchmark/scoring'

const windowTypeSchema = z
  .enum(['run_day', 'trailing_7d', 'trailing_28d', 'season_to_date'])
  .default('trailing_28d')

const tierFiltersSchema = z.object({
  promptTier: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
})

async function resolveSeasonId(
  db: Parameters<typeof findBenchmarkSeasonId>[0],
  anchorDate: string,
  seasonId?: string,
) {
  if (seasonId) {
    const id = await findBenchmarkSeasonId(db, seasonId)
    if (!id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'seasonId must reference a benchmark season',
      })
    }
    return id
  }
  return findLatestPublishedBenchmarkSeasonId(db, anchorDate)
}

export const benchmarkRankingRouter = createTRPCRouter({
  byCategory: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100),
          seasonId: z.string().uuid().optional(),
          windowType: windowTypeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const category = await ctx.db.query.subcategories.findFirst({
        where: eq(subcategories.slug, input.categorySlug),
        with: { categoryGroup: true },
      })
      if (!category) {
        return { category: null, ranking: null }
      }

      const seasonId = await resolveSeasonId(ctx.db, anchorDate, input.seasonId)
      if (!seasonId) {
        return { category, ranking: null }
      }

      const ranking = await computeCategoryRanking(ctx.db, {
        categoryId: category.id,
        seasonId,
        windowType: input.windowType,
        anchorDate,
        promptTier: input.promptTier,
        modelTier: input.modelTier,
      })

      return { category, ranking }
    }),

  byCategoryGroup: publicProcedure
    .input(
      z
        .object({
          groupSlug: z.string().min(1).max(100),
          seasonId: z.string().uuid().optional(),
          windowType: windowTypeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const group = await ctx.db.query.categories.findFirst({
        where: eq(categories.slug, input.groupSlug),
        with: {
          subcategories: {
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          },
        },
      })
      if (!group) {
        return { categoryGroup: null, ranking: null }
      }

      if (group.subcategories.length === 0) {
        return { categoryGroup: group, ranking: null }
      }

      const seasonId = await resolveSeasonId(ctx.db, anchorDate, input.seasonId)
      if (!seasonId) {
        return { categoryGroup: group, ranking: null }
      }

      const subRankings = await Promise.all(
        group.subcategories.map((sub) =>
          computeCategoryRanking(ctx.db, {
            categoryId: sub.id,
            seasonId,
            windowType: input.windowType,
            anchorDate,
            promptTier: input.promptTier,
            modelTier: input.modelTier,
          }),
        ),
      )

      const ranking = mergeGroupRankings(subRankings, input.windowType, anchorDate)

      return { categoryGroup: group, ranking }
    }),
})

function mergeGroupRankings(
  subRankings: CategoryRankingResult[],
  windowType: CategoryRankingResult['windowType'],
  anchorDate: string,
): CategoryRankingResult {
  const toolMap = new Map<
    string,
    { entry: ToolRankingEntry; weightedSupport: number; rawSupport: number }
  >()

  let totalEligible = 0
  let totalWeightedEligible = 0

  for (const sub of subRankings) {
    totalEligible += sub.totalEligibleDecisions
    // Each sub-ranking's items share the same weightedEligible denominator
    if (sub.items.length > 0) {
      totalWeightedEligible += sub.items[0]!.weightedEligible
    }
    for (const item of sub.items) {
      const existing = toolMap.get(item.toolId)
      if (existing) {
        existing.weightedSupport += item.weightedSupport
        existing.rawSupport += item.rawSupportCount
      } else {
        toolMap.set(item.toolId, {
          entry: item,
          weightedSupport: item.weightedSupport,
          rawSupport: item.rawSupportCount,
        })
      }
    }
  }

  const totalDistinctModels = Math.max(...subRankings.map((s) => s.totalDistinctModels), 0)
  const totalDistinctPrompts = Math.max(...subRankings.map((s) => s.totalDistinctPrompts), 0)

  const items: ToolRankingEntry[] = Array.from(toolMap.values()).map((agg) => {
    const weightedSupportRate =
      totalWeightedEligible > 0 ? agg.weightedSupport / totalWeightedEligible : 0
    const rawSupportRate = totalEligible > 0 ? agg.rawSupport / totalEligible : 0
    const ci = wilsonInterval(agg.rawSupport, totalEligible)

    return {
      ...agg.entry,
      weightedSupport: agg.weightedSupport,
      weightedEligible: totalWeightedEligible,
      weightedSupportRate,
      rawSupportCount: agg.rawSupport,
      rawEligibleCount: totalEligible,
      rawSupportRate,
      ciLow: ci.low,
      ciHigh: ci.high,
    }
  })

  items.sort(
    (a, b) =>
      b.weightedSupportRate - a.weightedSupportRate ||
      b.ciLow - a.ciLow ||
      b.rawSupportCount - a.rawSupportCount,
  )

  return {
    categoryId: 'group',
    windowType,
    anchorDate,
    items,
    totalEligibleDecisions: totalEligible,
    totalDistinctModels,
    totalDistinctPrompts,
    meetsPublicationThreshold:
      totalEligible >= 100 && totalDistinctModels >= 3 && totalDistinctPrompts >= 3,
  }
}
