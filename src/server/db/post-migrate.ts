import postgres from 'postgres'
import { applyMigrationInvariants } from '~/server/db/migration-invariants'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured')
}

const sql = postgres(databaseUrl, { max: 1 })

try {
  await applyMigrationInvariants(sql)
} finally {
  await sql.end({ timeout: 5 })
}
