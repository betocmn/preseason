import { describe, expect, it } from 'vitest'
import { resolveFilteredQuery } from './ranking-query-state'

describe('resolveFilteredQuery', () => {
  it('returns initial data when filters are not enabled', () => {
    expect(
      resolveFilteredQuery({
        enabled: false,
        initialData: ['initial'],
        query: { data: undefined, status: 'pending' },
      }),
    ).toEqual({ state: 'ready', data: ['initial'] })
  })

  it('returns loading while a filtered query is pending', () => {
    expect(
      resolveFilteredQuery({
        enabled: true,
        query: { data: undefined, status: 'pending' },
      }),
    ).toEqual({ state: 'loading' })
  })

  it('returns an error state instead of falling back to initial data', () => {
    expect(
      resolveFilteredQuery({
        enabled: true,
        initialData: ['initial'],
        query: { data: undefined, status: 'error' },
      }),
    ).toEqual({ state: 'error' })
  })

  it('returns fetched filtered data when it is available', () => {
    expect(
      resolveFilteredQuery({
        enabled: true,
        initialData: ['initial'],
        query: { data: ['filtered'], status: 'success' },
      }),
    ).toEqual({ state: 'ready', data: ['filtered'] })
  })
})
