import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  secret: 'test-secret' as string | undefined,
  refresh: vi.fn(),
  db: {},
}))
vi.mock('~/env', () => ({
  env: {
    get CRON_SECRET() {
      return state.secret
    },
  },
}))
vi.mock('~/server/db', () => ({ db: state.db }))
vi.mock('~/server/llm/benchmark/refresh-public-cache', () => ({
  refreshPublicBenchmarkCache: state.refresh,
}))

import { getRangeRolloutManifest } from '~/server/llm/benchmark/rollout-manifest'
import { GET, POST } from './route'

describe('deployment rollout preflight', () => {
  beforeEach(() => {
    state.secret = 'test-secret'
    state.refresh.mockReset()
  })
  it('requires the existing secret for inspection and cache refresh', async () => {
    const request = new Request('https://preseason.ai/api/benchmark-rollout')
    expect((await GET(request)).status).toBe(401)
    expect((await POST(request)).status).toBe(401)
    expect(state.refresh).not.toHaveBeenCalled()
    state.secret = undefined
    expect((await GET(request)).status).toBe(401)
  })
  it('reports the deployed panel contract and refreshes public caches', async () => {
    const request = new Request('https://preseason.ai/api/benchmark-rollout', {
      headers: { authorization: 'Bearer test-secret' },
    })
    const manifest = getRangeRolloutManifest()
    expect(await (await GET(request)).json()).toEqual(manifest)
    expect(manifest.models).toHaveLength(20)
    expect(manifest.schedule).toEqual({ days: [5], hour: 12 })
    expect(await (await POST(request)).json()).toEqual({
      ok: true,
      fingerprint: manifest.fingerprint,
    })
    expect(state.refresh).toHaveBeenCalledWith(state.db)
  })
})
