type PostgresClientOptions = {
  prepare?: boolean
}

export function usesSupabaseTransactionPooler(databaseUrl: string): boolean {
  try {
    const parsedUrl = new URL(databaseUrl)
    return parsedUrl.hostname.endsWith('.pooler.supabase.com') && parsedUrl.port === '6543'
  } catch {
    return false
  }
}

export function buildPostgresClientOptions(databaseUrl: string): PostgresClientOptions {
  if (usesSupabaseTransactionPooler(databaseUrl)) {
    // Supabase's transaction pooler does not support prepared statements.
    return { prepare: false }
  }

  return {}
}
