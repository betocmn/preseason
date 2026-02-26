import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { regions } from '~/server/db/schema'

export const regionRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(100),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select()
        .from(regions)
        .orderBy(regions.name)
        .limit(input?.limit ?? 100)
        .offset(input?.offset ?? 0)
      return { items }
    }),
})
