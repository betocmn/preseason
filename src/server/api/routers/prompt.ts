import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { findLatestPublishedBenchmarkSeasonId } from '~/server/api/helpers/benchmark'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkPromptVersions,
  benchmarkRuns,
  categories,
  prompts,
  subcategories,
  tools,
} from '~/server/db/schema'
import { getPromptContent, type PromptLevel, promptLevelSchema } from '~/server/llm/prompts'

const createPromptInput = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  level: promptLevelSchema.default('beginner'),
  description: z.string().max(10000).optional(),
  contentMd: z.string().max(100000).optional(),
  expectedCategories: z.array(z.string().min(1).max(100)).max(100).optional(),
  isActive: z.boolean().default(true),
})

const updatePromptInput = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(255).optional(),
    slug: z.string().min(1).max(255).optional(),
    level: promptLevelSchema.optional(),
    description: z.string().max(10000).nullable().optional(),
    contentMd: z.string().max(100000).nullable().optional(),
    expectedCategories: z.array(z.string().min(1).max(100)).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.slug !== undefined ||
      input.level !== undefined ||
      input.description !== undefined ||
      input.contentMd !== undefined ||
      input.expectedCategories !== undefined ||
      input.isActive !== undefined,
    {
      message: 'At least one field is required',
      path: ['id'],
    },
  )

export const promptRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const items = await ctx.db
      .select({
        id: prompts.id,
        title: prompts.title,
        slug: prompts.slug,
        level: prompts.level,
        description: prompts.description,
        expectedCategories: prompts.expectedCategories,
        isActive: prompts.isActive,
      })
      .from(prompts)
      .orderBy(asc(prompts.title))

    const usedPrompts = await ctx.db
      .selectDistinct({ promptId: benchmarkPromptVersions.promptId })
      .from(benchmarkPromptVersions)
    const usedPromptIds = new Set(usedPrompts.map((row) => row.promptId))

    return items.map((item) => ({
      ...item,
      isUsed: usedPromptIds.has(item.id),
    }))
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])
      const prompt = await ctx.db.query.prompts.findFirst({
        where: eq(prompts.id, input.id),
      })
      if (!prompt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Prompt not found' })
      }
      return prompt
    }),

  listActive: publicProcedure
    .input(
      z
        .object({
          level: promptLevelSchema.optional(),
          group: z.string().min(1).max(100).optional(),
          sub: z.string().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(prompts.isActive, true)]
      if (input?.level) {
        conditions.push(eq(prompts.level, input.level))
      }

      let activePrompts = await ctx.db
        .select({
          id: prompts.id,
          title: prompts.title,
          slug: prompts.slug,
          level: prompts.level,
          description: prompts.description,
          expectedCategories: prompts.expectedCategories,
          isActive: prompts.isActive,
        })
        .from(prompts)
        .where(and(...conditions))
        .orderBy(asc(prompts.title))

      if (input?.sub) {
        const subcategory = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.sub),
        })
        if (!subcategory) return []
        const lowerSlug = subcategory.slug.toLowerCase()
        activePrompts = activePrompts.filter((p) =>
          p.expectedCategories?.some((cat) => cat.toLowerCase() === lowerSlug),
        )
      } else if (input?.group) {
        const group = await ctx.db.query.categories.findFirst({
          where: eq(categories.slug, input.group),
          with: { subcategories: true },
        })
        if (!group) return []
        const subSlugs = new Set(group.subcategories.map((s) => s.slug.toLowerCase()))
        activePrompts = activePrompts.filter((p) =>
          p.expectedCategories?.some((cat) => subSlugs.has(cat.toLowerCase())),
        )
      }

      return activePrompts
    }),

  listBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(255),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: prompts.id,
          slug: prompts.slug,
          level: prompts.level,
          isActive: prompts.isActive,
        })
        .from(prompts)
        .where(eq(prompts.slug, input.slug))
        .orderBy(
          desc(prompts.isActive),
          asc(
            sql`CASE WHEN ${prompts.level} = 'beginner' THEN 0 WHEN ${prompts.level} = 'intermediate' THEN 1 ELSE 2 END`,
          ),
        )
    }),

  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(255),
        level: promptLevelSchema.default('beginner'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const prompt = await ctx.db.query.prompts.findFirst({
        where: (table, { and, eq: equals }) =>
          and(equals(table.slug, input.slug), equals(table.level, input.level)),
      })

      if (!prompt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prompt not found',
        })
      }

      const content = await getPromptContent(prompt.slug, prompt.level as PromptLevel, ctx.db)
      return { ...prompt, content }
    }),

  create: protectedProcedure.input(createPromptInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const inserted = await ctx.db.insert(prompts).values(input).returning()
    return inserted[0]
  }),

  update: protectedProcedure.input(updatePromptInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const { id, ...rest } = input

    const updated = await ctx.db.update(prompts).set(rest).where(eq(prompts.id, id)).returning()
    if (!updated[0]) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Prompt not found',
      })
    }
    return updated[0]
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const existingVersion = await ctx.db.query.benchmarkPromptVersions.findFirst({
        where: eq(benchmarkPromptVersions.promptId, input.id),
        columns: { id: true },
      })
      if (existingVersion) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Prompts that have already been used in benchmark seasons cannot be deleted',
        })
      }

      const deleted = await ctx.db.delete(prompts).where(eq(prompts.id, input.id)).returning()
      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prompt not found',
        })
      }

      return { success: true, id: deleted[0].id }
    }),

  toggleActive: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        isActive: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const updated = await ctx.db
        .update(prompts)
        .set({ isActive: input.isActive })
        .where(eq(prompts.id, input.id))
        .returning()

      if (!updated[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Prompt not found',
        })
      }
      return updated[0]
    }),

  listWithTopTools: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(20).default(5),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      type PromptWithTopTools = {
        id: string
        title: string
        slug: string
        content: string | null
        description: string | null
        level: PromptLevel
        topTools: {
          tool: { id: string; name: string; slug: string; logoUrl: string | null }
          rate: number
          count: number
        }[]
      }

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db)
      if (!seasonId) return { items: [] as PromptWithTopTools[], hasMore: false }

      // Get published run IDs for the season
      const publishedRuns = await ctx.db
        .select({ id: benchmarkRuns.id })
        .from(benchmarkRuns)
        .where(and(eq(benchmarkRuns.seasonId, seasonId), eq(benchmarkRuns.status, 'published')))

      const runIds = publishedRuns.map((r) => r.id)
      if (runIds.length === 0) return { items: [] as PromptWithTopTools[], hasMore: false }

      // Phase 1: Get deduplicated prompt versions (one per prompt) with daily-shuffled order.
      // Uses DISTINCT ON to pick the latest version per prompt, EXISTS to ensure tool decisions
      // exist, and md5 hash for deterministic daily ordering.
      const promptVersionRows = await ctx.db.execute<{
        pv_id: string
        prompt_id: string
        slug: string
        level: PromptLevel
        content_md: string
        prompt_title: string
        prompt_description: string | null
      }>(sql`
        WITH unique_pvs AS (
          SELECT DISTINCT ON (p.id)
            bpv.id AS pv_id,
            p.id AS prompt_id,
            bpv.slug,
            bpv.level,
            bpv.content_md,
            p.title AS prompt_title,
            p.description AS prompt_description
          FROM preseason_benchmark_case bc
          JOIN preseason_benchmark_prompt_version bpv ON bc.prompt_version_id = bpv.id
          JOIN preseason_prompt p ON bpv.prompt_id = p.id
          WHERE bc.season_id = ${seasonId}
            AND p.is_active = true
            AND bpv.is_active = true
            AND EXISTS (
              SELECT 1
              FROM preseason_benchmark_case_decision d
              JOIN preseason_benchmark_case_result cr ON d.case_result_id = cr.id
              WHERE cr.case_id = bc.id
                AND cr.run_id = ANY(${runIds})
                AND d.decision_type = 'tool'
            )
          ORDER BY p.id, bpv.created_at DESC
        )
        SELECT *
        FROM unique_pvs
        ORDER BY md5(prompt_id::text || date_trunc('day', now())::text)
        LIMIT ${input.limit + 1}
        OFFSET ${input.offset}
      `)

      const hasMore = promptVersionRows.length > input.limit
      const rows = promptVersionRows.slice(0, input.limit)
      if (rows.length === 0) return { items: [] as PromptWithTopTools[], hasMore: false }

      const pvIds = rows.map((r) => r.pv_id)

      // Phase 2: Get top tools per prompt version from benchmark decisions
      const decisionRows = await ctx.db
        .select({
          promptVersionId: benchmarkCases.promptVersionId,
          toolId: benchmarkCaseDecisions.toolId,
          toolName: tools.name,
          toolSlug: tools.slug,
          toolLogoUrl: tools.logoUrl,
          count: sql<number>`count(*)::int`,
        })
        .from(benchmarkCaseDecisions)
        .innerJoin(
          benchmarkCaseResults,
          eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
        )
        .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
        .innerJoin(tools, eq(benchmarkCaseDecisions.toolId, tools.id))
        .where(
          and(
            inArray(benchmarkCaseResults.runId, runIds),
            inArray(benchmarkCases.promptVersionId, pvIds),
            eq(benchmarkCaseDecisions.decisionType, 'tool'),
          ),
        )
        .groupBy(
          benchmarkCases.promptVersionId,
          benchmarkCaseDecisions.toolId,
          tools.name,
          tools.slug,
          tools.logoUrl,
        )
        .orderBy(benchmarkCases.promptVersionId, desc(sql`count(*)`))

      // Phase 3: Group decisions by prompt version and assemble results
      const decisionsByPv = new Map<
        string,
        {
          tool: { id: string; name: string; slug: string; logoUrl: string | null }
          count: number
        }[]
      >()
      for (const row of decisionRows) {
        if (!row.toolId) continue
        const list = decisionsByPv.get(row.promptVersionId) ?? []
        list.push({
          tool: {
            id: row.toolId,
            name: row.toolName,
            slug: row.toolSlug,
            logoUrl: row.toolLogoUrl,
          },
          count: row.count,
        })
        decisionsByPv.set(row.promptVersionId, list)
      }

      const items = rows.map((pv) => {
        const toolDecisions = decisionsByPv.get(pv.pv_id) ?? []
        const totalCount = toolDecisions.reduce((sum, d) => sum + d.count, 0)
        const topTools = toolDecisions.slice(0, 4).map((d) => ({
          tool: d.tool,
          rate: totalCount > 0 ? d.count / totalCount : 0,
          count: d.count,
        }))

        return {
          id: pv.pv_id,
          title: pv.prompt_title,
          slug: pv.slug,
          content: pv.content_md,
          description: pv.prompt_description,
          level: pv.level,
          topTools,
        }
      })

      return { items, hasMore }
    }),
})
