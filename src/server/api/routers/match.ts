import { TRPCError } from '@trpc/server'
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { buildMatchSlug, deduplicateSlug } from '~/lib/slug'
import { requireRole } from '~/server/api/helpers/auth'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import {
  categories,
  llms,
  matches,
  prompts,
  recommendations,
  runResults,
  subcategories,
  tools,
} from '~/server/db/schema'

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getMatchRange(periodStart: string, periodEnd: string, settledAt: Date | null) {
  const start = new Date(`${periodStart}T00:00:00.000Z`)
  const periodEndAt = new Date(`${periodEnd}T23:59:59.999Z`)
  if (!settledAt) return { start, end: periodEndAt }
  return { start, end: periodEndAt < settledAt ? periodEndAt : settledAt }
}

async function buildBreakdown(
  db: typeof import('~/server/db').db,
  match: typeof matches.$inferSelect,
) {
  const range = getMatchRange(match.periodStart, match.periodEnd, match.settledAt)
  const rows = await db
    .select({
      toolId: recommendations.toolId,
      llmId: llms.id,
      llmName: llms.name,
      llmSlug: llms.slug,
      promptId: prompts.id,
      promptTitle: prompts.title,
      promptSlug: prompts.slug,
    })
    .from(recommendations)
    .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
    .innerJoin(llms, eq(runResults.llmId, llms.id))
    .innerJoin(prompts, eq(runResults.promptId, prompts.id))
    .where(
      and(
        eq(recommendations.categoryId, match.categoryId),
        inArray(recommendations.toolId, [match.toolAId, match.toolBId]),
        gte(recommendations.createdAt, range.start),
        lte(recommendations.createdAt, range.end),
      ),
    )

  const llmMap = new Map<
    string,
    {
      llm: { id: string; name: string; slug: string }
      toolA: number
      toolB: number
    }
  >()
  const promptMap = new Map<
    string,
    {
      prompt: { id: string; title: string; slug: string }
      toolA: number
      toolB: number
    }
  >()

  for (const row of rows) {
    const llmEntry = llmMap.get(row.llmId) ?? {
      llm: { id: row.llmId, name: row.llmName, slug: row.llmSlug },
      toolA: 0,
      toolB: 0,
    }
    if (row.toolId === match.toolAId) llmEntry.toolA += 1
    if (row.toolId === match.toolBId) llmEntry.toolB += 1
    llmMap.set(row.llmId, llmEntry)

    const promptEntry = promptMap.get(row.promptId) ?? {
      prompt: { id: row.promptId, title: row.promptTitle, slug: row.promptSlug },
      toolA: 0,
      toolB: 0,
    }
    if (row.toolId === match.toolAId) promptEntry.toolA += 1
    if (row.toolId === match.toolBId) promptEntry.toolB += 1
    promptMap.set(row.promptId, promptEntry)
  }

  const byLlm = Array.from(llmMap.values()).map((entry) => {
    const total = entry.toolA + entry.toolB
    return {
      ...entry,
      total,
      toolAPct: total > 0 ? entry.toolA / total : 0,
      toolBPct: total > 0 ? entry.toolB / total : 0,
    }
  })

  const byPrompt = Array.from(promptMap.values()).map((entry) => {
    const total = entry.toolA + entry.toolB
    return {
      ...entry,
      total,
      toolAPct: total > 0 ? entry.toolA / total : 0,
      toolBPct: total > 0 ? entry.toolB / total : 0,
    }
  })

  const totalToolA = rows.filter((row) => row.toolId === match.toolAId).length
  const totalToolB = rows.filter((row) => row.toolId === match.toolBId).length

  return {
    byLlm,
    byPrompt,
    totals: {
      toolA: totalToolA,
      toolB: totalToolB,
      recommendations: totalToolA + totalToolB,
      prompts: byPrompt.length,
    },
  }
}

export const matchRouter = createTRPCRouter({
  listAll: protectedProcedure
    .input(
      paginationInputSchema.extend({
        status: z.enum(['active', 'settled', 'archived']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const where = input.status ? eq(matches.status, input.status) : undefined

      const countRows = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(matches)
        .where(where)
      const total = Number(countRows[0]?.count ?? 0)

      const items = await ctx.db.query.matches.findMany({
        where,
        orderBy: [desc(matches.startedAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          toolA: true,
          toolB: true,
          category: true,
          winner: true,
        },
      })

      return {
        items,
        total,
        limit: input.limit,
        offset: input.offset,
      }
    }),

  listActive: publicProcedure
    .input(
      z
        .object({
          groupSlug: z.string().min(1).max(100).optional(),
          categorySlug: z.string().min(1).max(100).optional(),
          toolSlug: z.string().min(1).max(255).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let categoryIds: string[] | undefined

      if (input?.categorySlug) {
        const sub = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        })
        if (!sub) return []
        categoryIds = [sub.id]
      } else if (input?.groupSlug) {
        const group = await ctx.db.query.categories.findFirst({
          where: eq(categories.slug, input.groupSlug),
          with: { subcategories: true },
        })
        if (!group || group.subcategories.length === 0) return []
        categoryIds = group.subcategories.map((s) => s.id)
      }

      let toolId: string | undefined
      if (input?.toolSlug) {
        const tool = await ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolSlug),
        })
        if (!tool) return []
        toolId = tool.id
      }

      return ctx.db.query.matches.findMany({
        where: and(
          eq(matches.status, 'active'),
          categoryIds ? inArray(matches.categoryId, categoryIds) : undefined,
          toolId
            ? sql`(${matches.toolAId} = ${toolId} OR ${matches.toolBId} = ${toolId})`
            : undefined,
        ),
        orderBy: [desc(matches.startedAt)],
        with: {
          toolA: true,
          toolB: true,
          category: true,
          winner: true,
        },
      })
    }),

  listSettled: publicProcedure
    .input(
      paginationInputSchema.extend({
        groupSlug: z.string().min(1).max(100).optional(),
        categorySlug: z.string().min(1).max(100).optional(),
        toolSlug: z.string().min(1).max(255).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const emptyResult = { items: [], total: 0, limit: input.limit, offset: input.offset }

      let categoryIds: string[] | undefined
      if (input.categorySlug) {
        const sub = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        })
        if (!sub) return emptyResult
        categoryIds = [sub.id]
      } else if (input.groupSlug) {
        const group = await ctx.db.query.categories.findFirst({
          where: eq(categories.slug, input.groupSlug),
          with: { subcategories: true },
        })
        if (!group || group.subcategories.length === 0) return emptyResult
        categoryIds = group.subcategories.map((s) => s.id)
      }

      let toolId: string | undefined
      if (input.toolSlug) {
        const tool = await ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolSlug),
        })
        if (!tool) return emptyResult
        toolId = tool.id
      }

      const where = and(
        eq(matches.status, 'settled'),
        categoryIds ? inArray(matches.categoryId, categoryIds) : undefined,
        toolId
          ? sql`(${matches.toolAId} = ${toolId} OR ${matches.toolBId} = ${toolId})`
          : undefined,
      )

      const countRows = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(matches)
        .where(where)
      const total = Number(countRows[0]?.count ?? 0)

      const items = await ctx.db.query.matches.findMany({
        where,
        orderBy: [desc(matches.settledAt), desc(matches.startedAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          toolA: true,
          toolB: true,
          category: true,
          winner: true,
        },
      })

      return {
        items,
        total,
        limit: input.limit,
        offset: input.offset,
      }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const match = await ctx.db.query.matches.findFirst({
        where: eq(matches.id, input.id),
        with: {
          toolA: true,
          toolB: true,
          category: true,
          winner: true,
        },
      })
      if (!match) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match not found',
        })
      }

      const breakdown = await buildBreakdown(ctx.db, match)
      return { match, breakdown }
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const match = await ctx.db.query.matches.findFirst({
        where: eq(matches.slug, input.slug),
        with: {
          toolA: true,
          toolB: true,
          category: true,
          winner: true,
        },
      })
      if (!match) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match not found',
        })
      }

      const breakdown = await buildBreakdown(ctx.db, match)
      return { match, breakdown }
    }),

  create: protectedProcedure
    .input(
      z.object({
        toolAId: z.string().uuid(),
        toolBId: z.string().uuid(),
        categoryId: z.string().uuid(),
        periodStart: z.coerce.date(),
        periodEnd: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      if (input.toolAId === input.toolBId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Match tools must be different',
        })
      }
      if (input.periodEnd < input.periodStart) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Match period end must be on or after period start',
        })
      }

      const [toolAId, toolBId] =
        input.toolAId < input.toolBId
          ? [input.toolAId, input.toolBId]
          : [input.toolBId, input.toolAId]

      const [toolARow, toolBRow, categoryRow] = await Promise.all([
        ctx.db.query.tools.findFirst({
          where: eq(tools.id, toolAId ?? ''),
          columns: { slug: true },
        }),
        ctx.db.query.tools.findFirst({
          where: eq(tools.id, toolBId ?? ''),
          columns: { slug: true },
        }),
        ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.id, input.categoryId),
          columns: { slug: true },
        }),
      ])

      const periodStartStr = toDateString(input.periodStart)
      const baseSlug = buildMatchSlug(
        toolARow?.slug ?? '',
        toolBRow?.slug ?? '',
        categoryRow?.slug ?? '',
        periodStartStr,
      )
      const slugPrefix = baseSlug.slice(0, 245)
      const existingSlugs = await ctx.db.query.matches.findMany({
        where: sql`${matches.slug} LIKE ${`${slugPrefix}%`}`,
        columns: { slug: true },
      })
      const slug = deduplicateSlug(baseSlug, new Set(existingSlugs.map((m) => m.slug)))

      const inserted = await ctx.db
        .insert(matches)
        .values({
          slug,
          toolAId,
          toolBId,
          categoryId: input.categoryId,
          status: 'active',
          startedAt: new Date(),
          periodStart: periodStartStr,
          periodEnd: toDateString(input.periodEnd),
        })
        .returning()

      return ctx.db.query.matches.findFirst({
        where: eq(matches.id, inserted[0]?.id ?? ''),
        with: {
          toolA: true,
          toolB: true,
          category: true,
          winner: true,
        },
      })
    }),

  settle: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const match = await ctx.db.query.matches.findFirst({
        where: eq(matches.id, input.id),
      })
      if (!match) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Match not found',
        })
      }
      if (match.status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only active matches can be settled',
        })
      }

      const settledAt = new Date()
      const breakdown = await buildBreakdown(ctx.db, { ...match, settledAt })
      const winnerToolId =
        breakdown.totals.toolA === breakdown.totals.toolB
          ? null
          : breakdown.totals.toolA > breakdown.totals.toolB
            ? match.toolAId
            : match.toolBId

      const updated = await ctx.db
        .update(matches)
        .set({
          status: 'settled',
          settledAt,
          toolAScore: breakdown.totals.toolA,
          toolBScore: breakdown.totals.toolB,
          totalPrompts: breakdown.totals.prompts,
          winnerToolId,
        })
        .where(eq(matches.id, input.id))
        .returning()

      return {
        match: updated[0],
        breakdown,
      }
    }),
})
