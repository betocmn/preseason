import { createHash } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import { requireRole } from '~/server/api/helpers/auth'
import {
  anchorDateSchema,
  findLatestPublishedBenchmarkSeasonId,
} from '~/server/api/helpers/benchmark'
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

type PromptCandidateRow = {
  pvId: string
  slug: string
  level: PromptLevel
  contentMd: string | null
  promptTitle: string
  promptDescription: string | null
  createdAt: Date
}

function getDailySlugKey(slug: string, anchorDate: string) {
  return createHash('md5').update(`${slug}${anchorDate}`).digest('hex')
}

function comparePromptCandidates(a: PromptCandidateRow, b: PromptCandidateRow, anchorDate: string) {
  const keyComparison = getDailySlugKey(a.slug, anchorDate).localeCompare(
    getDailySlugKey(b.slug, anchorDate),
  )
  if (keyComparison !== 0) return keyComparison

  const createdAtComparison = b.createdAt.getTime() - a.createdAt.getTime()
  if (createdAtComparison !== 0) return createdAtComparison

  return b.pvId.localeCompare(a.pvId)
}

function buildPromptDisplayOrder(candidates: PromptCandidateRow[], firstPageSize: number) {
  const targetFirstPageSize = Math.min(firstPageSize, candidates.length)
  const firstPage: PromptCandidateRow[] = []
  const firstPageIds = new Set<string>()
  const seenSlugs = new Set<string>()

  for (const candidate of candidates) {
    if (firstPage.length >= targetFirstPageSize) break
    if (seenSlugs.has(candidate.slug)) continue

    seenSlugs.add(candidate.slug)
    firstPage.push(candidate)
    firstPageIds.add(candidate.pvId)
  }

  for (const candidate of candidates) {
    if (firstPage.length >= targetFirstPageSize) break
    if (firstPageIds.has(candidate.pvId)) continue

    firstPage.push(candidate)
    firstPageIds.add(candidate.pvId)
  }

  const remaining = candidates.filter((candidate) => !firstPageIds.has(candidate.pvId))
  return [...firstPage, ...remaining]
}

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
        anchorDate: anchorDateSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const homepagePageSize = serverSettings.homepage.promptCarouselPageSize

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
      if (!seasonId) return { items: [] as PromptWithTopTools[], hasMore: false }

      // Get published run IDs for the season
      const publishedRuns = await ctx.db
        .select({ id: benchmarkRuns.id })
        .from(benchmarkRuns)
        .where(and(eq(benchmarkRuns.seasonId, seasonId), eq(benchmarkRuns.status, 'published')))

      const runIds = publishedRuns.map((r) => r.id)
      if (runIds.length === 0) return { items: [] as PromptWithTopTools[], hasMore: false }

      const orderedCandidates = (
        await ctx.db
          .selectDistinct({
            pvId: benchmarkPromptVersions.id,
            slug: benchmarkPromptVersions.slug,
            level: benchmarkPromptVersions.level,
            contentMd: benchmarkPromptVersions.contentMd,
            promptTitle: prompts.title,
            promptDescription: prompts.description,
            createdAt: benchmarkPromptVersions.createdAt,
          })
          .from(benchmarkCaseDecisions)
          .innerJoin(
            benchmarkCaseResults,
            eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
          )
          .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
          .innerJoin(
            benchmarkPromptVersions,
            eq(benchmarkCases.promptVersionId, benchmarkPromptVersions.id),
          )
          .innerJoin(prompts, eq(benchmarkPromptVersions.promptId, prompts.id))
          .where(
            and(
              eq(benchmarkCases.seasonId, seasonId),
              inArray(benchmarkCaseResults.runId, runIds),
              eq(benchmarkCaseDecisions.decisionType, 'tool'),
              eq(prompts.isActive, true),
              eq(benchmarkPromptVersions.isActive, true),
            ),
          )
      ).sort((a, b) => comparePromptCandidates(a, b, anchorDate))

      const displayOrder = buildPromptDisplayOrder(orderedCandidates, homepagePageSize)
      const rows = displayOrder.slice(input.offset, input.offset + input.limit)
      const hasMore = input.offset + input.limit < displayOrder.length
      if (rows.length === 0) return { items: [] as PromptWithTopTools[], hasMore: false }

      const pvIds = rows.map((row) => row.pvId)

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
        const toolDecisions = decisionsByPv.get(pv.pvId) ?? []
        const totalCount = toolDecisions.reduce((sum, d) => sum + d.count, 0)
        const topTools = toolDecisions.slice(0, 4).map((d) => ({
          tool: d.tool,
          rate: totalCount > 0 ? d.count / totalCount : 0,
          count: d.count,
        }))

        return {
          id: pv.pvId,
          title: pv.promptTitle,
          slug: pv.slug,
          content: pv.contentMd,
          description: pv.promptDescription,
          level: pv.level,
          topTools,
        }
      })

      return { items, hasMore }
    }),
})
