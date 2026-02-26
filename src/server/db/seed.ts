/**
 * Database seed script for local development
 * Run with: pnpm db:seed
 *
 * Seeds admin users and user profiles.
 * All operations are idempotent (safe to run multiple times).
 */

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const conn = postgres(DATABASE_URL)
const db = drizzle(conn, { schema })

// ============================================================================
// SEED DATA
// ============================================================================

const ADMIN_USERS = [
  { email: 'beto@vinte.ai', displayName: 'Beto' },
  { email: 'elliott@vinte.ai', displayName: 'Elliott' },
]

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function createAuthUser(email: string): Promise<string | null> {
  const existing = await db.execute<{ id: string }>(sql`
    SELECT id FROM auth.users WHERE email = ${email}
  `)

  if (existing.length > 0) {
    console.log(`  Auth user ${email} already exists`)
    return existing[0]?.id ?? null
  }

  const newUsers = await db.execute<{ id: string }>(sql`
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud, confirmation_token, email_change,
      email_change_token_new, recovery_token, phone, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', ${email}, '',
      now(), now(), now(), '{"provider": "email", "providers": ["email"]}',
      '{}', false, 'authenticated', 'authenticated', '', '', '', '', NULL, '', '', '', ''
    )
    RETURNING id
  `)

  const userId = newUsers[0]?.id
  if (!userId) return null

  await db.execute(sql`
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      ${userId}::uuid, ${userId}::uuid, ${email}::varchar, 'email',
      jsonb_build_object('sub', ${userId}::text, 'email', ${email}::text, 'email_verified', true, 'provider', 'email'),
      now(), now(), now()
    )
  `)

  console.log(`  Created auth user ${email}`)
  return userId
}

async function seedAdminUsers() {
  console.log('Seeding admin users...')

  for (const seedUser of ADMIN_USERS) {
    const authId = await createAuthUser(seedUser.email)
    if (!authId) continue

    await db
      .insert(schema.userProfiles)
      .values({
        id: authId,
        email: seedUser.email,
        displayName: seedUser.displayName,
        role: 'admin',
      })
      .onConflictDoNothing()

    console.log(`  Profile for ${seedUser.email} ready`)
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function seed() {
  await seedAdminUsers()
  console.log('Seeding complete!')
}

seed()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await conn.end()
  })
