import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverSettings } from '~/constants/server-settings'

const applicationDb = vi.hoisted(() => ({}))
const cache = vi.hoisted(() => new Map<string, unknown>())
const revalidateTagMock = vi.hoisted(() => vi.fn(() => cache.clear()))
const unstableCacheMock = vi.hoisted(() =>
  vi.fn((read: () => Promise<unknown>, keys: string[]) => async () => {
    const key = keys.join(':')
    if (!cache.has(key)) cache.set(key, await read())
    return cache.get(key)
  }),
)
vi.mock('~/server/db', () => ({ db: applicationDb }))
vi.mock('next/cache', () => ({
  unstable_cache: unstableCacheMock,
  revalidateTag: revalidateTagMock,
}))

import { cachedPublicScoring, invalidatePublicBenchmarkCache } from './public-cache'

describe('public scoring cache', () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('reuses equivalent filters and refreshes published data after invalidation', async () => {
    const read = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 2 })
    const first = await cachedPublicScoring(
      applicationDb,
      'ranking',
      { category: 'auth', tier: 'small' },
      read,
    )
    expect(
      await cachedPublicScoring(
        applicationDb,
        'ranking',
        { tier: 'small', category: 'auth' },
        read,
      ),
    ).toEqual(first)
    expect(read).toHaveBeenCalledTimes(1)
    invalidatePublicBenchmarkCache()
    expect(revalidateTagMock).toHaveBeenCalledWith(serverSettings.publicSite.benchmarkCacheTag)
    expect(
      await cachedPublicScoring(
        applicationDb,
        'ranking',
        { category: 'auth', tier: 'small' },
        read,
      ),
    ).toEqual({ count: 2 })
    expect(unstableCacheMock).toHaveBeenLastCalledWith(expect.any(Function), expect.any(Array), {
      revalidate: serverSettings.publicSite.benchmarkCacheRevalidateSeconds,
      tags: [serverSettings.publicSite.benchmarkCacheTag],
    })
  })

  it('shares concurrent cold reads and retries after a failed refresh', async () => {
    let release: (value: number) => void = () => {}
    const result = new Promise<number>((resolve) => {
      release = resolve
    })
    const read = vi.fn(() => result)
    const first = cachedPublicScoring(applicationDb, 'ranking', { category: 'auth' }, read)
    const second = cachedPublicScoring(applicationDb, 'ranking', { category: 'auth' }, read)
    await Promise.resolve()
    expect(read).toHaveBeenCalledOnce()
    release(42)
    expect(await Promise.all([first, second])).toEqual([42, 42])

    invalidatePublicBenchmarkCache()
    const refresh = vi.fn().mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(
      cachedPublicScoring(applicationDb, 'ranking', { category: 'auth' }, refresh),
    ).rejects.toThrow('Database unavailable')
    refresh.mockResolvedValueOnce(43)
    expect(await cachedPublicScoring(applicationDb, 'ranking', { category: 'auth' }, refresh)).toBe(
      43,
    )
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('isolates categories, filters and calculation types', async () => {
    const read = vi.fn().mockResolvedValue({ count: 1 })
    await cachedPublicScoring(applicationDb, 'ranking', { category: 'auth', tier: 'small' }, read)
    await cachedPublicScoring(
      applicationDb,
      'ranking',
      { category: 'database', tier: 'small' },
      read,
    )
    await cachedPublicScoring(
      applicationDb,
      'ranking',
      { category: 'auth', tier: 'frontier' },
      read,
    )
    await cachedPublicScoring(
      applicationDb,
      'head-to-head',
      { category: 'auth', tier: 'small' },
      read,
    )
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('does not reuse summaries from an older calculation after the code changes', async () => {
    const inputs = { category: 'auth' }
    expect(await cachedPublicScoring(applicationDb, 'ranking', inputs, async () => 1)).toBe(1)
    expect(await cachedPublicScoring(applicationDb, 'ranking', inputs, async () => 2)).toBe(2)
  })

  it('isolates range selections and refreshes measured labels on publication', async () => {
    const read = vi.fn().mockResolvedValue('Opus')
    await cachedPublicScoring(
      applicationDb,
      'ranking',
      { modelRangeId: 'anthropic-opus', modelSnapshotIds: ['old'] },
      read,
    )
    await cachedPublicScoring(
      applicationDb,
      'ranking',
      { modelRangeId: 'anthropic-sonnet', modelSnapshotIds: ['other'] },
      read,
    )
    await cachedPublicScoring(applicationDb, 'measured-model-ranges', {}, read)
    expect(read).toHaveBeenCalledTimes(3)
    invalidatePublicBenchmarkCache()
    read.mockResolvedValue('Opus 4.6–5.5')
    expect(await cachedPublicScoring(applicationDb, 'measured-model-ranges', {}, read)).toBe(
      'Opus 4.6–5.5',
    )
  })

  it('does not cache transaction clients or local development reads', async () => {
    const read = vi.fn().mockResolvedValue({ count: 1 })
    await cachedPublicScoring({}, 'ranking', {}, read)
    vi.stubEnv('NODE_ENV', 'development')
    await cachedPublicScoring(applicationDb, 'ranking', {}, read)
    expect(read).toHaveBeenCalledTimes(2)
    expect(unstableCacheMock).not.toHaveBeenCalled()
  })
})
