import { TRPCError } from '@trpc/server'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { producers } from '~/server/db/schema'

export const producerRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        regionId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const whereClause = input.regionId ? eq(producers.regionId, input.regionId) : undefined

      const [items, totalResult] = await Promise.all([
        ctx.db.select().from(producers).where(whereClause).limit(input.limit).offset(input.offset),
        ctx.db.select({ count: count() }).from(producers).where(whereClause),
      ])

      return { items, total: totalResult[0]?.count ?? 0 }
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const producer = await ctx.db.query.producers.findFirst({
        where: eq(producers.id, input.id),
        with: { wines: true, region: true },
      })

      if (!producer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Producer not found' })
      }

      return producer
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        regionId: z.string().uuid().optional(),
        description: z.string().optional(),
        website: z.string().url().max(255).optional(),
        imageUrl: z.string().url().max(512).optional(),
        userId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])

      if (profile.role === 'producer' && input.userId && input.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Producers can only create a producer profile linked to their own account',
        })
      }

      const result = await ctx.db
        .insert(producers)
        .values({
          name: input.name,
          regionId: input.regionId,
          description: input.description,
          website: input.website,
          imageUrl: input.imageUrl,
          userId: input.userId,
        })
        .returning()

      return result[0]
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        regionId: z.string().uuid().optional().nullable(),
        description: z.string().optional().nullable(),
        website: z.string().url().max(255).optional().nullable(),
        imageUrl: z.string().url().max(512).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])

      const existing = await ctx.db.query.producers.findFirst({
        where: eq(producers.id, input.id),
      })

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Producer not found' })
      }

      if (profile.role === 'producer' && existing.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Producers can only update their own producer profile',
        })
      }

      const { id: _, ...fields } = input
      const updateData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) {
          updateData[key] = value
        }
      }

      if (Object.keys(updateData).length === 0) {
        return existing
      }

      const result = await ctx.db
        .update(producers)
        .set(updateData)
        .where(eq(producers.id, input.id))
        .returning()

      return result[0]
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const result = await ctx.db.delete(producers).where(eq(producers.id, input.id)).returning()

      if (!result[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Producer not found' })
      }

      return result[0]
    }),
})
