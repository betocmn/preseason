import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import { requireRole } from '~/server/api/helpers/auth'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import {
  describeToolSearchMatch,
  loadToolSearchCatalog,
  rankToolSearchCatalog,
  stripToolSearchRelations,
} from '~/server/api/helpers/tool-search'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelWeightConfigs,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  llms,
  prompts,
  subcategories,
  toolAliases,
  toolCandidates,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { getOrCreateModelSnapshot } from '~/server/llm/benchmark/model-snapshotter'
import { freezePromptVersion } from '~/server/llm/benchmark/prompt-freezer'

/**
 * Extract snapshotCaseIds from a run's qcSummaryJson if available.
 * Returns null when the QC payload has been replaced by final QC results.
 */
function extractSnapshotCaseIds(qcSummaryJson: unknown): string[] | null {
  if (!qcSummaryJson || typeof qcSummaryJson !== 'object' || Array.isArray(qcSummaryJson)) {
    return null
  }
  const ids = (qcSummaryJson as Record<string, unknown>).snapshotCaseIds
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return null
  }
  return ids as string[]
}

function normalizeLegacyCaseResultPresentation(result: typeof benchmarkCaseResults.$inferSelect) {
  const isTerminal =
    result.status === 'completed' ||
    result.status === 'failed' ||
    result.status === 'invalid_output'

  return {
    startedAt: result.startedAt ?? (isTerminal ? result.createdAt : null),
    completedAt: result.completedAt ?? (isTerminal ? result.createdAt : null),
    attemptCount: result.attemptCount > 0 ? result.attemptCount : isTerminal ? 1 : 0,
  }
}

async function loadSeasonCaseSnapshotIds(
  database: Parameters<typeof requireRole>[0],
  seasonId: string,
) {
  const caseRows = await database
    .select({ id: benchmarkCases.id })
    .from(benchmarkCases)
    .where(and(eq(benchmarkCases.seasonId, seasonId), eq(benchmarkCases.isActive, true)))
    .orderBy(
      asc(benchmarkCases.promptVersionId),
      asc(benchmarkCases.modelSnapshotId),
      asc(benchmarkCases.id),
    )

  return caseRows.map((row) => row.id)
}

const createToolForCandidateSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  categoryId: z.string().uuid(),
})

const approveCandidateInputSchema = z
  .object({
    candidateId: z.string().uuid(),
    toolId: z.string().uuid().optional(),
    newTool: createToolForCandidateSchema.optional(),
  })
  .refine((input) => (input.toolId ? 1 : 0) + (input.newTool ? 1 : 0) === 1, {
    message: 'Provide either toolId or newTool',
    path: ['toolId'],
  })

export const benchmarkAdminRouter = createTRPCRouter({
  // ---------------------------------------------------------------------------
  // SEASON MANAGEMENT
  // ---------------------------------------------------------------------------

  listSeasons: protectedProcedure.query(async ({ ctx }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    const seasons = await ctx.db.query.benchmarkSeasons.findMany({
      orderBy: [desc(benchmarkSeasons.createdAt)],
      with: {
        protocol: true,
      },
    })

    const seasonIds = seasons.map((s) => s.id)
    if (seasonIds.length === 0) return []

    const promptCounts = await ctx.db
      .select({
        seasonId: benchmarkSeasonPrompts.seasonId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(benchmarkSeasonPrompts)
      .where(inArray(benchmarkSeasonPrompts.seasonId, seasonIds))
      .groupBy(benchmarkSeasonPrompts.seasonId)

    const modelCounts = await ctx.db
      .select({
        seasonId: benchmarkSeasonModels.seasonId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(benchmarkSeasonModels)
      .where(inArray(benchmarkSeasonModels.seasonId, seasonIds))
      .groupBy(benchmarkSeasonModels.seasonId)

    const runCounts = await ctx.db
      .select({
        seasonId: benchmarkRuns.seasonId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(benchmarkRuns)
      .where(inArray(benchmarkRuns.seasonId, seasonIds))
      .groupBy(benchmarkRuns.seasonId)

    const promptMap = new Map(promptCounts.map((r) => [r.seasonId, Number(r.count)]))
    const modelMap = new Map(modelCounts.map((r) => [r.seasonId, Number(r.count)]))
    const runMap = new Map(runCounts.map((r) => [r.seasonId, Number(r.count)]))

    return seasons.map((s) => ({
      ...s,
      promptCount: promptMap.get(s.id) ?? 0,
      modelCount: modelMap.get(s.id) ?? 0,
      runCount: runMap.get(s.id) ?? 0,
    }))
  }),

  getSeasonById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const season = await ctx.db.query.benchmarkSeasons.findFirst({
        where: eq(benchmarkSeasons.id, input.id),
        with: {
          protocol: true,
          seasonPrompts: {
            with: {
              promptVersion: {
                with: {
                  prompt: true,
                  categories: {
                    with: { category: true },
                    orderBy: (fields, { asc }) => [asc(fields.displayOrder)],
                  },
                },
              },
            },
          },
          seasonModels: {
            with: {
              modelSnapshot: true,
            },
          },
          runs: {
            orderBy: [desc(benchmarkRuns.scheduledFor)],
          },
        },
      })

      if (!season) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Season not found' })
      }

      return season
    }),

  createSeason: protectedProcedure
    .input(
      z.object({
        protocolId: z.string().uuid(),
        slug: z.string().min(1).max(100),
        name: z.string().min(1).max(255),
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const protocol = await ctx.db.query.benchmarkProtocols.findFirst({
        where: eq(benchmarkProtocols.id, input.protocolId),
      })
      if (!protocol) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Protocol not found' })
      }
      if (protocol.mode !== 'benchmark') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Protocol must be in benchmark mode',
        })
      }

      const [season] = await ctx.db
        .insert(benchmarkSeasons)
        .values({
          protocolId: input.protocolId,
          slug: input.slug,
          name: input.name,
          notes: input.notes,
          status: 'draft',
        })
        .returning()

      if (!season) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Insert failed' })
      return season
    }),

  freezeSeason: protectedProcedure
    .input(z.object({ seasonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const season = await ctx.db.query.benchmarkSeasons.findFirst({
        where: eq(benchmarkSeasons.id, input.seasonId),
        with: { protocol: true },
      })
      if (!season) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Season not found' })
      }
      if (season.protocol.mode !== 'benchmark') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only benchmark-mode seasons can be frozen through this endpoint',
        })
      }
      if (season.status !== 'draft') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Season must be in draft status to freeze (current: ${season.status})`,
        })
      }

      // Load active prompts with contentMd
      const activePrompts = await ctx.db.query.prompts.findMany({
        where: and(eq(prompts.isActive, true), sql`${prompts.contentMd} IS NOT NULL`),
      })
      if (activePrompts.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active prompts with content found',
        })
      }

      // Load active LLMs
      const activeLlms = await ctx.db.query.llms.findMany({
        where: eq(llms.isActive, true),
      })
      if (activeLlms.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No active LLMs found',
        })
      }

      // Resolve category slugs to IDs for each prompt
      const allCategorySlugs = [
        ...new Set(activePrompts.flatMap((p) => p.expectedCategories ?? [])),
      ]
      const categoryRows = await ctx.db
        .select({ id: subcategories.id, slug: subcategories.slug })
        .from(subcategories)
        .where(
          allCategorySlugs.length > 0 ? inArray(subcategories.slug, allCategorySlugs) : sql`false`,
        )
      const slugToId = new Map(categoryRows.map((r) => [r.slug, r.id]))

      // Freeze prompt versions
      const promptVersions: Awaited<ReturnType<typeof freezePromptVersion>>[] = []
      for (const prompt of activePrompts) {
        const categorySlugs = prompt.expectedCategories ?? []
        const unresolvedSlugs = categorySlugs.filter((slug) => !slugToId.has(slug))
        if (unresolvedSlugs.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Prompt "${prompt.title ?? prompt.id}" has unresolvable category slugs: ${unresolvedSlugs.join(', ')}`,
          })
        }

        const categoryIds = [
          ...new Set(
            categorySlugs
              .map((slug) => slugToId.get(slug))
              .filter((id): id is string => id !== undefined),
          ),
        ]

        if (categoryIds.length === 0) continue

        const version = await freezePromptVersion(ctx.db, prompt.id, { categoryIds })
        promptVersions.push(version)
      }

      if (promptVersions.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No prompts with valid categories could be frozen',
        })
      }

      // Create model snapshots
      const modelSnapshots: Awaited<ReturnType<typeof getOrCreateModelSnapshot>>[] = []
      for (const llm of activeLlms) {
        const snapshot = await getOrCreateModelSnapshot(ctx.db, llm.id, {
          temperature: serverSettings.benchmark.modelDefaults.temperature,
          topP: serverSettings.benchmark.modelDefaults.topP,
          maxTokens: serverSettings.benchmark.modelDefaults.maxTokens,
        })
        modelSnapshots.push(snapshot)
      }

      // Insert junction rows, case matrix, and activate — all in a transaction.
      // The status guard inside the transaction prevents concurrent freezes.
      return await ctx.db.transaction(async (tx) => {
        const [guarded] = await tx
          .update(benchmarkSeasons)
          .set({ status: 'active' })
          .where(and(eq(benchmarkSeasons.id, input.seasonId), eq(benchmarkSeasons.status, 'draft')))
          .returning({ id: benchmarkSeasons.id })

        if (!guarded) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Season state changed concurrently; refresh and try again',
          })
        }

        await tx.insert(benchmarkSeasonPrompts).values(
          promptVersions.map((pv) => ({
            seasonId: input.seasonId,
            promptVersionId: pv.id,
          })),
        )

        await tx.insert(benchmarkSeasonModels).values(
          modelSnapshots.map((ms) => ({
            seasonId: input.seasonId,
            modelSnapshotId: ms.id,
          })),
        )

        // Generate case matrix: prompt versions x model snapshots
        const caseValues = promptVersions.flatMap((pv) =>
          modelSnapshots.map((ms) => ({
            seasonId: input.seasonId,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })),
        )

        await tx.insert(benchmarkCases).values(caseValues)

        return {
          seasonId: input.seasonId,
          promptVersionCount: promptVersions.length,
          modelSnapshotCount: modelSnapshots.length,
          caseCount: caseValues.length,
        }
      })
    }),

  completeSeason: protectedProcedure
    .input(z.object({ seasonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const season = await ctx.db.query.benchmarkSeasons.findFirst({
        where: eq(benchmarkSeasons.id, input.seasonId),
        with: { protocol: true },
      })
      if (!season) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Season not found' })
      }
      if (season.protocol.mode !== 'benchmark') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only benchmark-mode seasons can be completed through this endpoint',
        })
      }
      if (season.status !== 'active') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Season must be active to complete (current: ${season.status})`,
        })
      }

      const [updated] = await ctx.db
        .update(benchmarkSeasons)
        .set({ status: 'completed' })
        .where(eq(benchmarkSeasons.id, input.seasonId))
        .returning()

      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Update failed' })
      return updated
    }),

  // ---------------------------------------------------------------------------
  // WEIGHT CONFIG MANAGEMENT
  // ---------------------------------------------------------------------------

  listWeightConfigs: protectedProcedure.query(async ({ ctx }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    return ctx.db.query.benchmarkModelWeightConfigs.findMany({
      orderBy: [desc(benchmarkModelWeightConfigs.createdAt)],
    })
  }),

  createWeightConfig: protectedProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(100),
        name: z.string().min(1).max(255),
        description: z.string().max(5000).optional(),
        frontierWeight: z.number().min(0).max(10),
        midWeight: z.number().min(0).max(10),
        smallWeight: z.number().min(0).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const [config] = await ctx.db
        .insert(benchmarkModelWeightConfigs)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          frontierWeight: input.frontierWeight,
          midWeight: input.midWeight,
          smallWeight: input.smallWeight,
          isActive: false,
        })
        .returning()

      if (!config) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Insert failed' })
      return config
    }),

  activateWeightConfig: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const config = await ctx.db.query.benchmarkModelWeightConfigs.findFirst({
        where: eq(benchmarkModelWeightConfigs.id, input.id),
      })
      if (!config) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Weight config not found' })
      }

      // Advisory lock serializes concurrent activations even when no config
      // is currently active (row-level FOR UPDATE would skip that case).
      return await ctx.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${sql.raw("hashtext('weight_config_activate')")})`,
        )

        await tx
          .update(benchmarkModelWeightConfigs)
          .set({ isActive: false })
          .where(eq(benchmarkModelWeightConfigs.isActive, true))

        const [updated] = await tx
          .update(benchmarkModelWeightConfigs)
          .set({ isActive: true })
          .where(eq(benchmarkModelWeightConfigs.id, input.id))
          .returning()

        if (!updated)
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Update failed' })
        return updated
      })
    }),

  // ---------------------------------------------------------------------------
  // RUN MANAGEMENT
  // ---------------------------------------------------------------------------

  listBenchmarkRuns: protectedProcedure
    .input(
      paginationInputSchema.extend({
        seasonId: z.string().uuid().optional(),
        status: z
          .enum(['pending', 'running', 'completed', 'failed', 'qc_failed', 'published'])
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const conditions = [
        input.seasonId ? eq(benchmarkRuns.seasonId, input.seasonId) : undefined,
        input.status ? eq(benchmarkRuns.status, input.status) : undefined,
      ].filter(Boolean)

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(benchmarkRuns)
        .where(where)
      const total = Number(countResult[0]?.count ?? 0)

      const items = await ctx.db.query.benchmarkRuns.findMany({
        where,
        orderBy: [desc(benchmarkRuns.scheduledFor)],
        limit: input.limit,
        offset: input.offset,
        with: {
          season: {
            columns: { id: true, name: true, slug: true },
          },
        },
      })

      return { items, total, limit: input.limit, offset: input.offset }
    }),

  getBenchmarkRun: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const run = await ctx.db.query.benchmarkRuns.findFirst({
        where: eq(benchmarkRuns.id, input.id),
        with: {
          season: true,
          weightConfig: true,
        },
      })

      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' })
      }

      // Get case result breakdown by status
      const statusBreakdown = await ctx.db
        .select({
          status: benchmarkCaseResults.status,
          count: sql<number>`count(*)`.as('count'),
        })
        .from(benchmarkCaseResults)
        .where(eq(benchmarkCaseResults.runId, input.id))
        .groupBy(benchmarkCaseResults.status)

      const resultStats: Record<string, number> = Object.fromEntries(
        statusBreakdown.map((r) => [r.status, Number(r.count)]),
      )

      // Scope to the run's case snapshot when available so we only show cases
      // that were actually part of this run, not the current season population.
      const snapshotIds = extractSnapshotCaseIds(run.qcSummaryJson)
      const caseWhereClause = snapshotIds
        ? inArray(benchmarkCases.id, snapshotIds)
        : eq(benchmarkCases.seasonId, run.seasonId)

      // Count total cases for this run and add missing ones as pending
      const totalCases =
        run.expectedCaseCount ??
        (snapshotIds
          ? snapshotIds.length
          : Number(
              (
                await ctx.db
                  .select({ count: sql<number>`count(*)`.as('count') })
                  .from(benchmarkCases)
                  .where(caseWhereClause)
              )[0]?.count ?? 0,
            ))
      const resultCount = Object.values(resultStats).reduce((a, b) => a + b, 0)
      const shouldBackfillPendingCounts =
        totalCases > resultCount &&
        (resultStats.pending ?? 0) === 0 &&
        (resultStats.running ?? 0) === 0

      if (shouldBackfillPendingCounts) {
        resultStats.pending = (resultStats.pending ?? 0) + (totalCases - resultCount)
      }

      const caseRows = await ctx.db.query.benchmarkCases.findMany({
        where: caseWhereClause,
        orderBy: [
          asc(benchmarkCases.promptVersionId),
          asc(benchmarkCases.modelSnapshotId),
          asc(benchmarkCases.id),
        ],
        with: {
          promptVersion: {
            with: {
              prompt: true,
            },
          },
          modelSnapshot: true,
          results: {
            where: eq(benchmarkCaseResults.runId, input.id),
            with: {
              decisions: {
                orderBy: [asc(benchmarkCaseDecisions.categoryId)],
                with: {
                  category: true,
                  tool: true,
                },
              },
            },
          },
        },
      })

      return {
        ...run,
        resultStats,
        caseRows: caseRows.map((benchmarkCase) => ({
          id: benchmarkCase.id,
          promptVersion: {
            id: benchmarkCase.promptVersion.id,
            title: benchmarkCase.promptVersion.prompt?.title ?? benchmarkCase.promptVersion.slug,
            version: benchmarkCase.promptVersion.version,
            level: benchmarkCase.promptVersion.level,
          },
          modelSnapshot: {
            id: benchmarkCase.modelSnapshot.id,
            name: benchmarkCase.modelSnapshot.name,
            tier: benchmarkCase.modelSnapshot.tier,
            company: benchmarkCase.modelSnapshot.company,
          },
          result: benchmarkCase.results[0]
            ? (() => {
                const normalized = normalizeLegacyCaseResultPresentation(benchmarkCase.results[0])
                return {
                  id: benchmarkCase.results[0].id,
                  status: benchmarkCase.results[0].status,
                  errorMessage: benchmarkCase.results[0].errorMessage,
                  returnedModelId: benchmarkCase.results[0].returnedModelId,
                  startedAt: normalized.startedAt,
                  completedAt: normalized.completedAt,
                  attemptCount: normalized.attemptCount,
                  decisions: benchmarkCase.results[0].decisions.map((decision) => ({
                    id: decision.id,
                    decisionType: decision.decisionType,
                    resolutionStatus: decision.resolutionStatus,
                    rawToolName: decision.rawToolName,
                    categoryName: decision.category.name,
                    toolName: decision.tool?.name ?? null,
                  })),
                }
              })()
            : null,
        })),
      }
    }),

  publishRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const run = await ctx.db.query.benchmarkRuns.findFirst({
        where: eq(benchmarkRuns.id, input.runId),
      })
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' })
      }
      if (run.status !== 'completed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Run must be in completed status to publish (current: ${run.status})`,
        })
      }
      if (run.qcStatus !== 'passed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Run QC must pass before publishing (current: ${run.qcStatus ?? 'missing'})`,
        })
      }

      const [updated] = await ctx.db
        .update(benchmarkRuns)
        .set({ status: 'published' })
        .where(
          and(
            eq(benchmarkRuns.id, input.runId),
            eq(benchmarkRuns.status, 'completed'),
            eq(benchmarkRuns.qcStatus, 'passed'),
          ),
        )
        .returning()

      if (!updated) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Run state changed concurrently; refresh and try again',
        })
      }
      return updated
    }),

  retryFailedCases: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const run = await ctx.db.query.benchmarkRuns.findFirst({
        where: eq(benchmarkRuns.id, input.runId),
      })
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Run not found' })
      }
      if (!['completed', 'published', 'qc_failed', 'failed'].includes(run.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot retry cases for run in ${run.status} status`,
        })
      }

      // Preserve snapshotCaseIds so retries stay bound to the original case set.
      // The runner overwrites qcSummaryJson with QC results on completion, so
      // the snapshot may no longer be in the JSON. Fall back to recovering the
      // case IDs from the results that were actually produced for this run.
      let snapshotCaseIds = extractSnapshotCaseIds(run.qcSummaryJson)

      // Preserve retryable rows so the runner can attempt repair from stored
      // invalid responses before falling back to fresh model calls.
      const result = await ctx.db.transaction(async (tx) => {
        if (!snapshotCaseIds) {
          const resultCaseRows = await tx
            .select({ caseId: benchmarkCaseResults.caseId })
            .from(benchmarkCaseResults)
            .where(eq(benchmarkCaseResults.runId, input.runId))
          snapshotCaseIds = [...new Set(resultCaseRows.map((r) => r.caseId))]
        }

        if (!snapshotCaseIds || snapshotCaseIds.length === 0) {
          snapshotCaseIds = await loadSeasonCaseSnapshotIds(tx, run.seasonId)
        }

        const retryableRows = await tx
          .select({ id: benchmarkCaseResults.id })
          .from(benchmarkCaseResults)
          .where(
            and(
              eq(benchmarkCaseResults.runId, input.runId),
              inArray(benchmarkCaseResults.status, ['failed', 'invalid_output']),
            ),
          )

        if (retryableRows.length > 0) {
          await tx.delete(benchmarkCaseDecisions).where(
            inArray(
              benchmarkCaseDecisions.caseResultId,
              retryableRows.map((row) => row.id),
            ),
          )

          await tx
            .update(benchmarkCaseResults)
            .set({
              status: 'pending',
              claimToken: null,
              startedAt: null,
              completedAt: null,
              naturalResponse: null,
              appendixRaw: null,
              appendixJson: null,
              errorMessage: null,
            })
            .where(
              inArray(
                benchmarkCaseResults.id,
                retryableRows.map((row) => row.id),
              ),
            )
        }

        const [updated] = await tx
          .update(benchmarkRuns)
          .set({
            status: 'pending',
            startedAt: null,
            completedAt: null,
            completedCaseCount: null,
            failedCaseCount: null,
            errorLog: null,
            qcStatus: null,
            qcSummaryJson: snapshotCaseIds.length > 0 ? { snapshotCaseIds } : null,
          })
          .where(
            and(
              eq(benchmarkRuns.id, input.runId),
              inArray(benchmarkRuns.status, ['completed', 'published', 'qc_failed', 'failed']),
            ),
          )
          .returning({ id: benchmarkRuns.id })

        if (!updated) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Run state changed concurrently; refresh and try again',
          })
        }

        return { retriedCount: retryableRows.length }
      })

      return result
    }),

  // ---------------------------------------------------------------------------
  // TOOL CANDIDATE REVIEW
  // ---------------------------------------------------------------------------

  listToolCandidates: protectedProcedure
    .input(
      paginationInputSchema.extend({
        status: z.enum(['pending', 'approved', 'rejected']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const where = input.status ? eq(toolCandidates.status, input.status) : undefined
      const toolSearchCatalog = await loadToolSearchCatalog(ctx.db)

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(toolCandidates)
        .where(where)
      const total = Number(countResult[0]?.count ?? 0)

      const items = await ctx.db.query.toolCandidates.findMany({
        where,
        orderBy: [desc(toolCandidates.seenCount), desc(toolCandidates.lastSeenAt)],
        limit: input.limit,
        offset: input.offset,
        with: {
          suggestedCategory: true,
          approvedTool: true,
          aiSuggestedTool: true,
        },
      })

      const itemsWithSuggestions = items.map((candidate) => {
        if (candidate.aiSuggestedTool) {
          return {
            ...candidate,
            suggestedTool: candidate.aiSuggestedTool,
            suggestionReason: candidate.aiReviewReason ?? 'LLM-reviewed likely match',
            canAutoApprove:
              (candidate.aiReviewConfidence ?? 0) >=
              serverSettings.toolCandidateReview.autoApproveConfidence,
          }
        }

        const rankedResults = rankToolSearchCatalog(toolSearchCatalog, {
          query: candidate.rawName,
          categoryId: candidate.suggestedCategoryId ?? undefined,
          limit: 2,
        })
        const suggestedResult = rankedResults[0] ?? null
        const isUniqueTopMatch = Boolean(
          suggestedResult &&
            (rankedResults.length === 1 || suggestedResult.score > (rankedResults[1]?.score ?? 0)),
        )

        return {
          ...candidate,
          suggestedTool: suggestedResult ? stripToolSearchRelations(suggestedResult.tool) : null,
          suggestionReason:
            suggestedResult && isUniqueTopMatch
              ? describeToolSearchMatch(suggestedResult, isUniqueTopMatch)
              : null,
          canAutoApprove: Boolean(
            suggestedResult && isUniqueTopMatch && suggestedResult.matchType !== 'substring',
          ),
        }
      })

      return {
        items: itemsWithSuggestions,
        total,
        limit: input.limit,
        offset: input.offset,
      }
    }),

  approveCandidate: protectedProcedure
    .input(approveCandidateInputSchema)
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const candidate = await ctx.db.query.toolCandidates.findFirst({
        where: eq(toolCandidates.id, input.candidateId),
      })
      if (!candidate) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found' })
      }
      if (candidate.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Candidate is already ${candidate.status}`,
        })
      }

      return await ctx.db.transaction(async (tx) => {
        let approvedToolId = input.toolId

        if (input.newTool) {
          const category = await tx.query.subcategories.findFirst({
            where: eq(subcategories.id, input.newTool.categoryId),
          })
          if (!category) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Category not found',
            })
          }

          const [createdTool] = await tx
            .insert(tools)
            .values({
              name: input.newTool.name,
              slug: input.newTool.slug,
              isVerified: false,
            })
            .returning()

          if (!createdTool) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to create tool',
            })
          }

          await tx.insert(toolCategories).values({
            toolId: createdTool.id,
            categoryId: input.newTool.categoryId,
            isPrimary: true,
          })

          approvedToolId = createdTool.id
        } else {
          const existingToolId = input.toolId
          if (!existingToolId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Tool not found',
            })
          }

          const tool = await tx.query.tools.findFirst({
            where: eq(tools.id, existingToolId),
          })
          if (!tool) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Tool not found' })
          }

          approvedToolId = existingToolId
        }

        if (!approvedToolId) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Approved tool was not resolved',
          })
        }

        const existingAlias = await tx.query.toolAliases.findFirst({
          where: eq(toolAliases.normalizedAlias, candidate.normalizedName),
        })
        if (existingAlias && existingAlias.toolId !== approvedToolId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This candidate alias is already assigned to a different tool',
          })
        }

        if (!existingAlias) {
          await tx.insert(toolAliases).values({
            toolId: approvedToolId,
            alias: candidate.rawName,
            normalizedAlias: candidate.normalizedName,
            source: 'candidate_approval',
          })
        }

        const [updated] = await tx
          .update(toolCandidates)
          .set({
            status: 'approved',
            approvedToolId,
          })
          .where(
            and(eq(toolCandidates.id, input.candidateId), eq(toolCandidates.status, 'pending')),
          )
          .returning()

        if (!updated) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Candidate status has changed since it was loaded; refresh and try again',
          })
        }

        return updated
      })
    }),

  rejectCandidate: protectedProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const candidate = await ctx.db.query.toolCandidates.findFirst({
        where: eq(toolCandidates.id, input.candidateId),
      })
      if (!candidate) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found' })
      }
      if (candidate.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Candidate is already ${candidate.status}`,
        })
      }

      const [updated] = await ctx.db
        .update(toolCandidates)
        .set({
          status: 'rejected',
          notes: input.notes,
        })
        .where(and(eq(toolCandidates.id, input.candidateId), eq(toolCandidates.status, 'pending')))
        .returning()

      if (!updated) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Candidate status has changed since it was loaded; refresh and try again',
        })
      }
      return updated
    }),

  replayDecisions: protectedProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const candidate = await ctx.db.query.toolCandidates.findFirst({
        where: eq(toolCandidates.id, input.candidateId),
      })
      if (!candidate) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Candidate not found' })
      }
      if (candidate.status !== 'approved' || !candidate.approvedToolId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Candidate must be approved with an assigned tool before replaying decisions',
        })
      }

      // Find unresolved decisions matching this candidate's normalized name
      const updated = await ctx.db
        .update(benchmarkCaseDecisions)
        .set({
          toolId: candidate.approvedToolId,
          resolutionStatus: 'resolved',
        })
        .where(
          and(
            eq(benchmarkCaseDecisions.resolutionStatus, 'unresolved_tool'),
            sql`lower(trim(${benchmarkCaseDecisions.rawToolName})) = ${candidate.normalizedName}`,
          ),
        )
        .returning({ id: benchmarkCaseDecisions.id })

      return { updatedCount: updated.length }
    }),

  // ---------------------------------------------------------------------------
  // PROTOCOL LISTING (for season creation form)
  // ---------------------------------------------------------------------------

  listProtocols: protectedProcedure.query(async ({ ctx }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    return ctx.db.query.benchmarkProtocols.findMany({
      where: eq(benchmarkProtocols.mode, 'benchmark'),
      orderBy: [desc(benchmarkProtocols.createdAt)],
    })
  }),
})
