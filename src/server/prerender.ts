import 'server-only'

import { connection } from 'next/server'

export function hasBuildDatabaseAccess() {
  return typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.length > 0
}

export async function deferToRequestWhenDatabaseUnavailable() {
  if (!hasBuildDatabaseAccess()) {
    await connection()
  }
}
