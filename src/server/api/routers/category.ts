import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { categories } from '~/server/db/schema'

const createCategoryInput = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  icon: z.string().max(50).optional(),
  displayOrder: z.number().int().default(0),
})

const updateCategoryInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    slug: z.string().min(1).max(100).optional(),
    description: z.string().max(5000).optional(),
    icon: z.string().max(50).optional(),
    displayOrder: z.number().int().optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.slug !== undefined ||
      input.description !== undefined ||
      input.icon !== undefined ||
      input.displayOrder !== undefined,
    {
      message: 'At least one field is required',
      path: ['id'],
    },
  )

export const categoryRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.categories.findMany({
      orderBy: [asc(categories.displayOrder), asc(categories.name)],
    })
  }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const category = await ctx.db.query.categories.findFirst({
        where: eq(categories.slug, input.slug),
      })
      if (!category) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        })
      }
      return category
    }),

  create: protectedProcedure.input(createCategoryInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const inserted = await ctx.db.insert(categories).values(input).returning()
    return inserted[0]
  }),

  update: protectedProcedure.input(updateCategoryInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    const { id, ...rest } = input
    const updated = await ctx.db
      .update(categories)
      .set(rest)
      .where(eq(categories.id, id))
      .returning()

    if (!updated[0]) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Category not found',
      })
    }
    return updated[0]
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const deleted = await ctx.db.delete(categories).where(eq(categories.id, input.id)).returning()

      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        })
      }

      return { success: true, id: deleted[0].id }
    }),
})
