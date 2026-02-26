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
        firstName: z.string().min(1).max(100),
        lastName: z.string().min(1).max(100),
        birthDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db
        .insert(userProfiles)
        .values({
          id: input.id,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate,
          role: 'attendee',
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
        firstName: z.string().min(1, 'First name is required').max(100),
        lastName: z.string().min(1, 'Last name is required').max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(userProfiles)
        .set({
          firstName: input.firstName,
          lastName: input.lastName,
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
