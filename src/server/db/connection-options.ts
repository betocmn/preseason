import { serverSettings } from '~/constants/server-settings'

type PostgresClientOptions = {
  prepare?: boolean
}

export function usesSupabaseTransactionPooler(databaseUrl: string): boolean {
  try {
    const parsedUrl = new URL(databaseUrl)
    const { hostnameSuffix, port } = serverSettings.supabasePooler
    return parsedUrl.hostname.endsWith(hostnameSuffix) && parsedUrl.port === port
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
