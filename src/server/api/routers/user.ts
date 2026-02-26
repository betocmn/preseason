import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc'
import { userProfiles } from '~/server/db/schema'

export const userRouter = createTRPCRouter({
  createProfile: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        email: z.string().email(),
        displayName: z.string().min(1).max(150),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db
        .insert(userProfiles)
        .values({
          id: input.id,
          email: input.email,
          displayName: input.displayName,
          role: 'user',
        })
        .returning()

      return profile[0]
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, ctx.user.id))
      .limit(1)

    return profile[0] ?? null
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1, 'Display name is required').max(150),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(userProfiles)
        .set({
          displayName: input.displayName,
        })
        .where(eq(userProfiles.id, ctx.user.id))
        .returning()

      if (!updated[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Profile not found',
        })
      }

      return updated[0]
    }),
})
