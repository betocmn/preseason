import { TRPCError } from '@trpc/server'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getUserProfile, requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import {
  categories,
  comments,
  criticProfiles,
  matches,
  recommendations,
  toolCategories,
  tools,
} from '~/server/db/schema'

const targetTypeSchema = z.enum(['recommendation', 'match', 'tool'])
const publicUserColumns = {
  id: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  company: true,
  website: true,
} as const

async function resolveTargetCategorySlugs(
  db: typeof import('~/server/db').db,
  targetType: z.infer<typeof targetTypeSchema>,
  targetId: string,
) {
  if (targetType === 'recommendation') {
    const recommendation = await db.query.recommendations.findFirst({
      where: eq(recommendations.id, targetId),
    })
    if (!recommendation) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Recommendation not found',
      })
    }

    const category = await db.query.categories.findFirst({
      where: eq(categories.id, recommendation.categoryId),
    })
    return category ? [category.slug] : []
  }

  if (targetType === 'match') {
    const match = await db.query.matches.findFirst({
      where: eq(matches.id, targetId),
    })
    if (!match) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Match not found',
      })
    }

    const category = await db.query.categories.findFirst({
      where: eq(categories.id, match.categoryId),
    })
    return category ? [category.slug] : []
  }

  const tool = await db.query.tools.findFirst({
    where: eq(tools.id, targetId),
  })
  if (!tool) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Tool not found',
    })
  }

  const categoriesForTool = await db
    .select({
      slug: categories.slug,
    })
    .from(toolCategories)
    .innerJoin(categories, eq(toolCategories.categoryId, categories.id))
    .where(eq(toolCategories.toolId, targetId))

  return categoriesForTool.map((category) => category.slug)
}

export const commentRouter = createTRPCRouter({
  listByTarget: publicProcedure
    .input(
      z.object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.query.comments.findMany({
        where: (table, { and, eq: equals }) =>
          and(equals(table.targetType, input.targetType), equals(table.targetId, input.targetId)),
        orderBy: [desc(comments.isPinned), desc(comments.createdAt)],
        with: {
          critic: {
            with: {
              user: {
                columns: publicUserColumns,
              },
            },
          },
        },
      })
    }),

  create: protectedProcedure
    .input(
      z.object({
        targetType: targetTypeSchema,
        targetId: z.string().uuid(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['critic'])

      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.userId, ctx.user.id),
      })
      if (!critic || !critic.isActive) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Active critic profile required',
        })
      }

      const targetCategorySlugs = await resolveTargetCategorySlugs(
        ctx.db,
        input.targetType,
        input.targetId,
      )

      const excludedCategories = new Set(critic.excludedCategories ?? [])
      if (targetCategorySlugs.some((slug) => excludedCategories.has(slug))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot comment on excluded category target',
        })
      }

      const inserted = await ctx.db
        .insert(comments)
        .values({
          criticId: critic.id,
          targetType: input.targetType,
          targetId: input.targetId,
          content: input.content,
          isPinned: false,
        })
        .returning()

      return inserted[0]
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().min(1).max(10000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['critic'])

      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.userId, ctx.user.id),
      })
      if (!critic) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Critic profile not found',
        })
      }

      const existingComment = await ctx.db.query.comments.findFirst({
        where: eq(comments.id, input.id),
      })
      if (!existingComment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        })
      }
      if (existingComment.criticId !== critic.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot update another critic comment',
        })
      }

      const updated = await ctx.db
        .update(comments)
        .set({ content: input.content })
        .where(eq(comments.id, input.id))
        .returning()

      return updated[0]
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userProfile = await getUserProfile(ctx.db, ctx.user.id)
      if (userProfile.role === 'admin') {
        const deletedByAdmin = await ctx.db
          .delete(comments)
          .where(eq(comments.id, input.id))
          .returning()
        if (!deletedByAdmin[0]) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Comment not found',
          })
        }
        return { success: true, id: deletedByAdmin[0].id }
      }

      await requireRole(ctx.db, ctx.user.id, ['critic'])
      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.userId, ctx.user.id),
      })
      if (!critic) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Critic profile not found',
        })
      }

      const comment = await ctx.db.query.comments.findFirst({
        where: eq(comments.id, input.id),
      })
      if (!comment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        })
      }
      if (comment.criticId !== critic.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete another critic comment',
        })
      }

      const deleted = await ctx.db.delete(comments).where(eq(comments.id, input.id)).returning()
      if (!deleted[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        })
      }
      return { success: true, id: deleted[0].id }
    }),
})
