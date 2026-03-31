import { describe, expect, it } from 'vitest'
import { buildPostgresClientOptions, usesSupabaseTransactionPooler } from './connection-options'

describe('usesSupabaseTransactionPooler', () => {
  it('detects Supabase transaction pooler URLs', () => {
    expect(
      usesSupabaseTransactionPooler(
        'postgresql://postgres:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
      ),
    ).toBe(true)
  })

  it('ignores direct Supabase database URLs', () => {
    expect(
      usesSupabaseTransactionPooler(
        'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      ),
    ).toBe(false)
  })

  it('returns false for invalid URLs', () => {
    expect(usesSupabaseTransactionPooler('not-a-url')).toBe(false)
  })
})

describe('buildPostgresClientOptions', () => {
  it('disables prepared statements for the Supabase transaction pooler', () => {
    expect(
      buildPostgresClientOptions(
        'postgresql://postgres:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
      ),
    ).toEqual({ prepare: false })
  })

  it('keeps default client options for other database URLs', () => {
    expect(
      buildPostgresClientOptions('postgresql://postgres:secret@localhost:5432/preseason'),
    ).toEqual({})
  })
})
