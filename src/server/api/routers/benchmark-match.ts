import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { anchorDateSchema, findLatestActiveBenchmarkSeasonId } from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { subcategories, tools } from '~/server/db/schema'
import { computeHeadToHead } from '~/server/llm/benchmark/scoring'

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
          promptTier: z.enum(['basic', 'intermediate', 'advanced']).optional(),
          modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
        })
        .refine((input) => input.toolASlug !== input.toolBSlug, {
          message: 'toolASlug and toolBSlug must be different',
          path: ['toolBSlug'],
        }),
    )
    .query(async ({ ctx, input }) => {
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
        return { category, toolA: toolA ?? null, toolB: toolB ?? null, result: null }
      }

      let seasonId = input.seasonId
      if (!seasonId) {
        const defaultSeasonId = await findLatestActiveBenchmarkSeasonId(ctx.db)
        if (!defaultSeasonId) {
          return { category, toolA, toolB, result: null }
        }
        seasonId = defaultSeasonId
      }

      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)

      const result = await computeHeadToHead(ctx.db, {
        categoryId: category.id,
        seasonId,
        toolAId: toolA.id,
        toolBId: toolB.id,
        windowType: input.windowType,
        anchorDate,
        promptTier: input.promptTier,
        modelTier: input.modelTier,
      })

      return { category, toolA, toolB, result }
    }),
})
