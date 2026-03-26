import { beforeEach, describe, expect, it, vi } from 'vitest'

const claimNextMatchBatchExecutionMock = vi.hoisted(() => vi.fn())
const runMatchBatchMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({
  env: {
    CRON_SECRET: 'test-secret',
  },
}))

vi.mock('~/server/db', () => ({
  db: {},
}))

vi.mock('~/server/llm/match/batches', () => ({
  claimNextMatchBatchExecution: claimNextMatchBatchExecutionMock,
}))

vi.mock('~/server/llm/match/runner', () => ({
  runMatchBatch: runMatchBatchMock,
}))

import { GET } from './route'

function makeRequest(url = 'http://localhost/api/cron/match-run'): Request {
  return new Request(url, {
    headers: {
      authorization: 'Bearer test-secret',
    },
  })
}

describe('GET /api/cron/match-run', () => {
  beforeEach(() => {
    claimNextMatchBatchExecutionMock.mockReset()
    runMatchBatchMock.mockReset()
  })

  it('returns 400 for non-UUID seasonId input', async () => {
    const response = await GET(makeRequest('http://localhost/api/cron/match-run?seasonId=nope'))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe('seasonId must be a valid UUID')
    expect(claimNextMatchBatchExecutionMock).not.toHaveBeenCalled()
  })

  it('returns an idle response when there is no dispatchable batch', async () => {
    claimNextMatchBatchExecutionMock.mockResolvedValue({
      batch: null,
      claimToken: null,
      execute: false,
    })

    const response = await GET(makeRequest())
    const body = (await response.json()) as { ok: boolean; message: string }

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, message: 'No dispatchable match batch' })
    expect(runMatchBatchMock).not.toHaveBeenCalled()
  })

  it('claims and runs the next dispatchable batch', async () => {
    const batchId = '11111111-1111-1111-1111-111111111111'
    claimNextMatchBatchExecutionMock.mockResolvedValue({
      batch: { id: batchId },
      claimToken: 'claim-token',
      execute: true,
    })
    runMatchBatchMock.mockResolvedValue({ batchId, processed: 1 })

    const response = await GET(
      makeRequest(`http://localhost/api/cron/match-run?seasonId=${batchId}`),
    )
    const body = (await response.json()) as {
      ok: boolean
      summary: { batchId: string; processed: number }
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      summary: { batchId, processed: 1 },
    })
    expect(claimNextMatchBatchExecutionMock).toHaveBeenCalledWith(expect.anything(), {
      seasonId: batchId,
    })
    expect(runMatchBatchMock).toHaveBeenCalledWith(batchId, 'claim-token', expect.any(Object))
  })
})
