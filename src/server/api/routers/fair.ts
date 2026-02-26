import { TRPCError } from '@trpc/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireRole } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { fairProducers, fairs, fairWines, producers, wines } from '~/server/db/schema'

export const fairRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          activeOnly: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const whereClause = input?.activeOnly ? eq(fairs.isActive, true) : undefined

      return ctx.db.select().from(fairs).where(whereClause)
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const fair = await ctx.db.query.fairs.findFirst({
        where: eq(fairs.id, input.id),
        with: {
          fairProducers: {
            with: { producer: true },
          },
          fairWines: {
            with: { wine: { with: { producer: true } } },
          },
        },
      })

      if (!fair) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Fair not found' })
      }

      return fair
    }),

  create: protectedProcedure
    .input(
      z
        .object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          location: z.string().max(255).optional(),
          startDate: z.string(),
          endDate: z.string(),
          isActive: z.boolean().default(false),
          imageUrl: z.string().url().max(512).optional(),
        })
        .refine((data) => data.endDate >= data.startDate, {
          message: 'End date must be on or after start date',
          path: ['endDate'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const result = await ctx.db
        .insert(fairs)
        .values({
          name: input.name,
          description: input.description,
          location: input.location,
          startDate: input.startDate,
          endDate: input.endDate,
          isActive: input.isActive,
          imageUrl: input.imageUrl,
        })
        .returning()

      return result[0]
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional().nullable(),
        location: z.string().max(255).optional().nullable(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        isActive: z.boolean().optional(),
        imageUrl: z.string().url().max(512).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const existing = await ctx.db.query.fairs.findFirst({
        where: eq(fairs.id, input.id),
      })

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Fair not found' })
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
        .update(fairs)
        .set(updateData)
        .where(eq(fairs.id, input.id))
        .returning()

      return result[0]
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const result = await ctx.db.delete(fairs).where(eq(fairs.id, input.id)).returning()

      if (!result[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Fair not found' })
      }

      return result[0]
    }),

  addWine: protectedProcedure
    .input(
      z.object({
        fairId: z.string().uuid(),
        wineId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])

      if (profile.role === 'producer') {
        const wine = await ctx.db.query.wines.findFirst({
          where: eq(wines.id, input.wineId),
        })
        if (!wine) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Wine not found' })
        }
        const producer = await ctx.db.query.producers.findFirst({
          where: eq(producers.id, wine.producerId),
        })
        if (!producer || producer.userId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Producers can only add their own wines to a fair',
          })
        }
      }

      try {
        const result = await ctx.db
          .insert(fairWines)
          .values({
            fairId: input.fairId,
            wineId: input.wineId,
          })
          .returning()

        return result[0]
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('unique')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Wine already added to this fair',
          })
        }
        throw error
      }
    }),

  removeWine: protectedProcedure
    .input(
      z.object({
        fairId: z.string().uuid(),
        wineId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])

      if (profile.role === 'producer') {
        const wine = await ctx.db.query.wines.findFirst({
          where: eq(wines.id, input.wineId),
        })
        if (!wine) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Wine not found' })
        }
        const producer = await ctx.db.query.producers.findFirst({
          where: eq(producers.id, wine.producerId),
        })
        if (!producer || producer.userId !== ctx.user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Producers can only remove their own wines from a fair',
          })
        }
      }

      const result = await ctx.db
        .delete(fairWines)
        .where(and(eq(fairWines.fairId, input.fairId), eq(fairWines.wineId, input.wineId)))
        .returning()

      if (!result[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Wine not found in this fair' })
      }

      return result[0]
    }),

  addProducer: protectedProcedure
    .input(
      z.object({
        fairId: z.string().uuid(),
        producerId: z.string().uuid(),
        boothNumber: z.string().max(20).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      try {
        const result = await ctx.db
          .insert(fairProducers)
          .values({
            fairId: input.fairId,
            producerId: input.producerId,
            boothNumber: input.boothNumber,
          })
          .returning()

        return result[0]
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('unique')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Producer already added to this fair',
          })
        }
        throw error
      }
    }),

  removeProducer: protectedProcedure
    .input(
      z.object({
        fairId: z.string().uuid(),
        producerId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireRole(ctx.db, ctx.user.id, ['admin'])

      const result = await ctx.db
        .delete(fairProducers)
        .where(
          and(
            eq(fairProducers.fairId, input.fairId),
            eq(fairProducers.producerId, input.producerId),
          ),
        )
        .returning()

      if (!result[0]) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Producer not found in this fair' })
      }

      return result[0]
    }),
})
