import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
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

  await migrate(testDb, {
    migrationsFolder: join(import.meta.dirname, '../../drizzle'),
  })

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
  await db.delete(schema.subcategories)
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
