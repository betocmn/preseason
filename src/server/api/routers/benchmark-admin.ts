import { TRPCError } from '@trpc/server'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
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
  tools,
} from '~/server/db/schema'
import { getOrCreateModelSnapshot } from '~/server/llm/benchmark/model-snapshotter'
import { freezePromptVersion } from '~/server/llm/benchmark/prompt-freezer'

const BENCHMARK_DEFAULT_TEMPERATURE = 0.2
const BENCHMARK_DEFAULT_TOP_P = 1
const BENCHMARK_DEFAULT_MAX_TOKENS = 1200

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
      })
      if (!season) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Season not found' })
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
      const promptVersions = []
      for (const prompt of activePrompts) {
        const categorySlugs = prompt.expectedCategories ?? []
        const categoryIds = categorySlugs
          .map((slug) => slugToId.get(slug))
          .filter((id): id is string => id !== undefined)

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
          temperature: BENCHMARK_DEFAULT_TEMPERATURE,
          topP: BENCHMARK_DEFAULT_TOP_P,
          maxTokens: BENCHMARK_DEFAULT_MAX_TOKENS,
        })
        modelSnapshots.push(snapshot)
      }

      // Insert junction rows and generate case matrix
      await ctx.db.insert(benchmarkSeasonPrompts).values(
        promptVersions.map((pv) => ({
          seasonId: input.seasonId,
          promptVersionId: pv.id,
        })),
      )

      await ctx.db.insert(benchmarkSeasonModels).values(
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

      await ctx.db.insert(benchmarkCases).values(caseValues)

      // Activate the season
      await ctx.db
        .update(benchmarkSeasons)
        .set({ status: 'active' })
        .where(eq(benchmarkSeasons.id, input.seasonId))

      return {
        seasonId: input.seasonId,
        promptVersionCount: promptVersions.length,
        modelSnapshotCount: modelSnapshots.length,
        caseCount: caseValues.length,
      }
    }),

  completeSeason: protectedProcedure
    .input(z.object({ seasonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const season = await ctx.db.query.benchmarkSeasons.findFirst({
        where: eq(benchmarkSeasons.id, input.seasonId),
      })
      if (!season) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Season not found' })
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

      // Deactivate all, then activate target
      await ctx.db
        .update(benchmarkModelWeightConfigs)
        .set({ isActive: false })
        .where(eq(benchmarkModelWeightConfigs.isActive, true))

      const [updated] = await ctx.db
        .update(benchmarkModelWeightConfigs)
        .set({ isActive: true })
        .where(eq(benchmarkModelWeightConfigs.id, input.id))
        .returning()

      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Update failed' })
      return updated
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

      const resultStats = Object.fromEntries(
        statusBreakdown.map((r) => [r.status, Number(r.count)]),
      )

      return { ...run, resultStats }
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

      const [updated] = await ctx.db
        .update(benchmarkRuns)
        .set({ status: 'published' })
        .where(eq(benchmarkRuns.id, input.runId))
        .returning()

      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Update failed' })
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
      if (!['completed', 'qc_failed', 'failed'].includes(run.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot retry cases for run in ${run.status} status`,
        })
      }

      // Delete failed/invalid case results (cascade deletes their decisions)
      const deleted = await ctx.db
        .delete(benchmarkCaseResults)
        .where(
          and(
            eq(benchmarkCaseResults.runId, input.runId),
            inArray(benchmarkCaseResults.status, ['failed', 'invalid_output']),
          ),
        )
        .returning({ id: benchmarkCaseResults.id })

      // Reset run to pending so the runner can pick it up
      await ctx.db
        .update(benchmarkRuns)
        .set({
          status: 'pending',
          completedAt: null,
          qcStatus: null,
          qcSummaryJson: null,
        })
        .where(eq(benchmarkRuns.id, input.runId))

      return { retriedCount: deleted.length }
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
        },
      })

      return { items, total, limit: input.limit, offset: input.offset }
    }),

  approveCandidate: protectedProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        toolId: z.string().uuid(),
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

      // Verify tool exists
      const tool = await ctx.db.query.tools.findFirst({
        where: eq(tools.id, input.toolId),
      })
      if (!tool) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tool not found' })
      }

      // Create tool alias
      await ctx.db
        .insert(toolAliases)
        .values({
          toolId: input.toolId,
          alias: candidate.rawName,
          normalizedAlias: candidate.normalizedName,
          source: 'candidate_approval',
        })
        .onConflictDoNothing({ target: toolAliases.normalizedAlias })

      // Update candidate
      const [updated] = await ctx.db
        .update(toolCandidates)
        .set({
          status: 'approved',
          approvedToolId: input.toolId,
        })
        .where(eq(toolCandidates.id, input.candidateId))
        .returning()

      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Update failed' })
      return updated
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
        .where(eq(toolCandidates.id, input.candidateId))
        .returning()

      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Update failed' })
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
      orderBy: [desc(benchmarkProtocols.createdAt)],
    })
  }),
})
