import { TRPCError } from '@trpc/server'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { prompts, recommendations, runResults, tools } from '~/server/db/schema'
import { getPromptContent, type PromptLevel } from '~/server/llm/prompts'

const promptLevelSchema = z.enum([
  'software-dev-beginner',
  'software-dev-experienced',
  'vibe-coder',
])

const createPromptInput = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  level: promptLevelSchema.default('vibe-coder'),
  description: z.string().max(10000).optional(),
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
    expectedCategories: z.array(z.string().min(1).max(100)).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.slug !== undefined ||
      input.level !== undefined ||
      input.description !== undefined ||
      input.expectedCategories !== undefined ||
      input.isActive !== undefined,
    {
      message: 'At least one field is required',
      path: ['id'],
    },
  )

async function readPromptFile(slug: string, level: PromptLevel) {
  try {
    return await getPromptContent(slug, level)
  } catch {
    return null
  }
}

export const promptRouter = createTRPCRouter({
  listActive: publicProcedure
    .input(
      z
        .object({
          level: promptLevelSchema.optional(),
          category: z.string().min(1).max(100).optional(),
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

      if (input?.category) {
        const lowerCategory = input.category.toLowerCase()
        activePrompts = activePrompts.filter((p) =>
          p.expectedCategories?.some((cat) => cat.toLowerCase() === lowerCategory),
        )
      }

      if (activePrompts.length === 0) return []

      const promptIds = activePrompts.map((p) => p.id)
      const topToolRows = await ctx.db
        .select({
          promptId: runResults.promptId,
          toolId: tools.id,
          toolName: tools.name,
          toolSlug: tools.slug,
          toolLogoUrl: tools.logoUrl,
          recCount: count(recommendations.id),
        })
        .from(recommendations)
        .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
        .innerJoin(tools, eq(recommendations.toolId, tools.id))
        .where(inArray(runResults.promptId, promptIds))
        .groupBy(runResults.promptId, tools.id, tools.name, tools.slug, tools.logoUrl)
        .orderBy(desc(count(recommendations.id)))

      const toolsByPrompt = new Map<string, typeof topToolRows>()
      for (const row of topToolRows) {
        const existing = toolsByPrompt.get(row.promptId) ?? []
        if (existing.length < 4) {
          existing.push(row)
          toolsByPrompt.set(row.promptId, existing)
        }
      }

      return activePrompts.map((prompt) => ({
        ...prompt,
        topTools: (toolsByPrompt.get(prompt.id) ?? []).map((t) => ({
          tool: {
            id: t.toolId,
            name: t.toolName,
            slug: t.toolSlug,
            logoUrl: t.toolLogoUrl,
          },
          count: Number(t.recCount),
        })),
      }))
    }),

  listExpectedCategories: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ expectedCategories: prompts.expectedCategories })
      .from(prompts)
      .where(eq(prompts.isActive, true))

    const categorySet = new Set<string>()
    for (const row of rows) {
      if (row.expectedCategories) {
        for (const cat of row.expectedCategories) {
          categorySet.add(cat)
        }
      }
    }
    return Array.from(categorySet).sort()
  }),

  listWithTopTools: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(10).default(5) }).optional())
    .query(async ({ ctx, input }) => {
      const activePrompts = await ctx.db
        .select({
          id: prompts.id,
          title: prompts.title,
          slug: prompts.slug,
          level: prompts.level,
          description: prompts.description,
          expectedCategories: prompts.expectedCategories,
        })
        .from(prompts)
        .where(eq(prompts.isActive, true))
        .orderBy(desc(prompts.createdAt))
        .limit(input?.limit ?? 5)

      const results = await Promise.all(
        activePrompts.map(async (prompt) => {
          const topTools = await ctx.db
            .select({
              toolId: tools.id,
              toolName: tools.name,
              toolSlug: tools.slug,
              toolLogoUrl: tools.logoUrl,
              recCount: count(recommendations.id),
            })
            .from(recommendations)
            .innerJoin(runResults, eq(recommendations.runResultId, runResults.id))
            .innerJoin(tools, eq(recommendations.toolId, tools.id))
            .where(eq(runResults.promptId, prompt.id))
            .groupBy(tools.id, tools.name, tools.slug, tools.logoUrl)
            .orderBy(desc(count(recommendations.id)))
            .limit(3)

          const totalRecs = topTools.reduce((sum, t) => sum + Number(t.recCount), 0)

          const content = await readPromptFile(prompt.slug, prompt.level as PromptLevel)

          return {
            ...prompt,
            content,
            topTools: topTools.map((t) => ({
              tool: {
                id: t.toolId,
                name: t.toolName,
                slug: t.toolSlug,
                logoUrl: t.toolLogoUrl,
              },
              count: Number(t.recCount),
              rate: totalRecs > 0 ? Number(t.recCount) / totalRecs : 0,
            })),
          }
        }),
      )

      return results
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
            sql`CASE WHEN ${prompts.level} = 'vibe-coder' THEN 0 WHEN ${prompts.level} = 'software-dev-experienced' THEN 1 ELSE 2 END`,
          ),
        )
    }),

  getBySlug: publicProcedure
    .input(
      z.object({
        slug: z.string().min(1).max(255),
        level: promptLevelSchema.default('vibe-coder'),
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

      const content = await readPromptFile(prompt.slug, prompt.level as PromptLevel)
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
})
