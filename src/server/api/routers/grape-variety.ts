import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { grapeVarieties } from '~/server/db/schema'

export const grapeVarietyRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).default(200),
          offset: z.number().int().min(0).default(0),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select()
        .from(grapeVarieties)
        .orderBy(grapeVarieties.name)
        .limit(input?.limit ?? 200)
        .offset(input?.offset ?? 0)
      return { items }
    }),
})
