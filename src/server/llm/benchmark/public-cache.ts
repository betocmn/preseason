import { revalidateTag, unstable_cache } from 'next/cache'
import { serverSettings } from '~/constants/server-settings'
import { db } from '~/server/db'

// Share cold reads and background refreshes within a server instance. Resolved
// values live in Next's data cache; this map only holds work currently in flight.
const pendingReads = new Map<string, Promise<unknown>>()

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
  // Keep Next's source-based cache versioning even though the read is wrapped.
  const cacheKey = JSON.stringify([namespace, key, read.toString()])
  return unstable_cache(
    () => {
      const pending = pendingReads.get(cacheKey)
      if (pending) return pending as Promise<T>

      const result = Promise.resolve().then(read)
      pendingReads.set(cacheKey, result)
      const clear = () => {
        if (pendingReads.get(cacheKey) === result) pendingReads.delete(cacheKey)
      }
      void result.then(clear, clear)
      return result
    },
    [serverSettings.publicSite.benchmarkCacheTag, cacheKey],
    {
      revalidate: serverSettings.publicSite.benchmarkCacheRevalidateSeconds,
      tags: [serverSettings.publicSite.benchmarkCacheTag],
    },
  )()
}

export function invalidatePublicBenchmarkCache() {
  if (process.env.NODE_ENV === 'production') {
    pendingReads.clear()
    revalidateTag(serverSettings.publicSite.benchmarkCacheTag)
  }
}
