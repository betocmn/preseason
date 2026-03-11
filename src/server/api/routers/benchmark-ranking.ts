import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  anchorDateSchema,
  findBenchmarkSeasonId,
  findLatestActiveBenchmarkSeasonId,
} from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { subcategories } from '~/server/db/schema'
import { computeCategoryRanking } from '~/server/llm/benchmark/scoring'

export const benchmarkRankingRouter = createTRPCRouter({
  byCategory: publicProcedure
    .input(
      z.object({
        categorySlug: z.string().min(1).max(100),
        seasonId: z.string().uuid().optional(),
        windowType: z
          .enum(['run_day', 'trailing_7d', 'trailing_28d', 'season_to_date'])
          .default('trailing_28d'),
        anchorDate: anchorDateSchema.optional(),
        promptTier: z.enum(['basic', 'intermediate', 'advanced']).optional(),
        modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const category = await ctx.db.query.subcategories.findFirst({
        where: eq(subcategories.slug, input.categorySlug),
        with: { categoryGroup: true },
      })
      if (!category) {
        return { category: null, ranking: null }
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
        const defaultSeasonId = await findLatestActiveBenchmarkSeasonId(ctx.db)
        if (!defaultSeasonId) {
          return { category, ranking: null }
        }
        seasonId = defaultSeasonId
      }

      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)

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
})
