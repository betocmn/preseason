import { join } from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql as drizzleSql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { ensureCanonicalToolReconciliation } from '~/server/db/catalog-reconciliation'
import { ensureDefaultMatchPromptTemplates } from '~/server/db/default-match-prompt-templates'
import { applyMigrationInvariants } from '~/server/db/migration-invariants'
import * as schema from '~/server/db/schema'

type TestDatabase = PostgresJsDatabase<typeof schema> & { $client: postgres.Sql }

let container: StartedPostgreSqlContainer | null = null
let databaseUrl: string | null = null
let sql: postgres.Sql | null = null
let testDb: TestDatabase | null = null

export async function setupTestDatabase(): Promise<TestDatabase> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start()

  databaseUrl = container.getConnectionUri()
  sql = postgres(databaseUrl, { max: 1 })
  testDb = drizzle(sql, { schema })

  await migrate(testDb, {
    migrationsFolder: join(import.meta.dirname, '../../drizzle'),
  })
  await applyMigrationInvariants(sql)
  await ensureDefaultMatchPromptTemplates(sql)
  await ensureCanonicalToolReconciliation(sql)

  return testDb
}

export async function cleanTestDatabase(): Promise<void> {
  const db = getTestDb()
  // Delete in reverse FK-dependency order
  await db.delete(schema.matchEvaluations).where(drizzleSql`true`)
  await db.delete(schema.matchBatches).where(drizzleSql`true`)
  await db.delete(schema.matchConfigs).where(drizzleSql`true`)
  await db.delete(schema.matchPromptTemplates).where(drizzleSql`true`)
  await db.delete(schema.benchmarkCaseDecisions).where(drizzleSql`true`)
  await db.delete(schema.benchmarkCaseResults).where(drizzleSql`true`)
  await db.delete(schema.benchmarkRuns).where(drizzleSql`true`)
  await db.delete(schema.benchmarkCases).where(drizzleSql`true`)
  await db.delete(schema.benchmarkSeasonModels).where(drizzleSql`true`)
  await db.delete(schema.benchmarkSeasonPrompts).where(drizzleSql`true`)
  await db.delete(schema.benchmarkPromptVersionCategories).where(drizzleSql`true`)
  await db.delete(schema.benchmarkPromptVersions).where(drizzleSql`true`)
  await db.delete(schema.benchmarkModelSnapshots).where(drizzleSql`true`)
  await db.delete(schema.benchmarkModelWeightConfigs).where(drizzleSql`true`)
  await db.delete(schema.benchmarkSeasons).where(drizzleSql`true`)
  await db.delete(schema.benchmarkProtocols).where(drizzleSql`true`)
  await db.delete(schema.toolCandidates).where(drizzleSql`true`)
  await db.delete(schema.toolAliases).where(drizzleSql`true`)
  await db.delete(schema.contactMessages).where(drizzleSql`true`)
  await db.delete(schema.comments).where(drizzleSql`true`)
  await db.delete(schema.criticProfiles).where(drizzleSql`true`)
  await db.delete(schema.toolCategories).where(drizzleSql`true`)
  await db.delete(schema.prompts).where(drizzleSql`true`)
  await db.delete(schema.llms).where(drizzleSql`true`)
  await db.delete(schema.tools).where(drizzleSql`true`)
  await db.delete(schema.subcategories).where(drizzleSql`true`)
  await db.delete(schema.categories).where(drizzleSql`true`)
  await db.delete(schema.userProfiles).where(drizzleSql`true`)
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
  databaseUrl = null
  testDb = null
}

export function getTestDb(): TestDatabase {
  if (!testDb) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.')
  }
  return testDb
}

export function createTestDatabaseClient(options: { max?: number } = {}): TestDatabase {
  if (!databaseUrl) {
    throw new Error('Test database not initialized. Call setupTestDatabase() first.')
  }

  const sqlClient = postgres(databaseUrl, { max: options.max ?? 1 })
  return drizzle(sqlClient, { schema }) as TestDatabase
}
