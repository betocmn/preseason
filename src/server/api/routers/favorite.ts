import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { favorites, producers, regions, wines } from '~/server/db/schema'

export const favoriteRouter = createTRPCRouter({
  toggle: protectedProcedure
    .input(z.object({ wineId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.favorites.findFirst({
        where: and(eq(favorites.userId, ctx.user.id), eq(favorites.wineId, input.wineId)),
      })

      if (existing) {
        await ctx.db.delete(favorites).where(eq(favorites.id, existing.id))
        return { favorited: false }
      }

      await ctx.db.insert(favorites).values({
        userId: ctx.user.id,
        wineId: input.wineId,
      })

      return { favorited: true }
    }),

  getMyFavorites: protectedProcedure
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
            favorite: favorites,
            wineName: wines.name,
            wineType: wines.type,
            wineVintage: wines.vintage,
            wineImageUrl: wines.imageUrl,
            producerName: producers.name,
            regionName: regions.name,
          })
          .from(favorites)
          .innerJoin(wines, eq(favorites.wineId, wines.id))
          .leftJoin(producers, eq(wines.producerId, producers.id))
          .leftJoin(regions, eq(wines.regionId, regions.id))
          .where(eq(favorites.userId, ctx.user.id))
          .orderBy(desc(favorites.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        ctx.db.select({ count: count() }).from(favorites).where(eq(favorites.userId, ctx.user.id)),
      ])

      return { items, total: totalResult[0]?.count ?? 0 }
    }),

  isFavorited: protectedProcedure
    .input(z.object({ wineId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const existing = await ctx.db.query.favorites.findFirst({
        where: and(eq(favorites.userId, ctx.user.id), eq(favorites.wineId, input.wineId)),
      })

      return { favorited: !!existing }
    }),
})
