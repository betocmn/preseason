import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureRuntimeEnv } from './rollout-ai-devtools'

const ORIGINAL_ENV = { ...process.env }

describe('configureRuntimeEnv', () => {
  afterEach(() => {
    vi.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  it('overrides inherited env before loading env-validated match helpers', async () => {
    process.env.DATABASE_URL = 'not-a-url'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'still-not-a-url'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''

    configureRuntimeEnv({
      databaseUrl: 'postgresql://user:pass@localhost:5432/preseason',
      execute: true,
    })

    vi.resetModules()

    await expect(import('~/server/llm/match/batches')).resolves.toHaveProperty('createMatchBatch')
    expect(process.env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/preseason')
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co')
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('placeholder-anon-key')
  })
})
