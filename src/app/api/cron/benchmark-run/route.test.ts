import { beforeEach, describe, expect, it, vi } from 'vitest'

const envMock = vi.hoisted(
  (): {
    CRON_SECRET: string | undefined
  } => ({
    CRON_SECRET: 'test-secret',
  }),
)
const serverSettingsMock = vi.hoisted(() => ({
  benchmark: { cronMaxDurationSeconds: 800, casesPerCronInvocation: 1 },
}))
const dbMock = vi.hoisted(() => ({ __db: true }))
const resolveBenchmarkCronRunTargetMock = vi.hoisted(() => vi.fn())
const runBenchmarkMock = vi.hoisted(() => vi.fn())

vi.mock('~/env', () => ({
  env: envMock,
}))

vi.mock('~/server/db', () => ({
  db: dbMock,
}))

vi.mock('~/constants/server-settings', () => ({
  serverSettings: serverSettingsMock,
}))

vi.mock('~/server/api/helpers/benchmark', () => ({
  resolveBenchmarkCronRunTarget: resolveBenchmarkCronRunTargetMock,
}))

vi.mock('~/server/llm/benchmark/runner', () => ({
  runBenchmark: runBenchmarkMock,
}))

import { GET, maxDuration } from './route'

function makeRequest(
  url = 'http://localhost/api/cron/benchmark-run',
  token = 'test-secret',
): Request {
  return new Request(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
}

describe('GET /api/cron/benchmark-run', () => {
  beforeEach(() => {
    resolveBenchmarkCronRunTargetMock.mockReset()
    runBenchmarkMock.mockReset()
    envMock.CRON_SECRET = 'test-secret'
    serverSettingsMock.benchmark.casesPerCronInvocation = 1
  })

  it('exports the expected maxDuration for one-case benchmark workers', () => {
    expect(maxDuration).toBe(800)
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    envMock.CRON_SECRET = undefined

    const response = await GET(makeRequest())
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(500)
    expect(body.error).toBe('CRON_SECRET is not configured')
    expect(resolveBenchmarkCronRunTargetMock).not.toHaveBeenCalled()
  })

  it('returns 401 when authorization token is invalid', async () => {
    const response = await GET(
      makeRequest('http://localhost/api/cron/benchmark-run', 'wrong-secret'),
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
    expect(resolveBenchmarkCronRunTargetMock).not.toHaveBeenCalled()
  })

  it('returns an idle response when no active benchmark season exists', async () => {
    resolveBenchmarkCronRunTargetMock.mockResolvedValue({
      kind: 'idle',
      reason: 'no_active_season',
    })

    const response = await GET(makeRequest())
    const body = (await response.json()) as { ok: boolean; message: string }

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true, message: 'No active benchmark season' })
    expect(runBenchmarkMock).not.toHaveBeenCalled()
  })

  it('resumes an unfinished run and passes maxCases to the runner', async () => {
    resolveBenchmarkCronRunTargetMock.mockResolvedValue({
      kind: 'run',
      seasonId: 'season-1',
      scheduledFor: '2026-03-25',
      source: 'unfinished',
      runId: 'run-1',
    })
    serverSettingsMock.benchmark.casesPerCronInvocation = 6
    runBenchmarkMock.mockResolvedValue({
      runId: 'run-1',
      seasonId: 'season-1',
      scheduledFor: '2026-03-25',
      status: 'running',
      totalCases: 15,
      completedCases: 6,
      failedCases: 0,
      invalidOutputCases: 0,
      unresolvedToolCount: 0,
      processedThisInvocation: 6,
      remainingCases: 9,
      hasRemainingWork: true,
      qc: { passed: false, checks: [] },
      errors: [],
    })

    const response = await GET(makeRequest())
    const body = (await response.json()) as {
      ok: boolean
      summary: { hasRemainingWork: boolean; scheduledFor: string }
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary.hasRemainingWork).toBe(true)
    expect(body.summary.scheduledFor).toBe('2026-03-25')
    expect(resolveBenchmarkCronRunTargetMock).toHaveBeenCalledWith(dbMock)
    expect(runBenchmarkMock).toHaveBeenCalledWith('season-1', '2026-03-25', {
      database: dbMock,
      maxCases: 6,
    })
  })

  it('returns a published summary when a run auto-publishes after QC passes', async () => {
    resolveBenchmarkCronRunTargetMock.mockResolvedValue({
      kind: 'run',
      seasonId: 'season-1',
      scheduledFor: '2026-03-26',
      source: 'today',
    })
    runBenchmarkMock.mockResolvedValue({
      runId: 'run-2',
      seasonId: 'season-1',
      scheduledFor: '2026-03-26',
      status: 'published',
      totalCases: 15,
      completedCases: 15,
      failedCases: 0,
      invalidOutputCases: 0,
      unresolvedToolCount: 0,
      processedThisInvocation: 15,
      remainingCases: 0,
      hasRemainingWork: false,
      qc: { passed: true, checks: [] },
      errors: [],
    })

    const response = await GET(makeRequest())
    const body = (await response.json()) as {
      ok: boolean
      summary: { status: string; hasRemainingWork: boolean; scheduledFor: string }
    }

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.summary.status).toBe('published')
    expect(body.summary.hasRemainingWork).toBe(false)
    expect(body.summary.scheduledFor).toBe('2026-03-26')
  })

  it('returns an idle response when the next run window has not opened yet', async () => {
    resolveBenchmarkCronRunTargetMock.mockResolvedValue({
      kind: 'idle',
      reason: 'waiting_for_next_run_window',
      seasonId: 'season-1',
      latestScheduledFor: '2026-03-26',
      nextEligibleAt: '2026-03-28T00:00:00.000Z',
    })

    const response = await GET(makeRequest())
    const body = (await response.json()) as {
      ok: boolean
      message: string
      seasonId: string
      latestScheduledFor: string
      nextEligibleAt: string
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      message: 'No benchmark run due yet',
      seasonId: 'season-1',
      latestScheduledFor: '2026-03-26',
      nextEligibleAt: '2026-03-28T00:00:00.000Z',
    })
    expect(runBenchmarkMock).not.toHaveBeenCalled()
  })
})
