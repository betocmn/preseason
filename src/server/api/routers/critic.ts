import { TRPCError } from '@trpc/server'
import { and, count, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import {
  comments,
  criticProfiles,
  matches,
  recommendations,
  tools,
  userProfiles,
} from '~/server/db/schema'

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

const avatarPathSchema = z
  .string()
  .max(512)
  .refine((value) => /^\/(?!\/)/.test(value), {
    message: 'Avatar path must start with "/" and not be a protocol-relative URL',
  })

const adminCreateInput = z
  .object({
    // Link to existing user by their profile ID, or omit to create a new user profile
    userId: z.string().uuid().optional(),
    displayName: z.string().min(1).max(150).optional(),
    email: z.string().email().max(255).optional(),
    avatarUrl: avatarPathSchema.optional(),
    bio: z.string().max(5000).optional(),
    company: z.string().max(255).optional(),
    website: z.string().max(255).optional(),
    title: z.string().max(255).optional(),
    expertiseAreas: z.array(z.string().min(1).max(100)).max(100).optional(),
    excludedCategories: z.array(z.string().min(1).max(100)).max(100).optional(),
    isActive: z.boolean().optional(),
    verified: z.boolean().optional(),
  })
  .refine((input) => input.userId != null || (input.displayName != null && input.email != null), {
    message: 'Either userId (existing user) or both displayName and email are required',
  })

const adminUpdateInput = z
  .object({
    id: z.string().uuid(),
    displayName: z.string().min(1).max(150).optional(),
    avatarUrl: avatarPathSchema.nullable().optional(),
    bio: z.string().max(5000).nullable().optional(),
    company: z.string().max(255).nullable().optional(),
    website: z.string().max(255).nullable().optional(),
    title: z.string().max(255).nullable().optional(),
    expertiseAreas: z.array(z.string().min(1).max(100)).max(100).nullable().optional(),
    excludedCategories: z.array(z.string().min(1).max(100)).max(100).nullable().optional(),
    isActive: z.boolean().optional(),
    verified: z.boolean().optional(),
  })
  .refine(
    (input) => {
      const { id: _, ...fields } = input
      return Object.values(fields).some((v) => v !== undefined)
    },
    { message: 'At least one field is required' },
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

  adminList: protectedProcedure.query(async ({ ctx }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    return ctx.db.query.criticProfiles.findMany({
      orderBy: [desc(criticProfiles.createdAt)],
      limit: 100,
      with: { user: true },
    })
  }),

  adminGetById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.id, input.id),
        with: { user: true },
      })

      if (!critic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Critic not found',
        })
      }

      return critic
    }),

  adminCreate: protectedProcedure.input(adminCreateInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    let resolvedUserId: string

    if (input.userId) {
      const existingUser = await ctx.db.query.userProfiles.findFirst({
        where: eq(userProfiles.id, input.userId),
      })
      if (!existingUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' })
      }
      const existingCritic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.userId, input.userId),
      })
      if (existingCritic) {
        throw new TRPCError({ code: 'CONFLICT', message: 'User already has a critic profile' })
      }
      if (existingUser.role !== 'critic' && existingUser.role !== 'user') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot link a user with role "${existingUser.role}" as a critic`,
        })
      }
      if (existingUser.role !== 'critic') {
        await ctx.db
          .update(userProfiles)
          .set({ role: 'critic' })
          .where(eq(userProfiles.id, input.userId))
      }
      resolvedUserId = input.userId
    } else {
      const { email, displayName } = input
      if (!email || !displayName) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'displayName and email are required when not linking an existing user',
        })
      }
      const newUserId = crypto.randomUUID()
      const userRow = await ctx.db
        .insert(userProfiles)
        .values({
          id: newUserId,
          email,
          displayName,
          avatarUrl: input.avatarUrl ?? null,
          bio: input.bio ?? null,
          company: input.company ?? null,
          website: input.website ?? null,
          role: 'critic',
        })
        .returning()

      if (!userRow[0]) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create user' })
      }
      resolvedUserId = newUserId
    }

    const criticRow = await ctx.db
      .insert(criticProfiles)
      .values({
        userId: resolvedUserId,
        title: input.title ?? null,
        expertiseAreas: input.expertiseAreas ?? null,
        excludedCategories: input.excludedCategories ?? null,
        isActive: input.isActive ?? true,
        verifiedAt: input.verified ? new Date() : null,
        verifiedBy: input.verified ? ctx.user.id : null,
      })
      .returning()

    if (!criticRow[0]) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create critic profile',
      })
    }

    const result = await ctx.db.query.criticProfiles.findFirst({
      where: eq(criticProfiles.id, criticRow[0].id),
      with: { user: true },
    })

    if (!result) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch created critic',
      })
    }

    return result
  }),

  adminUpdate: protectedProcedure.input(adminUpdateInput).mutation(async ({ ctx, input }) => {
    await requireRole(ctx.db, ctx.user.id, ['admin'])

    const critic = await ctx.db.query.criticProfiles.findFirst({
      where: eq(criticProfiles.id, input.id),
      with: { user: true },
    })

    if (!critic) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Critic not found' })
    }

    const userUpdates: Record<string, unknown> = {}
    if (input.displayName !== undefined) userUpdates.displayName = input.displayName
    if (input.avatarUrl !== undefined) userUpdates.avatarUrl = input.avatarUrl
    if (input.bio !== undefined) userUpdates.bio = input.bio
    if (input.company !== undefined) userUpdates.company = input.company
    if (input.website !== undefined) userUpdates.website = input.website

    if (Object.keys(userUpdates).length > 0) {
      await ctx.db.update(userProfiles).set(userUpdates).where(eq(userProfiles.id, critic.userId))
    }

    const criticUpdates: Record<string, unknown> = {}
    if (input.title !== undefined) criticUpdates.title = input.title
    if (input.expertiseAreas !== undefined) criticUpdates.expertiseAreas = input.expertiseAreas
    if (input.excludedCategories !== undefined)
      criticUpdates.excludedCategories = input.excludedCategories
    if (input.isActive !== undefined) criticUpdates.isActive = input.isActive
    if (input.verified !== undefined) {
      criticUpdates.verifiedAt = input.verified ? new Date() : null
      criticUpdates.verifiedBy = input.verified ? ctx.user.id : null
    }

    if (Object.keys(criticUpdates).length > 0) {
      await ctx.db.update(criticProfiles).set(criticUpdates).where(eq(criticProfiles.id, input.id))
    }

    const updated = await ctx.db.query.criticProfiles.findFirst({
      where: eq(criticProfiles.id, input.id),
      with: { user: true },
    })

    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Critic not found after update' })
    }

    return updated
  }),

  adminDelete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.id, input.id),
      })

      if (!critic) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Critic not found' })
      }

      // Check whether the user has a real auth.users identity (linked user)
      // vs. a placeholder created by adminCreate (no auth account) BEFORE
      // making any mutations, so a failure here leaves the DB unchanged.
      // auth.users only exists in Supabase; plain PostgreSQL (e.g. tests) won't have it,
      // so we fall back to treating the profile as admin-created (safe to remove).
      let hasAuthAccount = false
      try {
        const authRows = await ctx.db.execute<{ id: string }>(
          sql`SELECT id FROM auth.users WHERE id = ${critic.userId}::uuid LIMIT 1`,
        )
        hasAuthAccount = authRows.length > 0
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('relation "auth.users" does not exist')) {
          hasAuthAccount = false
        } else {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to verify auth account status',
            cause: err,
          })
        }
      }

      // Remove the critic profile
      await ctx.db.delete(criticProfiles).where(eq(criticProfiles.id, input.id))

      if (hasAuthAccount) {
        // Linked real user: restore role back to 'user', leave their account intact
        await ctx.db
          .update(userProfiles)
          .set({ role: 'user' })
          .where(eq(userProfiles.id, critic.userId))
      } else {
        // Admin-created placeholder with no auth account: safe to remove the profile
        await ctx.db.delete(userProfiles).where(eq(userProfiles.id, critic.userId))
      }

      return { success: true, id: input.id }
    }),
})
