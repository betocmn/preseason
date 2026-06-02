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
        avatarUrl: z.string().url().max(512).optional(),
        bio: z.string().max(5000).optional(),
        company: z.string().max(255).optional(),
        website: z
          .string()
          .url()
          .max(255)
          .regex(/^https?:\/\//, { message: 'Website must use http or https protocol' })
          .optional(),
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
          avatarUrl: input.avatarUrl,
          bio: input.bio,
          company: input.company,
          website: input.website,
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
      z
        .object({
          displayName: z.string().min(1).max(150).optional(),
          avatarUrl: z.string().url().max(512).nullable().optional(),
          bio: z.string().max(5000).nullable().optional(),
          company: z.string().max(255).nullable().optional(),
          website: z
            .string()
            .url()
            .max(255)
            .regex(/^https?:\/\//, { message: 'Website must use http or https protocol' })
            .nullable()
            .optional(),
        })
        .refine(
          (input) =>
            input.displayName !== undefined ||
            input.avatarUrl !== undefined ||
            input.bio !== undefined ||
            input.company !== undefined ||
            input.website !== undefined,
          {
            message: 'At least one field is required',
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(userProfiles)
        .set(input)
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
