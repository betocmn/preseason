import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  anchorDateSchema,
  findBenchmarkSeasonId,
  findLatestPublishedBenchmarkSeasonId,
} from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { categories, subcategories, tools } from '~/server/db/schema'
import { computeCategoryRanking, computeHeadToHead } from '~/server/llm/benchmark/scoring'

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
          return { category, toolA, toolB, result: null }
        }
        seasonId = defaultSeasonId
      }

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

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
      if (!seasonId) return []

      // Get subcategories to generate matchups from
      let subs: { id: string; name: string; slug: string }[]
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
      } else {
        subs = await ctx.db.query.subcategories.findMany({
          orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
        })
      }

      // For each subcategory, get top 2 tools and create a head-to-head
      const matchups: {
        category: { id: string; name: string; slug: string }
        toolA: { id: string; name: string; slug: string; logoUrl: string | null }
        toolB: { id: string; name: string; slug: string; logoUrl: string | null }
        result: Awaited<ReturnType<typeof computeHeadToHead>>
      }[] = []

      for (const sub of subs) {
        if (matchups.length >= limit) break

        const ranking = await computeCategoryRanking(ctx.db, {
          categoryId: sub.id,
          seasonId,
          windowType: 'trailing_28d',
          anchorDate,
        })

        if (ranking.items.length < 2) continue

        const top1 = ranking.items[0]!
        const top2 = ranking.items[1]!

        const result = await computeHeadToHead(ctx.db, {
          categoryId: sub.id,
          seasonId,
          toolAId: top1.toolId,
          toolBId: top2.toolId,
          windowType: 'trailing_28d',
          anchorDate,
        })

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

      return matchups
    }),
})
