import { TRPCError } from '@trpc/server'
import { and, asc, count, desc, eq, inArray, or } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { findLatestActiveBenchmarkSeasonId } from '~/server/api/helpers/benchmark'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
  benchmarkSeasonModels,
  benchmarkSeasons,
  matchBatches,
  matchConfigs,
  matchEvaluations,
  matchPromptTemplates,
  subcategories,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { createMatchBatch } from '~/server/llm/match/batches'

function canonicalizeToolOrder(toolAId: string, toolBId: string): [string, string] {
  const normalizedToolAId = toolAId.toLowerCase()
  const normalizedToolBId = toolBId.toLowerCase()
  return normalizedToolAId < normalizedToolBId
    ? [normalizedToolAId, normalizedToolBId]
    : [normalizedToolBId, normalizedToolAId]
}

function normalizeUuid(value: string) {
  return value.toLowerCase()
}

type DatabaseErrorLike = {
  code?: string
  message?: string
}

function toMatchBatchError(error: unknown): TRPCError | null {
  const message = error instanceof Error ? error.message : 'Unknown error'

  if (
    message.includes('Both tools must belong') ||
    message.includes('Season has no frozen') ||
    message.includes('benchmarkRunId')
  ) {
    return new TRPCError({ code: 'BAD_REQUEST', message })
  }

  if (message.includes('Idempotency key conflict')) {
    return new TRPCError({ code: 'CONFLICT', message })
  }

  if (isForeignKeyViolation(error)) {
    return new TRPCError({
      code: 'BAD_REQUEST',
      message: 'One or more referenced IDs were not found or are incompatible',
    })
  }

  return null
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

const createManualBatchesInputSchema = z.object({
  seasonId: z.string().uuid(),
  submissionId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        categoryId: z.string().uuid(),
        toolAId: z.string().uuid(),
        toolBId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(50),
})

function normalizeManualBatchEntryKey(categoryId: string, toolAId: string, toolBId: string) {
  const normalizedCategoryId = normalizeUuid(categoryId)
  const [normalizedToolAId, normalizedToolBId] = canonicalizeToolOrder(toolAId, toolBId)
  return `${normalizedCategoryId}:${normalizedToolAId}:${normalizedToolBId}`
}

function buildManualBatchIdempotencyKey(
  seasonId: string,
  submissionId: string,
  promptTemplateId: string,
  categoryId: string,
  toolAId: string,
  toolBId: string,
) {
  const normalizedSeasonId = normalizeUuid(seasonId)
  const normalizedCategoryId = normalizeUuid(categoryId)
  const [normalizedToolAId, normalizedToolBId] = canonicalizeToolOrder(toolAId, toolBId)
  return [
    'manual-match',
    submissionId,
    normalizedSeasonId,
    promptTemplateId,
    normalizedCategoryId,
    normalizedToolAId,
    normalizedToolBId,
  ].join(':')
}

export const matchRouter = createTRPCRouter({
  getAdminLaunchContext: protectedProcedure.query(async ({ ctx }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    const seasonId = await findLatestActiveBenchmarkSeasonId(ctx.db)
    if (!seasonId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No active benchmark season found',
      })
    }

    const season = await ctx.db.query.benchmarkSeasons.findFirst({
      where: eq(benchmarkSeasons.id, seasonId),
      columns: {
        id: true,
        name: true,
        slug: true,
      },
    })
    if (!season) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Active benchmark season not found',
      })
    }

    const promptTemplate = await ctx.db.query.matchPromptTemplates.findFirst({
      where: eq(matchPromptTemplates.isActive, true),
      columns: {
        id: true,
        name: true,
        slug: true,
      },
    })
    if (!promptTemplate) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Active match prompt template not found',
      })
    }

    const [modelCountRow] = await ctx.db
      .select({ cnt: count() })
      .from(benchmarkSeasonModels)
      .where(eq(benchmarkSeasonModels.seasonId, seasonId))

    const categoryCounts = await ctx.db
      .select({
        categoryId: toolCategories.categoryId,
        cnt: count(),
      })
      .from(toolCategories)
      .groupBy(toolCategories.categoryId)

    const eligibleCategoryIds = categoryCounts
      .filter((row) => Number(row.cnt) >= 2)
      .map((row) => row.categoryId)

    const categoryCountById = new Map(
      categoryCounts.map((row) => [row.categoryId, Number(row.cnt)]),
    )

    const categoriesForLaunch =
      eligibleCategoryIds.length > 0
        ? await ctx.db.query.subcategories.findMany({
            where: inArray(subcategories.id, eligibleCategoryIds),
            columns: {
              id: true,
              name: true,
              slug: true,
            },
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          })
        : []

    return {
      season: {
        ...season,
        modelCount: Number(modelCountRow?.cnt ?? 0),
      },
      promptTemplate,
      categories: categoriesForLaunch.map((category) => ({
        ...category,
        toolCount: categoryCountById.get(category.id) ?? 0,
      })),
    }
  }),

  listLaunchableTools: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      return await ctx.db
        .select({
          id: tools.id,
          name: tools.name,
          slug: tools.slug,
        })
        .from(toolCategories)
        .innerJoin(tools, eq(toolCategories.toolId, tools.id))
        .where(eq(toolCategories.categoryId, input.categoryId))
        .orderBy(asc(tools.name))
    }),

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
      const mappedError = toMatchBatchError(error)
      if (mappedError) {
        throw mappedError
      }
      throw error
    }
  }),

  createManualBatches: protectedProcedure
    .input(createManualBatchesInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const activeSeasonId = await findLatestActiveBenchmarkSeasonId(ctx.db)
      if (!activeSeasonId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active benchmark season found',
        })
      }

      const normalizedSeasonId = normalizeUuid(input.seasonId)
      if (normalizedSeasonId !== normalizeUuid(activeSeasonId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Manual matches can only be created for the current active benchmark season',
        })
      }

      const promptTemplate = await ctx.db.query.matchPromptTemplates.findFirst({
        where: eq(matchPromptTemplates.isActive, true),
        columns: {
          id: true,
          name: true,
          slug: true,
        },
      })
      if (!promptTemplate) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Active match prompt template not found',
        })
      }

      const seenKeys = new Set<string>()
      for (const entry of input.entries) {
        if (entry.toolAId.toLowerCase() === entry.toolBId.toLowerCase()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Tool A and Tool B must be different',
          })
        }

        const entryKey = normalizeManualBatchEntryKey(
          entry.categoryId,
          entry.toolAId,
          entry.toolBId,
        )
        if (seenKeys.has(entryKey)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Duplicate match rows are not allowed',
          })
        }
        seenKeys.add(entryKey)
      }

      return await ctx.db.transaction(async (tx) => {
        let createdCount = 0
        const batches: Array<{
          id: string
          status: 'pending' | 'running' | 'completed' | 'failed'
          categoryId: string
          toolAId: string
          toolBId: string
          totalEvaluations: number
        }> = []

        for (const entry of input.entries) {
          const normalizedCategoryId = normalizeUuid(entry.categoryId)
          const idempotencyKey = buildManualBatchIdempotencyKey(
            normalizedSeasonId,
            input.submissionId,
            promptTemplate.id,
            normalizedCategoryId,
            entry.toolAId,
            entry.toolBId,
          )

          const existingBatch = await tx.query.matchBatches.findFirst({
            where: eq(matchBatches.idempotencyKey, idempotencyKey),
            columns: { id: true },
          })

          try {
            const batch = await createMatchBatch(tx, {
              seasonId: normalizedSeasonId,
              categoryId: normalizedCategoryId,
              toolAId: entry.toolAId,
              toolBId: entry.toolBId,
              promptTemplateId: promptTemplate.id,
              triggerMode: 'manual',
              idempotencyKey,
              triggeredBy: ctx.user.id,
            })

            if (!existingBatch) {
              createdCount += 1
            }

            batches.push({
              id: batch.id,
              status: batch.status,
              categoryId: batch.categoryId,
              toolAId: batch.toolAId,
              toolBId: batch.toolBId,
              totalEvaluations: batch.totalEvaluations,
            })
          } catch (error) {
            const mappedError = toMatchBatchError(error)
            if (mappedError) {
              throw mappedError
            }
            throw error
          }
        }

        return {
          createdCount,
          batches,
        }
      })
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
            orderBy: [
              asc(matchEvaluations.modelSnapshotId),
              asc(matchEvaluations.presentationOrder),
            ],
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
