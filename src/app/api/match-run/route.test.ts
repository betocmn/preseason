import { beforeEach, describe, expect, it, vi } from 'vitest'

const claimMatchBatchExecutionMock = vi.hoisted(() => vi.fn())
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
  claimMatchBatchExecution: claimMatchBatchExecutionMock,
}))

vi.mock('~/server/llm/match/runner', () => ({
  runMatchBatch: runMatchBatchMock,
}))

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/match-run', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/match-run', () => {
  beforeEach(() => {
    claimMatchBatchExecutionMock.mockReset()
    runMatchBatchMock.mockReset()
  })

  it('returns 400 for non-UUID batchId input', async () => {
    const response = await POST(makeRequest({ batchId: 'not-a-uuid' }))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe('batchId must be a valid UUID')
    expect(claimMatchBatchExecutionMock).not.toHaveBeenCalled()
  })

  it('claims and runs when batchId is a valid UUID', async () => {
    const batchId = '11111111-1111-1111-1111-111111111111'
    claimMatchBatchExecutionMock.mockResolvedValue({
      batch: { id: batchId },
      claimToken: 'claim-token',
      execute: true,
    })
    runMatchBatchMock.mockResolvedValue({ batchId, processed: 1 })

    const response = await POST(makeRequest({ batchId }))
    const body = (await response.json()) as {
      ok: boolean
      summary: { batchId: string; processed: number }
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      summary: { batchId, processed: 1 },
    })
    expect(claimMatchBatchExecutionMock).toHaveBeenCalledOnce()
    expect(runMatchBatchMock).toHaveBeenCalledWith(batchId, 'claim-token', {
      database: expect.anything(),
      retryTerminalEvaluations: true,
    })
  })
})
