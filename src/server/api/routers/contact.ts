import { contactMessageSchema } from '~/lib/contact-schema'
import { createRateLimitedContactMessage } from '~/server/api/helpers/contact-rate-limit'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'

export const contactRouter = createTRPCRouter({
  create: publicProcedure.input(contactMessageSchema).mutation(async ({ ctx, input }) => {
    await createRateLimitedContactMessage(ctx.db, ctx.headers, input)
    return { success: true }
  }),
})
