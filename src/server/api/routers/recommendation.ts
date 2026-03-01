import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import {
  llms,
  prompts,
  recommendations,
  runResults,
  runs,
  subcategories,
  tools,
} from '~/server/db/schema'

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

export const recommendationRouter = createTRPCRouter({
  getFeed: publicProcedure
    .input(
      paginationInputSchema.extend({
        categorySlug: z.string().min(1).max(100).optional(),
        toolSlug: z.string().min(1).max(255).optional(),
        llmSlug: z.string().min(1).max(255).optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let categoryId: string | undefined
      let toolId: string | undefined
      let llmId: string | undefined

      if (input.categorySlug) {
        const category = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        })
        if (!category) {
          return { items: [], total: 0, limit: input.limit, offset: input.offset }
        }
        categoryId = category.id
      }

      if (input.toolSlug) {
        const tool = await ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolSlug),
        })
        if (!tool) {
          return { items: [], total: 0, limit: input.limit, offset: input.offset }
        }
        toolId = tool.id
      }

      if (input.llmSlug) {
        const llm = await ctx.db.query.llms.findFirst({
          where: eq(llms.slug, input.llmSlug),
        })
        if (!llm) {
          return { items: [], total: 0, limit: input.limit, offset: input.offset }
        }
        llmId = llm.id
      }

      const where = and(
        categoryId ? eq(recommendations.categoryId, categoryId) : undefined,
        toolId ? eq(recommendations.toolId, toolId) : undefined,
        llmId ? eq(runResults.llmId, llmId) : undefined,
        input.dateFrom ? gte(recommendations.createdAt, input.dateFrom) : undefined,
        input.dateTo ? lte(recommendations.createdAt, input.dateTo) : undefined,
      )

      const countRows = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(recommendations)
        .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
        .where(where)
      const total = Number(countRows[0]?.count ?? 0)

      const rows = await ctx.db
        .select({
          recommendationId: recommendations.id,
          recommendationCreatedAt: recommendations.createdAt,
          confidence: recommendations.confidence,
          reasoning: recommendations.reasoning,
          rank: recommendations.rank,
          toolId: tools.id,
          toolName: tools.name,
          toolSlug: tools.slug,
          categoryId: subcategories.id,
          categoryName: subcategories.name,
          categorySlug: subcategories.slug,
          categoryGroupSlug: subcategories.categoryId,
          llmId: llms.id,
          llmName: llms.name,
          llmSlug: llms.slug,
          promptId: prompts.id,
          promptTitle: prompts.title,
          promptSlug: prompts.slug,
          runId: runs.id,
          runStatus: runs.status,
        })
        .from(recommendations)
        .innerJoin(tools, eq(recommendations.toolId, tools.id))
        .innerJoin(subcategories, eq(recommendations.categoryId, subcategories.id))
        .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
        .innerJoin(llms, eq(runResults.llmId, llms.id))
        .innerJoin(prompts, eq(runResults.promptId, prompts.id))
        .innerJoin(runs, eq(runResults.runId, runs.id))
        .where(where)
        .orderBy(desc(recommendations.createdAt))
        .limit(input.limit)
        .offset(input.offset)

      return {
        items: rows.map((row) => ({
          id: row.recommendationId,
          createdAt: row.recommendationCreatedAt,
          confidence: row.confidence,
          reasoning: row.reasoning,
          rank: row.rank,
          tool: {
            id: row.toolId,
            name: row.toolName,
            slug: row.toolSlug,
          },
          category: {
            id: row.categoryId,
            name: row.categoryName,
            slug: row.categorySlug,
          },
          llm: {
            id: row.llmId,
            name: row.llmName,
            slug: row.llmSlug,
          },
          prompt: {
            id: row.promptId,
            title: row.promptTitle,
            slug: row.promptSlug,
          },
          run: {
            id: row.runId,
            status: row.runStatus,
          },
        })),
        total,
        limit: input.limit,
        offset: input.offset,
      }
    }),

  getStats: publicProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        categorySlug: z.string().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const startDate = daysAgo(input.days)

      let categoryId: string | undefined
      if (input.categorySlug) {
        const category = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        })
        if (!category) {
          return {
            windowDays: input.days,
            windowStart: startDate,
            windowEnd: new Date(),
            items: [],
          }
        }
        categoryId = category.id
      }

      const rows = await ctx.db
        .select({
          toolId: tools.id,
          toolName: tools.name,
          toolSlug: tools.slug,
          categoryId: subcategories.id,
          categoryName: subcategories.name,
          categorySlug: subcategories.slug,
        })
        .from(recommendations)
        .innerJoin(tools, eq(recommendations.toolId, tools.id))
        .innerJoin(subcategories, eq(recommendations.categoryId, subcategories.id))
        .where(
          and(
            gte(recommendations.createdAt, startDate),
            categoryId ? eq(recommendations.categoryId, categoryId) : undefined,
          ),
        )

      const countsByToolCategory = new Map<string, number>()
      const categoryTotals = new Map<string, number>()

      for (const row of rows) {
        const key = `${row.categoryId}:${row.toolId}`
        countsByToolCategory.set(key, (countsByToolCategory.get(key) ?? 0) + 1)
        categoryTotals.set(row.categoryId, (categoryTotals.get(row.categoryId) ?? 0) + 1)
      }

      const seen = new Set<string>()
      const items = []
      for (const row of rows) {
        const key = `${row.categoryId}:${row.toolId}`
        if (seen.has(key)) continue
        seen.add(key)

        const recommendationCount = countsByToolCategory.get(key) ?? 0
        const categoryTotal = categoryTotals.get(row.categoryId) ?? 0
        const rate = categoryTotal > 0 ? recommendationCount / categoryTotal : 0

        items.push({
          category: {
            id: row.categoryId,
            name: row.categoryName,
            slug: row.categorySlug,
          },
          tool: {
            id: row.toolId,
            name: row.toolName,
            slug: row.toolSlug,
          },
          recommendationCount,
          categoryTotal,
          rate,
        })
      }

      items.sort((a, b) => b.rate - a.rate || b.recommendationCount - a.recommendationCount)

      return {
        windowDays: input.days,
        windowStart: startDate,
        windowEnd: new Date(),
        items,
      }
    }),

  getTrending: publicProcedure
    .input(
      z.object({
        currentWindowDays: z.number().int().min(1).max(90).default(7),
        previousWindowDays: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(100).default(10),
        categorySlug: z.string().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const currentStart = daysAgo(input.currentWindowDays)
      const previousStart = new Date(currentStart)
      previousStart.setDate(previousStart.getDate() - input.previousWindowDays)

      let categoryId: string | undefined
      if (input.categorySlug) {
        const category = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        })
        if (!category) {
          return {
            windows: {
              current: { start: currentStart, end: now },
              previous: { start: previousStart, end: currentStart },
            },
            items: [],
          }
        }
        categoryId = category.id
      }

      const rows = await ctx.db
        .select({
          toolId: tools.id,
          toolName: tools.name,
          toolSlug: tools.slug,
          createdAt: recommendations.createdAt,
        })
        .from(recommendations)
        .innerJoin(tools, eq(recommendations.toolId, tools.id))
        .where(
          and(
            gte(recommendations.createdAt, previousStart),
            lte(recommendations.createdAt, now),
            categoryId ? eq(recommendations.categoryId, categoryId) : undefined,
          ),
        )

      const currentCounts = new Map<string, number>()
      const previousCounts = new Map<string, number>()
      const toolMeta = new Map<string, { id: string; name: string; slug: string }>()
      let currentTotal = 0
      let previousTotal = 0

      for (const row of rows) {
        toolMeta.set(row.toolId, { id: row.toolId, name: row.toolName, slug: row.toolSlug })
        if (row.createdAt >= currentStart) {
          currentCounts.set(row.toolId, (currentCounts.get(row.toolId) ?? 0) + 1)
          currentTotal += 1
        } else {
          previousCounts.set(row.toolId, (previousCounts.get(row.toolId) ?? 0) + 1)
          previousTotal += 1
        }
      }

      const items = Array.from(toolMeta.values()).map((tool) => {
        const currentCount = currentCounts.get(tool.id) ?? 0
        const previousCount = previousCounts.get(tool.id) ?? 0
        const currentRate = currentTotal > 0 ? currentCount / currentTotal : 0
        const previousRate = previousTotal > 0 ? previousCount / previousTotal : 0
        const rateChange = currentRate - previousRate

        return {
          tool,
          current: {
            count: currentCount,
            rate: currentRate,
          },
          previous: {
            count: previousCount,
            rate: previousRate,
          },
          rateChange,
          direction: rateChange > 0 ? 'up' : rateChange < 0 ? 'down' : 'flat',
        }
      })

      items.sort((a, b) => Math.abs(b.rateChange) - Math.abs(a.rateChange))

      return {
        windows: {
          current: { start: currentStart, end: now },
          previous: { start: previousStart, end: currentStart },
        },
        items: items.slice(0, input.limit),
      }
    }),
})
