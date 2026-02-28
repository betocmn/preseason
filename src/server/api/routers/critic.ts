import { TRPCError } from '@trpc/server'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { comments, criticProfiles } from '~/server/db/schema'

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

export const criticRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.query.criticProfiles.findMany({
      where: and(eq(criticProfiles.isActive, true), isNotNull(criticProfiles.verifiedAt)),
      orderBy: [desc(criticProfiles.verifiedAt), desc(criticProfiles.createdAt)],
      with: {
        user: true,
      },
    })
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const critic = await ctx.db.query.criticProfiles.findFirst({
        where: eq(criticProfiles.id, input.id),
        with: {
          user: true,
          comments: {
            orderBy: [desc(comments.createdAt)],
          },
        },
      })
      if (!critic) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Critic not found',
        })
      }
      return critic
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
