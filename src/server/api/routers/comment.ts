import { TRPCError } from '@trpc/server'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { getUserProfile, requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import {
  comments,
  criticProfiles,
  matches,
  recommendations,
  subcategories,
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

    const category = await db.query.subcategories.findFirst({
      where: eq(subcategories.id, recommendation.categoryId),
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

    const category = await db.query.subcategories.findFirst({
      where: eq(subcategories.id, match.categoryId),
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

  const subcategoriesForTool = await db
    .select({
      slug: subcategories.slug,
    })
    .from(toolCategories)
    .innerJoin(subcategories, eq(toolCategories.categoryId, subcategories.id))
    .where(eq(toolCategories.toolId, targetId))

  return subcategoriesForTool.map((sc) => sc.slug)
}

export const commentRouter = createTRPCRouter({
  listRecent: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const LIMIT = input?.limit ?? 30

      const verifiedCritics = await ctx.db.query.criticProfiles.findMany({
        where: and(eq(criticProfiles.isActive, true), isNotNull(criticProfiles.verifiedAt)),
        columns: { id: true },
      })

      if (verifiedCritics.length === 0) return []

      const criticIds = verifiedCritics.map((c) => c.id)

      const recentComments = await ctx.db.query.comments.findMany({
        where: inArray(comments.criticId, criticIds),
        orderBy: [desc(comments.createdAt)],
        limit: LIMIT,
        with: {
          critic: {
            with: { user: { columns: publicUserColumns } },
          },
        },
      })

      const matchIds = new Set<string>()
      const toolIds = new Set<string>()
      const recIds = new Set<string>()

      for (const c of recentComments) {
        if (c.targetType === 'match') matchIds.add(c.targetId)
        else if (c.targetType === 'tool') toolIds.add(c.targetId)
        else if (c.targetType === 'recommendation') recIds.add(c.targetId)
      }

      const [matchTargets, toolTargets, recTargets] = await Promise.all([
        matchIds.size > 0
          ? ctx.db.query.matches.findMany({
              where: inArray(matches.id, [...matchIds]),
              with: {
                toolA: { columns: { id: true, name: true, slug: true, logoUrl: true } },
                toolB: { columns: { id: true, name: true, slug: true, logoUrl: true } },
                category: true,
              },
            })
          : [],
        toolIds.size > 0
          ? ctx.db.query.tools.findMany({
              where: inArray(tools.id, [...toolIds]),
              columns: { id: true, name: true, slug: true, logoUrl: true },
            })
          : [],
        recIds.size > 0
          ? ctx.db.query.recommendations.findMany({
              where: inArray(recommendations.id, [...recIds]),
              with: {
                tool: { columns: { id: true, name: true, slug: true, logoUrl: true } },
                category: { with: { categoryGroup: true } },
              },
            })
          : [],
      ])

      const matchMap = new Map(matchTargets.map((m) => [m.id, m]))
      const toolMap = new Map(toolTargets.map((t) => [t.id, t]))
      const recMap = new Map(recTargets.map((r) => [r.id, r]))

      return recentComments
        .map((comment) => {
          let context: {
            type: 'match' | 'tool' | 'recommendation'
            label: string
            sublabel: string
            href: string
            logos: Array<{ url: string | null; name: string }>
          } | null = null

          if (comment.targetType === 'match') {
            const match = matchMap.get(comment.targetId)
            if (!match) return null
            context = {
              type: 'match',
              label: `${match.toolA.name} vs ${match.toolB.name}`,
              sublabel: match.category?.name ?? '',
              href: `/matches/${comment.targetId}`,
              logos: [
                { url: match.toolA.logoUrl, name: match.toolA.name },
                { url: match.toolB.logoUrl, name: match.toolB.name },
              ],
            }
          } else if (comment.targetType === 'tool') {
            const tool = toolMap.get(comment.targetId)
            if (!tool) return null
            context = {
              type: 'tool',
              label: tool.name,
              sublabel: '',
              href: `/tools/${tool.slug}`,
              logos: [{ url: tool.logoUrl, name: tool.name }],
            }
          } else if (comment.targetType === 'recommendation') {
            const rec = recMap.get(comment.targetId)
            if (!rec) return null
            const groupSlug = rec.category?.categoryGroup?.slug
            const subSlug = rec.category?.slug
            context = {
              type: 'recommendation',
              label: rec.tool?.name ?? 'Tool',
              sublabel: rec.category?.name ?? '',
              href: groupSlug && subSlug ? `/rankings/${groupSlug}/${subSlug}` : '#',
              logos: [{ url: rec.tool?.logoUrl ?? null, name: rec.tool?.name ?? '' }],
            }
          }

          if (!context) return null

          return {
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            critic: {
              id: comment.critic.id,
              user: comment.critic.user,
              title: comment.critic.title,
            },
            context,
          }
        })
        .filter((c) => c !== null)
    }),

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
      if (!critic || !critic.isActive || !critic.verifiedAt) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Active verified critic profile required',
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
