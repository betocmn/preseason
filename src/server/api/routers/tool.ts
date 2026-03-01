import { TRPCError } from '@trpc/server'
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { paginationInputSchema } from '~/server/api/helpers/pagination'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { subcategories, toolCategories, tools } from '~/server/db/schema'

const createToolInput = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  website: z.string().url().max(512).optional(),
  logoUrl: z.string().url().max(512).optional(),
  providerUserId: z.string().uuid().nullable().optional(),
  aliases: z.array(z.string().min(1).max(255)).max(50).optional(),
  categoryIds: z.array(z.string().uuid()).max(50).optional(),
})

const updateToolInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255).optional(),
    slug: z.string().min(1).max(255).optional(),
    description: z.string().max(5000).nullable().optional(),
    website: z.string().url().max(512).nullable().optional(),
    logoUrl: z.string().url().max(512).nullable().optional(),
    providerUserId: z.string().uuid().nullable().optional(),
    aliases: z.array(z.string().min(1).max(255)).max(50).nullable().optional(),
    categoryIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.slug !== undefined ||
      input.description !== undefined ||
      input.website !== undefined ||
      input.logoUrl !== undefined ||
      input.providerUserId !== undefined ||
      input.aliases !== undefined ||
      input.categoryIds !== undefined,
    {
      message: 'At least one field is required',
      path: ['id'],
    },
  )

type Database = typeof import('~/server/db').db

async function validateCategoryIds(db: Database, categoryIds: string[]) {
  if (categoryIds.length === 0) return
  const existing = await db
    .select({ id: subcategories.id })
    .from(subcategories)
    .where(inArray(subcategories.id, categoryIds))

  const existingIds = new Set(existing.map((row) => row.id))
  const missingIds = categoryIds.filter((id) => !existingIds.has(id))
  if (missingIds.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'One or more category IDs are invalid',
    })
  }
}

async function getToolWithCategories(db: Database, toolId: string) {
  return db.query.tools.findFirst({
    where: eq(tools.id, toolId),
    with: {
      toolCategories: {
        with: {
          category: true,
        },
      },
    },
  })
}

export const toolRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      paginationInputSchema.extend({
        categorySlug: z.string().min(1).max(100).optional(),
        verifiedOnly: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let categoryId: string | undefined
      if (input.categorySlug) {
        const category = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        })
        if (!category) {
          return {
            items: [],
            total: 0,
            limit: input.limit,
            offset: input.offset,
          }
        }
        categoryId = category.id
      }

      let categoryToolIds: string[] | undefined
      if (categoryId) {
        const rows = await ctx.db
          .select({ toolId: toolCategories.toolId })
          .from(toolCategories)
          .where(eq(toolCategories.categoryId, categoryId))
        categoryToolIds = rows.map((row) => row.toolId)
        if (categoryToolIds.length === 0) {
          return {
            items: [],
            total: 0,
            limit: input.limit,
            offset: input.offset,
          }
        }
      }

      const where = and(
        categoryToolIds ? inArray(tools.id, categoryToolIds) : undefined,
        input.verifiedOnly ? eq(tools.isVerified, true) : undefined,
      )

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(tools)
        .where(where)
      const total = Number(countResult[0]?.count ?? 0)

      const items = await ctx.db.query.tools.findMany({
        where,
        orderBy: [asc(tools.name)],
        limit: input.limit,
        offset: input.offset,
        with: {
          toolCategories: {
            with: {
              category: true,
            },
          },
        },
      })

      return {
        items,
        total,
        limit: input.limit,
        offset: input.offset,
      }
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const tool = await ctx.db.query.tools.findFirst({
        where: eq(tools.slug, input.slug),
        with: {
          toolCategories: {
            with: {
              category: true,
            },
          },
        },
      })
      if (!tool) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        })
      }
      return tool
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(255),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`
      return ctx.db.query.tools.findMany({
        where: or(
          ilike(tools.name, pattern),
          ilike(tools.slug, pattern),
          sql`${tools.aliases}::text ILIKE ${pattern}`,
        ),
        orderBy: [asc(tools.name)],
        limit: input.limit,
        with: {
          toolCategories: {
            with: {
              category: true,
            },
          },
        },
      })
    }),

  listMine: protectedProcedure
    .input(
      paginationInputSchema.extend({
        providerUserId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['provider', 'admin'])
      const providerUserId =
        profile.role === 'admin' ? (input.providerUserId ?? ctx.user.id) : ctx.user.id

      const countResult = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(tools)
        .where(eq(tools.providerUserId, providerUserId))
      const total = Number(countResult[0]?.count ?? 0)

      const items = await ctx.db.query.tools.findMany({
        where: eq(tools.providerUserId, providerUserId),
        orderBy: [asc(tools.name)],
        limit: input.limit,
        offset: input.offset,
        with: {
          toolCategories: {
            with: {
              category: true,
            },
          },
        },
      })

      return {
        items,
        total,
        limit: input.limit,
        offset: input.offset,
      }
    }),

  create: protectedProcedure.input(createToolInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])
    const categoryIds = [...new Set(input.categoryIds ?? [])]
    await validateCategoryIds(ctx.db, categoryIds)

    const inserted = await ctx.db
      .insert(tools)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description,
        website: input.website,
        logoUrl: input.logoUrl,
        providerUserId: input.providerUserId ?? null,
        aliases: input.aliases,
      })
      .returning()

    const tool = inserted[0]
    if (!tool) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create tool',
      })
    }

    if (categoryIds.length > 0) {
      await ctx.db.insert(toolCategories).values(
        categoryIds.map((categoryId, index) => ({
          toolId: tool.id,
          categoryId,
          isPrimary: index === 0,
        })),
      )
    }

    return getToolWithCategories(ctx.db, tool.id)
  }),

  update: protectedProcedure.input(updateToolInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    const existing = await ctx.db.query.tools.findFirst({
      where: eq(tools.id, input.id),
    })
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Tool not found',
      })
    }

    const categoryIds = input.categoryIds ? [...new Set(input.categoryIds)] : undefined
    if (categoryIds) {
      await validateCategoryIds(ctx.db, categoryIds)
    }

    const { id, categoryIds: _categoryIds, ...rest } = input
    if (Object.keys(rest).length > 0) {
      await ctx.db.update(tools).set(rest).where(eq(tools.id, id))
    }

    if (categoryIds) {
      await ctx.db.delete(toolCategories).where(eq(toolCategories.toolId, id))
      if (categoryIds.length > 0) {
        await ctx.db.insert(toolCategories).values(
          categoryIds.map((categoryId, index) => ({
            toolId: id,
            categoryId,
            isPrimary: index === 0,
          })),
        )
      }
    }

    const updated = await getToolWithCategories(ctx.db, id)
    if (!updated) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Tool not found',
      })
    }
    return updated
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const deleted = await ctx.db.delete(tools).where(eq(tools.id, input.id)).returning()
      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        })
      }

      return {
        success: true,
        id: deleted[0].id,
      }
    }),

  verify: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const updated = await ctx.db
        .update(tools)
        .set({ isVerified: true })
        .where(eq(tools.id, input.id))
        .returning()

      if (!updated[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tool not found',
        })
      }

      return updated[0]
    }),
})
