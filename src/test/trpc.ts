import type { User } from '@supabase/supabase-js'
import { createCaller } from '~/server/api/root'
import { userProfiles, type userRoleEnum } from '~/server/db/schema'
import { getTestDb } from './db'

type UserRole = (typeof userRoleEnum.enumValues)[number]

type SeedUserOptions = {
  id?: string
  email?: string
  displayName?: string
  role?: UserRole
}

export function createAuthUser(id: string, email: string): User {
  return {
    id,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as unknown as User
}

export async function seedUser(options: SeedUserOptions = {}) {
  const id = options.id ?? crypto.randomUUID()
  const role = options.role ?? 'user'
  const email = options.email ?? `${role}-${id.slice(0, 8)}@example.com`
  const displayName = options.displayName ?? `${role} user`

  const db = getTestDb()
  const inserted = await db
    .insert(userProfiles)
    .values({
      id,
      email,
      displayName,
      role,
    })
    .returning()

  const profile = inserted[0]
  if (!profile) {
    throw new Error('Failed to seed user profile')
  }

  return {
    profile,
    authUser: createAuthUser(id, email),
  }
}

export function createTestCaller(user: User | null) {
  return createCaller({
    db: getTestDb(),
    user,
    headers: new Headers(),
  })
}
