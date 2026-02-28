import { TRPCError } from '@trpc/server'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { llms, prompts, runResults, runs } from '~/server/db/schema'

type ParseStatus = 'pending' | 'success' | 'failed'

export const runRouter = createTRPCRouter({
  listRecent: publicProcedure.input(paginationInputSchema).query(async ({ ctx, input }) => {
    const countResult = await ctx.db.select({ count: sql<number>`count(*)` }).from(runs)
    const total = Number(countResult[0]?.count ?? 0)

    const items = await ctx.db.query.runs.findMany({
      orderBy: [desc(runs.createdAt)],
      limit: input.limit,
      offset: input.offset,
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
      const run = await ctx.db.query.runs.findFirst({
        where: eq(runs.id, input.id),
      })
      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Run not found',
        })
      }

      const results = await ctx.db.query.runResults.findMany({
        where: eq(runResults.runId, input.id),
        orderBy: [desc(runResults.createdAt)],
        with: {
          prompt: true,
          llm: true,
          recommendations: true,
        },
      })

      const parseStatusCounts: Record<ParseStatus, number> = {
        pending: 0,
        success: 0,
        failed: 0,
      }
      let totalRecommendations = 0
      let responseTimeSum = 0
      let responseTimeCount = 0

      for (const result of results) {
        parseStatusCounts[result.parseStatus] += 1
        totalRecommendations += result.recommendations.length
        if (result.responseTimeMs !== null) {
          responseTimeSum += result.responseTimeMs
          responseTimeCount += 1
        }
      }

      return {
        run,
        summary: {
          totalResults: results.length,
          totalRecommendations,
          parseStatusCounts,
          averageResponseTimeMs:
            responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount) : null,
        },
        results: results.map((result) => ({
          ...result,
          recommendationCount: result.recommendations.length,
        })),
      }
    }),

  triggerManual: protectedProcedure
    .input(
      z
        .object({
          promptIds: z.array(z.string().uuid()).optional(),
          llmIds: z.array(z.string().uuid()).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const selectedPromptIds =
        input?.promptIds && input.promptIds.length > 0 ? input.promptIds : undefined
      const selectedLlmIds = input?.llmIds && input.llmIds.length > 0 ? input.llmIds : undefined

      const promptCondition = selectedPromptIds
        ? and(eq(prompts.isActive, true), inArray(prompts.id, selectedPromptIds))
        : eq(prompts.isActive, true)
      const llmCondition = selectedLlmIds
        ? and(eq(llms.isActive, true), inArray(llms.id, selectedLlmIds))
        : eq(llms.isActive, true)

      const [selectedPrompts, selectedLlms] = await Promise.all([
        ctx.db.select({ id: prompts.id }).from(prompts).where(promptCondition),
        ctx.db.select({ id: llms.id }).from(llms).where(llmCondition),
      ])

      const promptIds = selectedPrompts.map((prompt) => prompt.id)
      const llmIds = selectedLlms.map((llm) => llm.id)
      const promptCount = promptIds.length
      const llmCount = llmIds.length

      const inserted = await ctx.db
        .insert(runs)
        .values({
          status: 'pending',
          trigger: 'manual',
          promptIds,
          llmIds,
          promptCount,
          llmCount,
          startedAt: new Date(),
        })
        .returning()

      return {
        run: inserted[0],
        queued: true,
      }
    }),
})
