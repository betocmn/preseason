import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { prompts } from '~/server/db/schema'
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
  listActive: publicProcedure.query(async ({ ctx }) => {
    return ctx.db
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
      .where(eq(prompts.isActive, true))
      .orderBy(asc(prompts.title))
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
