import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '~/server/db/schema'
import { userProfiles } from '~/server/db/schema'

type TestDatabase = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql }

let container: StartedPostgreSqlContainer | null = null
let sql: postgres.Sql | null = null
let testDb: TestDatabase | null = null

export async function setupTestDatabase(): Promise<TestDatabase> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start()

  const connectionString = container.getConnectionUri()
  sql = postgres(connectionString, { max: 1 })
  testDb = drizzle(sql, { schema })

  // Create enums
  await sql`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('admin', 'provider', 'critic', 'user');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `

  // Create user_profile table
  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_user_profile" (
      "id" uuid PRIMARY KEY NOT NULL,
      "email" varchar(255) NOT NULL UNIQUE,
      "display_name" varchar(150) NOT NULL,
      "avatar_url" varchar(512),
      "bio" text,
      "company" varchar(255),
      "website" varchar(255),
      "role" user_role NOT NULL DEFAULT 'user',
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "user_profile_email_idx" ON "preseason_user_profile" ("email")`
  await sql`CREATE INDEX IF NOT EXISTS "user_profile_role_idx" ON "preseason_user_profile" ("role")`

  return testDb
}

export async function cleanTestDatabase(): Promise<void> {
  const db = getTestDb()
  await db.delete(userProfiles)
}

export async function teardownTestDatabase(): Promise<void> {
  if (sql) {
    await sql.end()
    sql = null
  }
  if (container) {
    await container.stop()
    container = null
  }
  testDb = null
}

export function getTestDb(): TestDatabase {
  if (!testDb) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.')
  }
  return testDb
}
