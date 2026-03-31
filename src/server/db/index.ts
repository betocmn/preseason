import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '~/env'
import { buildPostgresClientOptions } from './connection-options'
import * as schema from './schema'

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined
}

const conn =
  globalForDb.conn ?? postgres(env.DATABASE_URL, buildPostgresClientOptions(env.DATABASE_URL))
if (env.NODE_ENV !== 'production') globalForDb.conn = conn

export const dbConnection = conn
export const db = drizzle(conn, { schema })
