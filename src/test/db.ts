import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '~/server/db/schema'
import {
  fairProducers,
  fairs,
  fairWines,
  favorites,
  grapeVarieties,
  producers,
  regions,
  reviews,
  userProfiles,
  wineGrapeVarieties,
  wines,
} from '~/server/db/schema'

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
      CREATE TYPE user_role AS ENUM ('admin', 'producer', 'attendee');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `

  // Create user_profile table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_user_profile" (
      "id" uuid PRIMARY KEY NOT NULL,
      "email" varchar(255) NOT NULL UNIQUE,
      "first_name" varchar(100) NOT NULL,
      "last_name" varchar(100) NOT NULL,
      "birth_date" date NOT NULL,
      "role" user_role NOT NULL DEFAULT 'attendee',
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "user_profile_email_idx" ON "wine_fair_user_profile" ("email")`
  await sql`CREATE INDEX IF NOT EXISTS "user_profile_role_idx" ON "wine_fair_user_profile" ("role")`

  // Create wine_type enum
  await sql`
    DO $$ BEGIN
      CREATE TYPE wine_type AS ENUM ('white', 'red', 'rose', 'orange', 'sparkling', 'dessert');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `

  // Create region table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_region" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL UNIQUE,
      "country" varchar(255),
      "description" text,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "region_name_idx" ON "wine_fair_region" ("name")`

  // Create grape_variety table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_grape_variety" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL UNIQUE,
      "description" text,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "grape_variety_name_idx" ON "wine_fair_grape_variety" ("name")`

  // Create producer table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_producer" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL,
      "region_id" uuid REFERENCES "wine_fair_region"("id") ON DELETE SET NULL,
      "description" text,
      "website" varchar(255),
      "image_url" varchar(512),
      "user_id" uuid REFERENCES "wine_fair_user_profile"("id") ON DELETE SET NULL,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "producer_name_idx" ON "wine_fair_producer" ("name")`
  await sql`CREATE INDEX IF NOT EXISTS "producer_user_id_idx" ON "wine_fair_producer" ("user_id")`
  await sql`CREATE INDEX IF NOT EXISTS "producer_region_id_idx" ON "wine_fair_producer" ("region_id")`

  // Create wine table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_wine" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL,
      "vintage" integer,
      "type" wine_type NOT NULL,
      "alcohol_percent" real,
      "region_id" uuid REFERENCES "wine_fair_region"("id") ON DELETE SET NULL,
      "description" text,
      "one_liner" varchar(280),
      "image_url" varchar(512),
      "producer_id" uuid NOT NULL REFERENCES "wine_fair_producer"("id") ON DELETE CASCADE,
      "parent_wine_id" uuid REFERENCES "wine_fair_wine"("id") ON DELETE SET NULL,
      "price" numeric(8, 2),
      "fermentation_container" varchar(100),
      "oak_aging" varchar(100),
      "lees_contact" varchar(100),
      "sediment_contact" varchar(100),
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "wine_producer_id_idx" ON "wine_fair_wine" ("producer_id")`
  await sql`CREATE INDEX IF NOT EXISTS "wine_type_idx" ON "wine_fair_wine" ("type")`
  await sql`CREATE INDEX IF NOT EXISTS "wine_region_id_idx" ON "wine_fair_wine" ("region_id")`
  await sql`CREATE INDEX IF NOT EXISTS "wine_name_vintage_idx" ON "wine_fair_wine" ("name", "vintage")`
  await sql`CREATE INDEX IF NOT EXISTS "wine_parent_wine_id_idx" ON "wine_fair_wine" ("parent_wine_id")`

  // Create wine_grape_variety junction table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_wine_grape_variety" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "wine_id" uuid NOT NULL REFERENCES "wine_fair_wine"("id") ON DELETE CASCADE,
      "grape_variety_id" uuid NOT NULL REFERENCES "wine_fair_grape_variety"("id") ON DELETE CASCADE,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "wine_grape_variety_wine_id_grape_variety_id_unique" UNIQUE("wine_id", "grape_variety_id")
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "wine_grape_variety_wine_id_idx" ON "wine_fair_wine_grape_variety" ("wine_id")`
  await sql`CREATE INDEX IF NOT EXISTS "wine_grape_variety_grape_variety_id_idx" ON "wine_fair_wine_grape_variety" ("grape_variety_id")`

  // Create fair table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_fair" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" varchar(255) NOT NULL,
      "description" text,
      "location" varchar(255),
      "start_date" date NOT NULL,
      "end_date" date NOT NULL,
      "is_active" boolean NOT NULL DEFAULT false,
      "image_url" varchar(512),
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "fair_name_idx" ON "wine_fair_fair" ("name")`
  await sql`CREATE INDEX IF NOT EXISTS "fair_is_active_idx" ON "wine_fair_fair" ("is_active")`
  await sql`CREATE INDEX IF NOT EXISTS "fair_start_date_idx" ON "wine_fair_fair" ("start_date")`

  // Create fair_producer junction table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_fair_producer" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "fair_id" uuid NOT NULL REFERENCES "wine_fair_fair"("id") ON DELETE CASCADE,
      "producer_id" uuid NOT NULL REFERENCES "wine_fair_producer"("id") ON DELETE CASCADE,
      "booth_number" varchar(20),
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "fair_producer_fair_id_producer_id_unique" UNIQUE("fair_id", "producer_id")
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "fair_producer_fair_id_idx" ON "wine_fair_fair_producer" ("fair_id")`
  await sql`CREATE INDEX IF NOT EXISTS "fair_producer_producer_id_idx" ON "wine_fair_fair_producer" ("producer_id")`

  // Create fair_wine junction table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_fair_wine" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "fair_id" uuid NOT NULL REFERENCES "wine_fair_fair"("id") ON DELETE CASCADE,
      "wine_id" uuid NOT NULL REFERENCES "wine_fair_wine"("id") ON DELETE CASCADE,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "fair_wine_fair_id_wine_id_unique" UNIQUE("fair_id", "wine_id")
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "fair_wine_fair_id_idx" ON "wine_fair_fair_wine" ("fair_id")`
  await sql`CREATE INDEX IF NOT EXISTS "fair_wine_wine_id_idx" ON "wine_fair_fair_wine" ("wine_id")`

  // Create review table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_review" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "wine_fair_user_profile"("id") ON DELETE CASCADE,
      "wine_id" uuid NOT NULL REFERENCES "wine_fair_wine"("id") ON DELETE CASCADE,
      "rating" integer NOT NULL,
      "notes" text,
      "voice_note_url" varchar(512),
      "color_rating" integer,
      "aroma_rating" integer,
      "acidity_rating" integer,
      "tannins_rating" integer,
      "body_rating" integer,
      "flavor_rating" integer,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      "updatedAt" timestamp with time zone,
      CONSTRAINT "review_user_id_wine_id_unique" UNIQUE("user_id", "wine_id")
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "review_user_id_idx" ON "wine_fair_review" ("user_id")`
  await sql`CREATE INDEX IF NOT EXISTS "review_wine_id_idx" ON "wine_fair_review" ("wine_id")`
  await sql`CREATE INDEX IF NOT EXISTS "review_rating_idx" ON "wine_fair_review" ("rating")`

  // Create favorite table
  await sql`
    CREATE TABLE IF NOT EXISTS "wine_fair_favorite" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "wine_fair_user_profile"("id") ON DELETE CASCADE,
      "wine_id" uuid NOT NULL REFERENCES "wine_fair_wine"("id") ON DELETE CASCADE,
      "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "favorite_user_id_wine_id_unique" UNIQUE("user_id", "wine_id")
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS "favorite_user_id_idx" ON "wine_fair_favorite" ("user_id")`
  await sql`CREATE INDEX IF NOT EXISTS "favorite_wine_id_idx" ON "wine_fair_favorite" ("wine_id")`

  return testDb
}

export async function cleanTestDatabase(): Promise<void> {
  const db = getTestDb()
  await db.delete(favorites)
  await db.delete(reviews)
  await db.delete(fairWines)
  await db.delete(fairProducers)
  await db.delete(wineGrapeVarieties)
  await db.delete(wines)
  await db.delete(producers)
  await db.delete(fairs)
  await db.delete(grapeVarieties)
  await db.delete(regions)
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
