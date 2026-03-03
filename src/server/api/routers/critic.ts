import { TRPCError } from '@trpc/server'
import { and, count, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { comments, criticProfiles, matches, recommendations, tools } from '~/server/db/schema'

const updateOwnInput = z
  .object({
    title: z.string().max(255).nullable().optional(),
    expertiseAreas: z.array(z.string().min(1).max(100)).max(100).nullable().optional(),
    excludedCategories: z.array(z.string().min(1).max(100)).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.expertiseAreas !== undefined ||
      input.excludedCategories !== undefined ||
      input.isActive !== undefined,
    {
      message: 'At least one field is required',
    },
  )

const publicUserColumns = {
  id: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
  company: true,
  website: true,
} as const

export const criticRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.criticProfiles.findMany({
      where: and(eq(criticProfiles.isActive, true), isNotNull(criticProfiles.verifiedAt)),
      orderBy: [desc(criticProfiles.verifiedAt), desc(criticProfiles.createdAt)],
      with: {
        user: {
          columns: publicUserColumns,
        },
      },
    })
  }),

  listWithCount: publicProcedure.query(async ({ ctx }) => {
    const critics = await ctx.db.query.criticProfiles.findMany({
      where: and(eq(criticProfiles.isActive, true), isNotNull(criticProfiles.verifiedAt)),
      orderBy: [desc(criticProfiles.verifiedAt), desc(criticProfiles.createdAt)],
      limit: 12,
      with: { user: { columns: publicUserColumns } },
    })

    const criticIds = critics.map((c) => c.id)
    const countRows =
      criticIds.length > 0
        ? await ctx.db
            .select({ criticId: comments.criticId, total: count() })
            .from(comments)
            .where(inArray(comments.criticId, criticIds))
            .groupBy(comments.criticId)
        : []

    const countMap = new Map(countRows.map((r) => [r.criticId, r.total]))

    return critics.map((critic) => ({
      id: critic.id,
      title: critic.title,
      user: critic.user,
      commentCount: countMap.get(critic.id) ?? 0,
    }))
  }),

  listWithComments: publicProcedure.query(async ({ ctx }) => {
    const critics = await ctx.db.query.criticProfiles.findMany({
      where: and(eq(criticProfiles.isActive, true), isNotNull(criticProfiles.verifiedAt)),
      orderBy: [desc(criticProfiles.verifiedAt), desc(criticProfiles.createdAt)],
      with: {
        user: { columns: publicUserColumns },
        comments: { orderBy: [desc(comments.createdAt)] },
      },
    })

    const matchIds = new Set<string>()
    const toolIds = new Set<string>()
    const recommendationIds = new Set<string>()

    for (const critic of critics) {
      for (const comment of critic.comments) {
        if (comment.targetType === 'match') matchIds.add(comment.targetId)
        if (comment.targetType === 'tool') toolIds.add(comment.targetId)
        if (comment.targetType === 'recommendation') recommendationIds.add(comment.targetId)
      }
    }

    const [matchTargets, toolTargets, recTargets] = await Promise.all([
      matchIds.size > 0
        ? ctx.db.query.matches.findMany({
            where: inArray(matches.id, [...matchIds]),
            with: { category: { with: { categoryGroup: true } } },
          })
        : [],
      toolIds.size > 0
        ? ctx.db.query.tools.findMany({
            where: inArray(tools.id, [...toolIds]),
            columns: { id: true, name: true, slug: true },
          })
        : [],
      recommendationIds.size > 0
        ? ctx.db.query.recommendations.findMany({
            where: inArray(recommendations.id, [...recommendationIds]),
            with: { category: { with: { categoryGroup: true } } },
          })
        : [],
    ])

    const matchMap = new Map(matchTargets.map((m) => [m.id, m]))
    const toolMap = new Map(toolTargets.map((t) => [t.id, t]))
    const recMap = new Map(recTargets.map((r) => [r.id, r]))

    return critics.map((critic) => ({
      id: critic.id,
      title: critic.title,
      expertiseAreas: critic.expertiseAreas,
      user: critic.user,
      commentTargets: critic.comments
        .map((comment) => {
          let label = ''
          let href = ''

          if (comment.targetType === 'match') {
            const match = matchMap.get(comment.targetId)
            if (!match) return null
            label = match.category?.name ?? 'Match'
            href = `/matches/${comment.targetId}`
          } else if (comment.targetType === 'tool') {
            const tool = toolMap.get(comment.targetId)
            if (!tool) return null
            label = tool.name
            href = `/tools/${tool.slug}`
          } else if (comment.targetType === 'recommendation') {
            const rec = recMap.get(comment.targetId)
            if (!rec) return null
            const groupSlug = rec.category?.categoryGroup?.slug
            const subSlug = rec.category?.slug
            label = rec.category?.name ?? 'Recommendation'
            href = groupSlug && subSlug ? `/rankings/${groupSlug}/${subSlug}` : '#'
          }

          return {
            id: comment.id,
            targetType: comment.targetType,
            label,
            href,
            content: comment.content,
            createdAt: comment.createdAt,
          }
        })
        .filter((c) => c !== null),
    }))
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.id, input.id),
        with: {
          user: { columns: publicUserColumns },
          comments: { orderBy: [desc(comments.createdAt)] },
        },
      })
      if (!critic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Critic not found',
        })
      }

      const matchIds = new Set<string>()
      const toolIds = new Set<string>()
      const recommendationIds = new Set<string>()

      for (const comment of critic.comments) {
        if (comment.targetType === 'match') matchIds.add(comment.targetId)
        if (comment.targetType === 'tool') toolIds.add(comment.targetId)
        if (comment.targetType === 'recommendation') recommendationIds.add(comment.targetId)
      }

      const [matchTargets, toolTargets, recTargets] = await Promise.all([
        matchIds.size > 0
          ? ctx.db.query.matches.findMany({
              where: inArray(matches.id, [...matchIds]),
              with: { category: { with: { categoryGroup: true } } },
            })
          : [],
        toolIds.size > 0
          ? ctx.db.query.tools.findMany({
              where: inArray(tools.id, [...toolIds]),
              columns: { id: true, name: true, slug: true },
            })
          : [],
        recommendationIds.size > 0
          ? ctx.db.query.recommendations.findMany({
              where: inArray(recommendations.id, [...recommendationIds]),
              with: { category: { with: { categoryGroup: true } } },
            })
          : [],
      ])

      const matchMap = new Map(matchTargets.map((m) => [m.id, m]))
      const toolMap = new Map(toolTargets.map((t) => [t.id, t]))
      const recMap = new Map(recTargets.map((r) => [r.id, r]))

      return {
        id: critic.id,
        title: critic.title,
        expertiseAreas: critic.expertiseAreas,
        user: critic.user,
        commentTargets: critic.comments
          .map((comment) => {
            let label = ''
            let href = ''

            if (comment.targetType === 'match') {
              const match = matchMap.get(comment.targetId)
              if (!match) return null
              label = match.category?.name ?? 'Match'
              href = `/matches/${comment.targetId}`
            } else if (comment.targetType === 'tool') {
              const tool = toolMap.get(comment.targetId)
              if (!tool) return null
              label = tool.name
              href = `/tools/${tool.slug}`
            } else if (comment.targetType === 'recommendation') {
              const rec = recMap.get(comment.targetId)
              if (!rec) return null
              const groupSlug = rec.category?.categoryGroup?.slug
              const subSlug = rec.category?.slug
              label = rec.category?.name ?? 'Recommendation'
              href = groupSlug && subSlug ? `/rankings/${groupSlug}/${subSlug}` : '#'
            }

            return {
              id: comment.id,
              targetType: comment.targetType,
              label,
              href,
              content: comment.content,
              createdAt: comment.createdAt,
            }
          })
          .filter((c) => c !== null),
      }
    }),

  verify: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const updated = await ctx.db
        .update(criticProfiles)
        .set({
          verifiedAt: new Date(),
          verifiedBy: ctx.user.id,
          isActive: true,
        })
        .where(eq(criticProfiles.id, input.id))
        .returning()

      if (!updated[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Critic not found',
        })
      }

      return updated[0]
    }),

  unverify: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const updated = await ctx.db
        .update(criticProfiles)
        .set({
          verifiedAt: null,
          verifiedBy: null,
        })
        .where(eq(criticProfiles.id, input.id))
        .returning()

      if (!updated[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Critic not found',
        })
      }

      return updated[0]
    }),

  updateOwn: protectedProcedure.input(updateOwnInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['critic'])

    const existing = await ctx.db.query.criticProfiles.findFirst({
      where: eq(criticProfiles.userId, ctx.user.id),
    })

    if (!existing) {
      const inserted = await ctx.db
        .insert(criticProfiles)
        .values({
          userId: ctx.user.id,
          title: input.title ?? null,
          expertiseAreas: input.expertiseAreas ?? null,
          excludedCategories: input.excludedCategories ?? null,
          isActive: input.isActive ?? true,
        })
        .returning()

      return inserted[0]
    }

    const updated = await ctx.db
      .update(criticProfiles)
      .set({
        title: input.title,
        expertiseAreas: input.expertiseAreas,
        excludedCategories: input.excludedCategories,
        isActive: input.isActive,
      })
      .where(eq(criticProfiles.id, existing.id))
      .returning()

    return updated[0]
  }),
})
