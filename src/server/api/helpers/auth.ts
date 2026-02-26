import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { userProfiles } from '~/server/db/schema'

type Database = PostgresJsDatabase<typeof schema>

export async function getUserProfile(db: Database, userId: string) {
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.id, userId),
  })
  if (!profile) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'User profile not found',
    })
  }
  return profile
}

export async function requireRole(
  db: Database,
  userId: string,
  allowedRoles: Array<'admin' | 'producer' | 'attendee'>,
) {
  const profile = await getUserProfile(db, userId)
  if (!allowedRoles.includes(profile.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    })
  }
  return profile
}
