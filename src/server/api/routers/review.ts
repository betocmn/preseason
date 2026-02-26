import { TRPCError } from '@trpc/server'
import { avg, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getUserProfile } from '~/server/api/helpers/auth'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { producers, regions, reviews, userProfiles, wines } from '~/server/db/schema'

const ratingField = z.number().int().min(1).max(5)
const optionalRatingField = z.number().int().min(1).max(5).optional().nullable()

export const reviewRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        wineId: z.string().uuid(),
        rating: ratingField,
        notes: z.string().optional(),
        voiceNoteUrl: z.string().url().max(512).optional(),
        colorRating: ratingField.optional(),
        aromaRating: ratingField.optional(),
        acidityRating: ratingField.optional(),
        tanninsRating: ratingField.optional(),
        bodyRating: ratingField.optional(),
        flavorRating: ratingField.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getUserProfile(ctx.db, ctx.user.id)

      try {
        const result = await ctx.db
          .insert(reviews)
          .values({
            userId: ctx.user.id,
            wineId: input.wineId,
            rating: input.rating,
            notes: input.notes,
            voiceNoteUrl: input.voiceNoteUrl,
            colorRating: input.colorRating,
            aromaRating: input.aromaRating,
            acidityRating: input.acidityRating,
            tanninsRating: input.tanninsRating,
            bodyRating: input.bodyRating,
            flavorRating: input.flavorRating,
          })
          .returning()

        return result[0]
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes('unique')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'You have already reviewed this wine',
          })
        }
        throw error
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        rating: ratingField.optional(),
        notes: z.string().optional().nullable(),
        voiceNoteUrl: z.string().url().max(512).optional().nullable(),
        colorRating: optionalRatingField,
        aromaRating: optionalRatingField,
        acidityRating: optionalRatingField,
        tanninsRating: optionalRatingField,
        bodyRating: optionalRatingField,
        flavorRating: optionalRatingField,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.id, input.id),
      })

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' })
      }

      if (existing.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only update your own reviews',
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
        .update(reviews)
        .set(updateData)
        .where(eq(reviews.id, input.id))
        .returning()

      return result[0]
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.id, input.id),
      })

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' })
      }

      if (existing.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own reviews',
        })
      }

      const result = await ctx.db.delete(reviews).where(eq(reviews.id, input.id)).returning()

      return result[0]
    }),

  getByWine: publicProcedure
    .input(
      z.object({
        wineId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [items, totalResult] = await Promise.all([
        ctx.db
          .select({
            review: reviews,
            reviewerFirstName: userProfiles.firstName,
            reviewerLastName: userProfiles.lastName,
          })
          .from(reviews)
          .innerJoin(userProfiles, eq(reviews.userId, userProfiles.id))
          .where(eq(reviews.wineId, input.wineId))
          .orderBy(desc(reviews.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        ctx.db.select({ count: count() }).from(reviews).where(eq(reviews.wineId, input.wineId)),
      ])

      return { items, total: totalResult[0]?.count ?? 0 }
    }),

  getMyReviews: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [items, totalResult] = await Promise.all([
        ctx.db
          .select({
            review: reviews,
            wineName: wines.name,
            wineType: wines.type,
            wineImageUrl: wines.imageUrl,
            producerName: producers.name,
            regionName: regions.name,
          })
          .from(reviews)
          .innerJoin(wines, eq(reviews.wineId, wines.id))
          .leftJoin(producers, eq(wines.producerId, producers.id))
          .leftJoin(regions, eq(wines.regionId, regions.id))
          .where(eq(reviews.userId, ctx.user.id))
          .orderBy(desc(reviews.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        ctx.db.select({ count: count() }).from(reviews).where(eq(reviews.userId, ctx.user.id)),
      ])

      return { items, total: totalResult[0]?.count ?? 0 }
    }),

  getStats: publicProcedure
    .input(z.object({ wineId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select({
          averageRating: avg(reviews.rating),
          reviewCount: count(),
        })
        .from(reviews)
        .where(eq(reviews.wineId, input.wineId))

      return {
        averageRating: Number(result[0]?.averageRating ?? 0),
        reviewCount: result[0]?.reviewCount ?? 0,
      }
    }),

  getByIdWithDetails: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.id, input.id),
        with: {
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          wine: {
            with: {
              producer: true,
              region: true,
              wineGrapeVarieties: {
                with: { grapeVariety: true },
              },
            },
          },
        },
      })

      if (!review) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Review not found' })
      }

      return review
    }),
})
