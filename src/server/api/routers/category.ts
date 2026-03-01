import { TRPCError } from '@trpc/server'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { categories, subcategories } from '~/server/db/schema'

const createSubcategoryInput = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  categoryId: z.string().uuid(),
  description: z.string().max(5000).optional(),
  icon: z.string().max(50).optional(),
  displayOrder: z.number().int().default(0),
})

const updateSubcategoryInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    slug: z.string().min(1).max(100).optional(),
    categoryId: z.string().uuid().optional(),
    description: z.string().max(5000).optional(),
    icon: z.string().max(50).optional(),
    displayOrder: z.number().int().optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.slug !== undefined ||
      input.categoryId !== undefined ||
      input.description !== undefined ||
      input.icon !== undefined ||
      input.displayOrder !== undefined,
    {
      message: 'At least one field is required',
      path: ['id'],
    },
  )

const createGroupInput = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  icon: z.string().max(50).optional(),
  displayOrder: z.number().int().default(0),
})

const updateGroupInput = z
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
  // ========================================================================
  // Subcategory procedures (previously "categories")
  // ========================================================================

  list: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      if (input?.categorySlug) {
        const group = await ctx.db.query.categories.findFirst({
          where: eq(categories.slug, input.categorySlug),
        })
        if (!group) return []

        return ctx.db.query.subcategories.findMany({
          where: eq(subcategories.categoryId, group.id),
          orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          with: { categoryGroup: true },
        })
      }

      return ctx.db.query.subcategories.findMany({
        orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
        with: { categoryGroup: true },
      })
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const subcategory = await ctx.db.query.subcategories.findFirst({
        where: eq(subcategories.slug, input.slug),
        with: { categoryGroup: true },
      })
      if (!subcategory) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        })
      }
      return subcategory
    }),

  create: protectedProcedure.input(createSubcategoryInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const inserted = await ctx.db.insert(subcategories).values(input).returning()
    return inserted[0]
  }),

  update: protectedProcedure.input(updateSubcategoryInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    const { id, ...rest } = input
    const updated = await ctx.db
      .update(subcategories)
      .set(rest)
      .where(eq(subcategories.id, id))
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

      const deleted = await ctx.db
        .delete(subcategories)
        .where(eq(subcategories.id, input.id))
        .returning()

      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category not found',
        })
      }

      return { success: true, id: deleted[0].id }
    }),

  // ========================================================================
  // Category group procedures
  // ========================================================================

  listGroups: publicProcedure.query(async ({ ctx }) => {
    const groups = await ctx.db.query.categories.findMany({
      orderBy: [asc(categories.displayOrder), asc(categories.name)],
      with: { subcategories: true },
    })

    return groups.map((group) => ({
      ...group,
      subcategoryCount: group.subcategories.length,
    }))
  }),

  getGroupBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const group = await ctx.db.query.categories.findFirst({
        where: eq(categories.slug, input.slug),
        with: {
          subcategories: {
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          },
        },
      })
      if (!group) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category group not found',
        })
      }
      return group
    }),

  createGroup: protectedProcedure.input(createGroupInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const inserted = await ctx.db.insert(categories).values(input).returning()
    return inserted[0]
  }),

  updateGroup: protectedProcedure.input(updateGroupInput).mutation(async ({ ctx, input }) => {
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
        message: 'Category group not found',
      })
    }
    return updated[0]
  }),

  deleteGroup: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const deleted = await ctx.db
        .delete(categories)
        .where(eq(categories.id, input.id))
        .returning()

      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Category group not found',
        })
      }

      return { success: true, id: deleted[0].id }
    }),
})
