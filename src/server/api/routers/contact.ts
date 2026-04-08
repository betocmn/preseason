import { z } from 'zod'
import { createRateLimitedContactMessage } from '~/server/api/helpers/contact-rate-limit'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

export const contactRouter = createTRPCRouter({
  create: publicProcedure
    .input(
      z.object({
        email: z.string().email().max(255),
        message: z.string().min(1, 'Message is required').max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await createRateLimitedContactMessage(ctx.db, ctx.headers, input)
      return { success: true }
    }),
})
