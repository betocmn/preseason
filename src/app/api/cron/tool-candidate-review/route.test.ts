import { beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(
  (): {
    CRON_SECRET: string | undefined
  } => ({
    CRON_SECRET: 'test-secret',
  }),
)
const dbMock = vi.hoisted(() => ({ __db: true }))
const reviewPendingToolCandidatesMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({
  env: envMock,
}))

vi.mock('~/server/db', () => ({
  db: dbMock,
}))

vi.mock('~/server/llm/benchmark/tool-candidate-reviewer', () => ({
  reviewPendingToolCandidates: reviewPendingToolCandidatesMock,
}))

import { GET } from './route'

function makeRequest(
  url = 'http://localhost/api/cron/tool-candidate-review',
  token = 'test-secret',
): Request {
  return new Request(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
}

describe('GET /api/cron/tool-candidate-review', () => {
  beforeEach(() => {
    reviewPendingToolCandidatesMock.mockReset()
    envMock.CRON_SECRET = 'test-secret'
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    envMock.CRON_SECRET = undefined

    const response = await GET(makeRequest())
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body.error).toBe('CRON_SECRET is not configured')
    expect(reviewPendingToolCandidatesMock).not.toHaveBeenCalled()
  })

  it('returns 401 when authorization token is invalid', async () => {
    const response = await GET(makeRequest(undefined, 'wrong-secret'))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
    expect(reviewPendingToolCandidatesMock).not.toHaveBeenCalled()
  })

  it('returns the review summary when the cron succeeds', async () => {
    reviewPendingToolCandidatesMock.mockResolvedValue({
      reviewedCount: 4,
      suggestedCount: 2,
      noMatchCount: 1,
      errorCount: 1,
    })

    const response = await GET(makeRequest())
    const body = (await response.json()) as {
      ok: boolean
      summary: {
        reviewedCount: number
        suggestedCount: number
        noMatchCount: number
        errorCount: number
      }
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary.reviewedCount).toBe(4)
    expect(reviewPendingToolCandidatesMock).toHaveBeenCalledWith({ database: dbMock })
  })
})
