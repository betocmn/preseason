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
import {
  computeHeadToHead,
  type DecisionRow,
  fetchDecisions,
  headToHeadFromDecisions,
  prepareScoringContext,
  rankFromDecisions,
} from '~/server/llm/benchmark/scoring'
import { promptLevelSchema } from '~/server/llm/prompts'

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
        promptLevel: input.promptLevel,
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

      // Fetch shared scoring data once for all subcategories
      const scoringCtx = await prepareScoringContext(ctx.db, seasonId, 'trailing_28d', anchorDate)
      if (scoringCtx.runIds.length === 0) return []

      const allCategoryIds = subs.map((s) => s.id)
      const allDecisions = await fetchDecisions(ctx.db, scoringCtx.runIds, allCategoryIds)

      // Group decisions by category
      const decisionsByCategory = new Map<string, DecisionRow[]>()
      for (const d of allDecisions) {
        let list = decisionsByCategory.get(d.categoryId)
        if (!list) {
          list = []
          decisionsByCategory.set(d.categoryId, list)
        }
        list.push(d)
      }

      // For each subcategory, get top 2 tools and create a head-to-head
      type HeadToHeadResult = ReturnType<typeof headToHeadFromDecisions>
      const matchups: {
        category: { id: string; name: string; slug: string }
        toolA: { id: string; name: string; slug: string; logoUrl: string | null }
        toolB: { id: string; name: string; slug: string; logoUrl: string | null }
        result: HeadToHeadResult
      }[] = []

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

      return matchups
    }),

  listByTool: publicProcedure
    .input(
      z.object({
        toolSlug: z.string().min(1).max(255),
        limit: z.number().int().min(1).max(50).default(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = new Date().toISOString().slice(0, 10)

      const tool = await ctx.db.query.tools.findFirst({
        where: eq(tools.slug, input.toolSlug),
        with: {
          toolCategories: {
            with: { category: true },
          },
        },
      })
      if (!tool) return []

      const subs = tool.toolCategories.map((tc) => tc.category)
      if (subs.length === 0) return []

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
      if (!seasonId) return []

      const scoringCtx = await prepareScoringContext(ctx.db, seasonId, 'trailing_28d', anchorDate)
      if (scoringCtx.runIds.length === 0) return []

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

      type HeadToHeadResult = ReturnType<typeof headToHeadFromDecisions>
      const matchups: {
        category: { id: string; name: string; slug: string }
        toolA: { id: string; name: string; slug: string; logoUrl: string | null }
        toolB: { id: string; name: string; slug: string; logoUrl: string | null }
        result: HeadToHeadResult
      }[] = []

      for (const sub of subs) {
        const catDecisions = decisionsByCategory.get(sub.id) ?? []
        const ranking = rankFromDecisions(
          catDecisions,
          scoringCtx.weightConfigs,
          sub.id,
          'trailing_28d',
          anchorDate,
        )

        const toolIndex = ranking.items.findIndex((item) => item.toolId === tool.id)
        if (toolIndex === -1 || ranking.items.length < 2) continue

        // Pick the closest rival: the tool above in ranking, or #2 if this tool is #1
        const rivalIndex = toolIndex === 0 ? 1 : toolIndex - 1
        const rival = ranking.items[rivalIndex]
        const thisToolEntry = ranking.items[toolIndex]
        if (!rival || !thisToolEntry) continue

        // Always put this tool as toolA for consistent display
        const result = headToHeadFromDecisions(
          catDecisions,
          scoringCtx.weightConfigs,
          tool.id,
          rival.toolId,
          sub.id,
        )

        matchups.push({
          category: sub,
          toolA: {
            id: tool.id,
            name: tool.name,
            slug: tool.slug,
            logoUrl: tool.logoUrl,
          },
          toolB: {
            id: rival.toolId,
            name: rival.toolName,
            slug: rival.toolSlug,
            logoUrl: rival.toolLogoUrl,
          },
          result,
        })
      }

      // Sort by decisive case count descending, take limit
      matchups.sort((a, b) => b.result.decisiveCaseCount - a.result.decisiveCaseCount)
      return matchups.slice(0, input.limit)
    }),
})
