import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '~/server/db/schema'

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
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `
  await sql`
    DO $$ BEGIN
      CREATE TYPE run_status AS ENUM ('pending', 'running', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `
  await sql`
    DO $$ BEGIN
      CREATE TYPE parse_status AS ENUM ('pending', 'success', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `
  await sql`
    DO $$ BEGIN
      CREATE TYPE match_status AS ENUM ('active', 'settled', 'archived');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `
  await sql`
    DO $$ BEGIN
      CREATE TYPE comment_target AS ENUM ('recommendation', 'match', 'tool');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `

  // Create tables in FK-dependency order

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

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_category" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(100) NOT NULL UNIQUE,
      "slug" varchar(100) NOT NULL UNIQUE,
      "description" text,
      "icon" varchar(50),
      "display_order" integer NOT NULL DEFAULT 0,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_tool" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL UNIQUE,
      "slug" varchar(255) NOT NULL UNIQUE,
      "description" text,
      "website" varchar(512),
      "logo_url" varchar(512),
      "is_verified" boolean NOT NULL DEFAULT false,
      "provider_user_id" uuid REFERENCES "preseason_user_profile"("id") ON DELETE SET NULL,
      "aliases" text[],
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_tool_category" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tool_id" uuid NOT NULL REFERENCES "preseason_tool"("id") ON DELETE CASCADE,
      "category_id" uuid NOT NULL REFERENCES "preseason_category"("id") ON DELETE CASCADE,
      "is_primary" boolean NOT NULL DEFAULT false
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_llm" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL,
      "slug" varchar(255) NOT NULL UNIQUE,
      "provider" varchar(100) NOT NULL,
      "model_id" varchar(255) NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_prompt" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "title" varchar(255) NOT NULL,
      "slug" varchar(255) NOT NULL UNIQUE,
      "content" text NOT NULL,
      "description" text,
      "expected_categories" text[],
      "is_active" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_run" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "started_at" timestamp with time zone,
      "completed_at" timestamp with time zone,
      "status" run_status NOT NULL DEFAULT 'pending',
      "trigger" varchar(50) NOT NULL DEFAULT 'cron',
      "prompt_count" integer,
      "llm_count" integer,
      "error_log" text,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_run_result" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "run_id" uuid NOT NULL REFERENCES "preseason_run"("id") ON DELETE CASCADE,
      "prompt_id" uuid NOT NULL REFERENCES "preseason_prompt"("id") ON DELETE CASCADE,
      "llm_id" uuid NOT NULL REFERENCES "preseason_llm"("id") ON DELETE CASCADE,
      "raw_response" text,
      "parse_status" parse_status NOT NULL DEFAULT 'pending',
      "eval_score" real,
      "eval_details" jsonb,
      "response_time_ms" integer,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_recommendation" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "run_result_id" uuid NOT NULL REFERENCES "preseason_run_result"("id") ON DELETE CASCADE,
      "tool_id" uuid NOT NULL REFERENCES "preseason_tool"("id") ON DELETE CASCADE,
      "category_id" uuid NOT NULL REFERENCES "preseason_category"("id") ON DELETE CASCADE,
      "confidence" real,
      "reasoning" text,
      "rank" integer,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_match" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tool_a_id" uuid NOT NULL REFERENCES "preseason_tool"("id") ON DELETE CASCADE,
      "tool_b_id" uuid NOT NULL REFERENCES "preseason_tool"("id") ON DELETE CASCADE,
      "category_id" uuid NOT NULL REFERENCES "preseason_category"("id") ON DELETE CASCADE,
      "status" match_status NOT NULL DEFAULT 'active',
      "started_at" timestamp with time zone,
      "settled_at" timestamp with time zone,
      "period_start" date,
      "period_end" date,
      "tool_a_score" integer NOT NULL DEFAULT 0,
      "tool_b_score" integer NOT NULL DEFAULT 0,
      "total_prompts" integer NOT NULL DEFAULT 0,
      "winner_tool_id" uuid REFERENCES "preseason_tool"("id") ON DELETE SET NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_critic_profile" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL UNIQUE REFERENCES "preseason_user_profile"("id") ON DELETE CASCADE,
      "title" varchar(255),
      "expertise_areas" text[],
      "excluded_categories" text[],
      "verified_at" timestamp with time zone,
      "verified_by" uuid REFERENCES "preseason_user_profile"("id") ON DELETE SET NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS "preseason_comment" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "critic_id" uuid NOT NULL REFERENCES "preseason_critic_profile"("id") ON DELETE CASCADE,
      "target_type" comment_target NOT NULL,
      "target_id" uuid NOT NULL,
      "content" text NOT NULL,
      "is_pinned" boolean NOT NULL DEFAULT false,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS "user_profile_email_idx" ON "preseason_user_profile" ("email")`
  await sql`CREATE INDEX IF NOT EXISTS "user_profile_role_idx" ON "preseason_user_profile" ("role")`
  await sql`CREATE INDEX IF NOT EXISTS "category_slug_idx" ON "preseason_category" ("slug")`
  await sql`CREATE INDEX IF NOT EXISTS "category_display_order_idx" ON "preseason_category" ("display_order")`
  await sql`CREATE INDEX IF NOT EXISTS "tool_slug_idx" ON "preseason_tool" ("slug")`
  await sql`CREATE INDEX IF NOT EXISTS "tool_provider_user_id_idx" ON "preseason_tool" ("provider_user_id")`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "tool_category_tool_category_idx" ON "preseason_tool_category" ("tool_id", "category_id")`
  await sql`CREATE INDEX IF NOT EXISTS "llm_slug_idx" ON "preseason_llm" ("slug")`
  await sql`CREATE INDEX IF NOT EXISTS "llm_is_active_idx" ON "preseason_llm" ("is_active")`
  await sql`CREATE INDEX IF NOT EXISTS "prompt_slug_idx" ON "preseason_prompt" ("slug")`
  await sql`CREATE INDEX IF NOT EXISTS "prompt_is_active_idx" ON "preseason_prompt" ("is_active")`
  await sql`CREATE INDEX IF NOT EXISTS "run_status_idx" ON "preseason_run" ("status")`
  await sql`CREATE INDEX IF NOT EXISTS "run_created_at_idx" ON "preseason_run" ("createdAt")`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "run_result_run_prompt_llm_idx" ON "preseason_run_result" ("run_id", "prompt_id", "llm_id")`
  await sql`CREATE INDEX IF NOT EXISTS "run_result_run_id_idx" ON "preseason_run_result" ("run_id")`
  await sql`CREATE INDEX IF NOT EXISTS "recommendation_tool_category_idx" ON "preseason_recommendation" ("tool_id", "category_id")`
  await sql`CREATE INDEX IF NOT EXISTS "recommendation_run_result_id_idx" ON "preseason_recommendation" ("run_result_id")`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS "match_tools_category_period_idx" ON "preseason_match" ("tool_a_id", "tool_b_id", "category_id", "period_start")`
  await sql`CREATE INDEX IF NOT EXISTS "match_status_idx" ON "preseason_match" ("status")`
  await sql`CREATE INDEX IF NOT EXISTS "match_category_id_idx" ON "preseason_match" ("category_id")`
  await sql`CREATE INDEX IF NOT EXISTS "critic_profile_user_id_idx" ON "preseason_critic_profile" ("user_id")`
  await sql`CREATE INDEX IF NOT EXISTS "comment_target_idx" ON "preseason_comment" ("target_type", "target_id")`
  await sql`CREATE INDEX IF NOT EXISTS "comment_critic_id_idx" ON "preseason_comment" ("critic_id")`

  return testDb
}

export async function cleanTestDatabase(): Promise<void> {
  const db = getTestDb()
  // Delete in reverse FK-dependency order
  await db.delete(schema.comments)
  await db.delete(schema.criticProfiles)
  await db.delete(schema.matches)
  await db.delete(schema.recommendations)
  await db.delete(schema.runResults)
  await db.delete(schema.runs)
  await db.delete(schema.toolCategories)
  await db.delete(schema.prompts)
  await db.delete(schema.llms)
  await db.delete(schema.tools)
  await db.delete(schema.categories)
  await db.delete(schema.userProfiles)
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
