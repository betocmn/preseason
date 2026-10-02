import { describe, expect, it } from 'vitest'
import { canonicalModelRangeSearch, rankingFiltersFromSearchParams } from './model-filters'

describe('public range URLs', () => {
  it('canonicalizes legacy links while preserving other filters and category navigation', () => {
    const params = new URLSearchParams(
      'modelSnapshotId=old&dateRange=3m&promptLevel=beginner&modelTier=frontier&category=devtools&sub=auth',
    )
    const canonical = new URLSearchParams(canonicalModelRangeSearch(params, 'openai-coding'))
    expect(canonical.has('modelSnapshotId')).toBe(false)
    expect(canonical.get('sub')).toBe('auth')
    expect(rankingFiltersFromSearchParams(canonical)).toEqual({
      modelRangeId: 'openai-coding',
      modelSnapshotId: undefined,
      dateRange: '3m',
      promptLevel: 'beginner',
      modelTier: 'frontier',
    })
    expect(params.get('modelSnapshotId')).toBe('old')
  })
  it('retains conflicting and invalid selections for server validation', () => {
    expect(
      rankingFiltersFromSearchParams(
        new URLSearchParams('modelRangeId=bad&modelSnapshotId=not-a-uuid'),
      ),
    ).toMatchObject({ modelRangeId: 'bad', modelSnapshotId: 'not-a-uuid' })
  })
})
