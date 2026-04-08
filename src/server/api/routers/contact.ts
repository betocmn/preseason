import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { contactMessages } from '~/server/db/schema'

export const contactRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(255),
        message: z.string().min(1, 'Message is required').max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.insert(contactMessages).values({
        email: input.email,
        message: input.message,
      })
      return { success: true }
    }),
})
