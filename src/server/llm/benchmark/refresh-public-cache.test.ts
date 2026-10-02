import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findGroups: vi.fn(),
  invalidate: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn<(_: () => Promise<void>) => void>(),
  groupRanking: vi.fn(),
  categoryRanking: vi.fn(),
  categoryRankings: vi.fn(),
}))
const applicationDb = vi.hoisted(() => ({ query: { categories: { findMany: mocks.findGroups } } }))
vi.mock('~/server/db', () => ({ db: applicationDb }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('./public-cache', () => ({ invalidatePublicBenchmarkCache: mocks.invalidate }))
vi.mock('./scoring', () => ({
  computeCategoryGroupRanking: mocks.groupRanking,
  computeCategoryRanking: mocks.categoryRanking,
  computeCategoryRankings: mocks.categoryRankings,
}))

import { db } from '~/server/db'
import { refreshPublicBenchmarkCache } from './refresh-public-cache'

describe('publication cache refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    mocks.findGroups.mockResolvedValue([
      { id: 'group', slug: 'devtools', subcategories: [{ id: 'category', slug: 'auth' }] },
    ])
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('invalidates immediately and precomputes public rankings after the publication response', async () => {
    await refreshPublicBenchmarkCache(db)
    expect(mocks.invalidate).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.findGroups).not.toHaveBeenCalled()
    const callback = mocks.after.mock.calls[0]?.[0]
    if (!callback) throw new Error('Expected an after-response callback')
    await callback()
    expect(mocks.groupRanking).toHaveBeenCalledOnce()
    expect(mocks.categoryRanking).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ categoryId: 'category', windowType: 'season_to_date' }),
    )
    expect(mocks.categoryRankings).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ categoryIds: ['category'], windowType: 'season_to_date' }),
    )
  })

  it('keeps a committed publication successful when cache invalidation or warming fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.invalidate.mockImplementationOnce(() => {
      throw new Error('Cache unavailable')
    })
    await expect(refreshPublicBenchmarkCache(db)).resolves.toBeUndefined()
    expect(mocks.after).not.toHaveBeenCalled()
    await refreshPublicBenchmarkCache(db)
    mocks.findGroups.mockRejectedValueOnce(new Error('Read unavailable'))
    const callback = mocks.after.mock.calls[0]?.[0]
    if (!callback) throw new Error('Expected an after-response callback')
    await expect(callback()).resolves.toBeUndefined()
    expect(errorLog).toHaveBeenCalledTimes(2)
  })
})
