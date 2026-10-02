import { revalidateTag, unstable_cache } from 'next/cache'
import { serverSettings } from '~/constants/server-settings'
import { db } from '~/server/db'

/** Cache only public scoring on the application connection, never test/transaction clients. */
export function cachedPublicScoring<T>(
  database: unknown,
  namespace: string,
  inputs: Record<string, unknown>,
  read: () => Promise<T>,
): Promise<T> {
  if (process.env.NODE_ENV !== 'production' || database !== db) return read()

  const key = JSON.stringify(
    Object.fromEntries(Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))),
  )
  return unstable_cache(read, [serverSettings.publicSite.benchmarkCacheTag, namespace, key], {
    revalidate: serverSettings.publicSite.benchmarkCacheRevalidateSeconds,
    tags: [serverSettings.publicSite.benchmarkCacheTag],
  })()
}

export function invalidatePublicBenchmarkCache() {
  if (process.env.NODE_ENV === 'production') {
    revalidateTag(serverSettings.publicSite.benchmarkCacheTag)
  }
}
