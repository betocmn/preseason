import postgres from 'postgres'
import { ensureDefaultMatchPromptTemplates } from '~/server/db/default-match-prompt-templates'
import { applyMigrationInvariants } from '~/server/db/migration-invariants'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured')
}

const sql = postgres(databaseUrl, { max: 1 })

try {
  await applyMigrationInvariants(sql)
  await ensureDefaultMatchPromptTemplates(sql)
} finally {
  await sql.end({ timeout: 5 })
}
