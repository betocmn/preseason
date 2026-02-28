import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { llms } from '~/server/db/schema'

const createLlmInput = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  provider: z.string().min(1).max(100),
  modelId: z.string().min(1).max(255),
  isActive: z.boolean().default(true),
})

const updateLlmInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    slug: z.string().min(1).max(255).optional(),
    provider: z.string().min(1).max(100).optional(),
    modelId: z.string().min(1).max(255).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.slug !== undefined ||
      input.provider !== undefined ||
      input.modelId !== undefined ||
      input.isActive !== undefined,
    {
      message: 'At least one field is required',
      path: ['id'],
    },
  )

export const llmRouter = createTRPCRouter({
  listActive: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.llms.findMany({
      where: eq(llms.isActive, true),
      orderBy: [asc(llms.name)],
    })
  }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const llm = await ctx.db.query.llms.findFirst({
        where: eq(llms.slug, input.slug),
      })

      if (!llm) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'LLM not found',
        })
      }

      return llm
    }),

  create: protectedProcedure.input(createLlmInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const inserted = await ctx.db.insert(llms).values(input).returning()
    return inserted[0]
  }),

  update: protectedProcedure.input(updateLlmInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const { id, ...rest } = input

    const updated = await ctx.db.update(llms).set(rest).where(eq(llms.id, id)).returning()
    if (!updated[0]) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'LLM not found',
      })
    }

    return updated[0]
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const deleted = await ctx.db.delete(llms).where(eq(llms.id, input.id)).returning()
      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'LLM not found',
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
        .update(llms)
        .set({ isActive: input.isActive })
        .where(eq(llms.id, input.id))
        .returning()

      if (!updated[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'LLM not found',
        })
      }

      return updated[0]
    }),
})
