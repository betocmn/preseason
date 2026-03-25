import { TRPCError } from '@trpc/server'
import { and, desc, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
  matchBatches,
  matchConfigs,
  matchPromptTemplates,
  toolCategories,
} from '~/server/db/schema'
import { createMatchBatch } from '~/server/llm/match/batches'

function canonicalizeToolOrder(toolAId: string, toolBId: string): [string, string] {
  const normalizedToolAId = toolAId.toLowerCase()
  const normalizedToolBId = toolBId.toLowerCase()
  return normalizedToolAId < normalizedToolBId
    ? [normalizedToolAId, normalizedToolBId]
    : [normalizedToolBId, normalizedToolAId]
}

type DatabaseErrorLike = {
  code?: string
  message?: string
}

function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const dbError = error as DatabaseErrorLike
  if (dbError.code === '23503') return true
  return typeof dbError.message === 'string' && dbError.message.includes('foreign key constraint')
}

const createBatchInputSchema = z
  .object({
    seasonId: z.string().uuid(),
    categoryId: z.string().uuid(),
    toolAId: z.string().uuid(),
    toolBId: z.string().uuid(),
    promptTemplateId: z.string().uuid(),
    configId: z.string().uuid().optional(),
    benchmarkRunId: z.string().uuid().optional(),
    idempotencyKey: z.string().max(255).optional(),
    triggerMode: z.enum(['manual', 'benchmark_run']).default('manual'),
  })
  .superRefine((input, ctx) => {
    if (input.triggerMode === 'benchmark_run' && !input.benchmarkRunId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['benchmarkRunId'],
        message: 'benchmarkRunId is required when triggerMode is benchmark_run',
      })
    }

    if (input.triggerMode === 'manual' && input.benchmarkRunId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['benchmarkRunId'],
        message: 'benchmarkRunId must be omitted when triggerMode is manual',
      })
    }
  })

export const matchRouter = createTRPCRouter({
  configureMatch: protectedProcedure
    .input(
      z.object({
        seasonId: z.string().uuid(),
        categoryId: z.string().uuid(),
        toolAId: z.string().uuid(),
        toolBId: z.string().uuid(),
        promptTemplateId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const [toolAId, toolBId] = canonicalizeToolOrder(input.toolAId, input.toolBId)

      // Validate both tools are in the category
      const toolCatRows = await ctx.db.query.toolCategories.findMany({
        where: and(
          eq(toolCategories.categoryId, input.categoryId),
          or(eq(toolCategories.toolId, toolAId), eq(toolCategories.toolId, toolBId)),
        ),
      })
      if (toolCatRows.length < 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Both tools must belong to the selected category',
        })
      }

      // Validate prompt template exists and is active
      const template = await ctx.db.query.matchPromptTemplates.findFirst({
        where: and(
          eq(matchPromptTemplates.id, input.promptTemplateId),
          eq(matchPromptTemplates.isActive, true),
        ),
      })
      if (!template) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active prompt template not found',
        })
      }

      // Deactivate existing config and insert new one atomically
      const config = await ctx.db.transaction(async (tx) => {
        await tx
          .update(matchConfigs)
          .set({ isActive: false })
          .where(
            and(
              eq(matchConfigs.seasonId, input.seasonId),
              eq(matchConfigs.categoryId, input.categoryId),
              eq(matchConfigs.toolAId, toolAId),
              eq(matchConfigs.toolBId, toolBId),
              eq(matchConfigs.isActive, true),
            ),
          )

        const [inserted] = await tx
          .insert(matchConfigs)
          .values({
            seasonId: input.seasonId,
            categoryId: input.categoryId,
            toolAId,
            toolBId,
            promptTemplateId: input.promptTemplateId,
            isActive: true,
            createdBy: ctx.user.id,
          })
          .returning()

        return inserted
      })

      return config
    }),

  listConfigs: protectedProcedure
    .input(
      z.object({
        seasonId: z.string().uuid(),
        ...paginationInputSchema.shape,
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      return ctx.db.query.matchConfigs.findMany({
        where: eq(matchConfigs.seasonId, input.seasonId),
        orderBy: [desc(matchConfigs.createdAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          category: true,
          toolA: true,
          toolB: true,
          promptTemplate: true,
        },
      })
    }),

  disableConfig: protectedProcedure
    .input(z.object({ configId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const [updated] = await ctx.db
        .update(matchConfigs)
        .set({ isActive: false })
        .where(and(eq(matchConfigs.id, input.configId), eq(matchConfigs.isActive, true)))
        .returning()

      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active config not found',
        })
      }

      return updated
    }),

  createBatch: protectedProcedure.input(createBatchInputSchema).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    try {
      return await createMatchBatch(ctx.db, {
        ...input,
        triggeredBy: ctx.user.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message.includes('Idempotency key conflict')) {
        throw new TRPCError({ code: 'CONFLICT', message })
      }
      if (
        message.includes('Both tools must belong') ||
        message.includes('Season has no frozen') ||
        message.includes('benchmarkRunId')
      ) {
        throw new TRPCError({ code: 'BAD_REQUEST', message })
      }
      if (isForeignKeyViolation(error)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'One or more referenced IDs were not found or are incompatible',
        })
      }
      throw error
    }
  }),

  listBatches: protectedProcedure
    .input(
      z.object({
        seasonId: z.string().uuid().optional(),
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        ...paginationInputSchema.shape,
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const conditions = []
      if (input.seasonId) conditions.push(eq(matchBatches.seasonId, input.seasonId))
      if (input.status) conditions.push(eq(matchBatches.status, input.status))

      return ctx.db.query.matchBatches.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: [desc(matchBatches.createdAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          category: true,
          toolA: true,
          toolB: true,
          promptTemplate: true,
          season: true,
        },
      })
    }),

  getBatch: protectedProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const batch = await ctx.db.query.matchBatches.findFirst({
        where: eq(matchBatches.id, input.batchId),
        with: {
          category: true,
          toolA: true,
          toolB: true,
          promptTemplate: true,
          season: true,
          evaluations: {
            with: { modelSnapshot: true },
          },
        },
      })

      if (!batch) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Batch not found' })
      }

      return batch
    }),
})
