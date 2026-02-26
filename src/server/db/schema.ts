import { index, pgEnum, pgTableCreator, text, uuid, varchar } from 'drizzle-orm/pg-core'

/**
 * Multi-project schema prefix for Preseason
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `preseason_${name}`)

// ============================================================================
// USER & AUTH TABLES
// ============================================================================

/**
 * User role enum
 */
export const userRoleEnum = pgEnum('user_role', ['admin', 'provider', 'critic', 'user'])

/**
 * User profiles table - extends Supabase auth.users
 *
 * Note: The `id` column references `auth.users.id` in Supabase.
 * Enforce FK at database level via migration or Supabase dashboard:
 * ALTER TABLE preseason_user_profile
 *   ADD CONSTRAINT fk_user_profile_auth_users
 *   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
 */
export const userProfiles = createTable(
  'user_profile',
  (d) => ({
    id: uuid().primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 150 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 512 }),
    bio: text('bio'),
    company: varchar({ length: 255 }),
    website: varchar({ length: 255 }),
    role: userRoleEnum().notNull().default('user'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('user_profile_email_idx').on(t.email), index('user_profile_role_idx').on(t.role)],
)
