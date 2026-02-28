import { and, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { categories, llms, recommendations, runResults, tools } from '~/server/db/schema'

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

export const rankingRouter = createTRPCRouter({
  byCategorySlug: publicProcedure
    .input(
      z.object({
        categorySlug: z.string().min(1).max(100),
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const category = await ctx.db.query.categories.findFirst({
        where: eq(categories.slug, input.categorySlug),
      })
      if (!category) {
        return {
          category: null,
          window: null,
          items: [],
        }
      }

      const now = new Date()
      const currentStart = daysAgo(input.days)
      const previousStart = new Date(currentStart)
      previousStart.setDate(previousStart.getDate() - input.days)

      const [currentRows, previousRows] = await Promise.all([
        ctx.db
          .select({
            toolId: tools.id,
            toolName: tools.name,
            toolSlug: tools.slug,
            llmId: llms.id,
          })
          .from(recommendations)
          .innerJoin(tools, eq(recommendations.toolId, tools.id))
          .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
          .innerJoin(llms, eq(runResults.llmId, llms.id))
          .where(
            and(
              eq(recommendations.categoryId, category.id),
              gte(recommendations.createdAt, currentStart),
              lte(recommendations.createdAt, now),
            ),
          ),
        ctx.db
          .select({
            toolId: recommendations.toolId,
          })
          .from(recommendations)
          .where(
            and(
              eq(recommendations.categoryId, category.id),
              gte(recommendations.createdAt, previousStart),
              lte(recommendations.createdAt, currentStart),
            ),
          ),
      ])

      const currentCounts = new Map<string, number>()
      const previousCounts = new Map<string, number>()
      const llmsByTool = new Map<string, Set<string>>()
      const toolMeta = new Map<string, { id: string; name: string; slug: string }>()
      const allCurrentLlms = new Set<string>()

      for (const row of currentRows) {
        currentCounts.set(row.toolId, (currentCounts.get(row.toolId) ?? 0) + 1)
        allCurrentLlms.add(row.llmId)
        if (!llmsByTool.has(row.toolId)) llmsByTool.set(row.toolId, new Set())
        llmsByTool.get(row.toolId)?.add(row.llmId)
        toolMeta.set(row.toolId, {
          id: row.toolId,
          name: row.toolName,
          slug: row.toolSlug,
        })
      }

      for (const row of previousRows) {
        previousCounts.set(row.toolId, (previousCounts.get(row.toolId) ?? 0) + 1)
      }

      const currentTotal = currentRows.length
      const previousTotal = previousRows.length

      const items = Array.from(toolMeta.values()).map((tool) => {
        const currentCount = currentCounts.get(tool.id) ?? 0
        const previousCount = previousCounts.get(tool.id) ?? 0
        const recommendationRate = currentTotal > 0 ? currentCount / currentTotal : 0
        const previousRate = previousTotal > 0 ? previousCount / previousTotal : 0
        const trend = recommendationRate - previousRate
        const consistencyScore =
          allCurrentLlms.size > 0 ? (llmsByTool.get(tool.id)?.size ?? 0) / allCurrentLlms.size : 0

        return {
          tool,
          recommendationCount: currentCount,
          recommendationRate,
          trend,
          consistencyScore,
        }
      })

      items.sort(
        (a, b) =>
          b.recommendationRate - a.recommendationRate ||
          b.consistencyScore - a.consistencyScore ||
          b.recommendationCount - a.recommendationCount,
      )

      return {
        category,
        window: {
          start: currentStart,
          end: now,
        },
        items: items.slice(0, input.limit),
      }
    }),

  overall: publicProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const currentStart = daysAgo(input.days)
      const previousStart = new Date(currentStart)
      previousStart.setDate(previousStart.getDate() - input.days)

      const [currentRows, previousRows] = await Promise.all([
        ctx.db
          .select({
            toolId: tools.id,
            toolName: tools.name,
            toolSlug: tools.slug,
            llmId: llms.id,
            categoryId: categories.id,
          })
          .from(recommendations)
          .innerJoin(tools, eq(recommendations.toolId, tools.id))
          .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
          .innerJoin(llms, eq(runResults.llmId, llms.id))
          .innerJoin(categories, eq(recommendations.categoryId, categories.id))
          .where(
            and(gte(recommendations.createdAt, currentStart), lte(recommendations.createdAt, now)),
          ),
        ctx.db
          .select({
            toolId: recommendations.toolId,
          })
          .from(recommendations)
          .where(
            and(
              gte(recommendations.createdAt, previousStart),
              lte(recommendations.createdAt, currentStart),
            ),
          ),
      ])

      const currentCounts = new Map<string, number>()
      const previousCounts = new Map<string, number>()
      const llmsByTool = new Map<string, Set<string>>()
      const categoriesByTool = new Map<string, Set<string>>()
      const toolMeta = new Map<string, { id: string; name: string; slug: string }>()
      const allCurrentLlms = new Set<string>()
      const allCurrentCategories = new Set<string>()

      for (const row of currentRows) {
        currentCounts.set(row.toolId, (currentCounts.get(row.toolId) ?? 0) + 1)
        if (!llmsByTool.has(row.toolId)) llmsByTool.set(row.toolId, new Set())
        llmsByTool.get(row.toolId)?.add(row.llmId)
        if (!categoriesByTool.has(row.toolId)) categoriesByTool.set(row.toolId, new Set())
        categoriesByTool.get(row.toolId)?.add(row.categoryId)
        allCurrentLlms.add(row.llmId)
        allCurrentCategories.add(row.categoryId)
        toolMeta.set(row.toolId, {
          id: row.toolId,
          name: row.toolName,
          slug: row.toolSlug,
        })
      }

      for (const row of previousRows) {
        previousCounts.set(row.toolId, (previousCounts.get(row.toolId) ?? 0) + 1)
      }

      const currentTotal = currentRows.length
      const previousTotal = previousRows.length

      const items = Array.from(toolMeta.values()).map((tool) => {
        const currentCount = currentCounts.get(tool.id) ?? 0
        const previousCount = previousCounts.get(tool.id) ?? 0
        const recommendationRate = currentTotal > 0 ? currentCount / currentTotal : 0
        const previousRate = previousTotal > 0 ? previousCount / previousTotal : 0
        const trend = recommendationRate - previousRate
        const consistencyScore =
          allCurrentLlms.size > 0 ? (llmsByTool.get(tool.id)?.size ?? 0) / allCurrentLlms.size : 0
        const categoryCoverage = categoriesByTool.get(tool.id)?.size ?? 0
        const normalizedCoverage =
          allCurrentCategories.size > 0 ? categoryCoverage / allCurrentCategories.size : 0
        const score = recommendationRate * 0.6 + consistencyScore * 0.3 + normalizedCoverage * 0.1

        return {
          tool,
          recommendationCount: currentCount,
          recommendationRate,
          trend,
          consistencyScore,
          categoryCoverage,
          score,
        }
      })

      items.sort((a, b) => b.score - a.score || b.recommendationRate - a.recommendationRate)

      return {
        window: {
          start: currentStart,
          end: now,
        },
        items: items.slice(0, input.limit),
      }
    }),
})
