import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc'
import { userProfiles } from '~/server/db/schema'

export const userRouter = createTRPCRouter({
  createProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(150),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User email is required',
        })
      }

      const profile = await ctx.db
        .insert(userProfiles)
        .values({
          id: ctx.user.id,
          email: ctx.user.email,
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
