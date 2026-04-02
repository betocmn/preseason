import { describe, expect, it } from 'vitest'
import { serverSettings } from './server-settings'

describe('serverSettings.benchmark', () => {
  it('keeps stale case claims behind the benchmark cron maxDuration', () => {
    expect(serverSettings.benchmark.caseClaimStaleAfterMs).toBeGreaterThan(
      serverSettings.benchmark.cronMaxDurationSeconds * 1000,
    )
  })

  it('sets a positive max case attempt limit', () => {
    expect(serverSettings.benchmark.maxCaseAttempts).toBeGreaterThanOrEqual(2)
  })
})

describe('serverSettings.match', () => {
  it('keeps the cron evaluation batch size small', () => {
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeGreaterThan(0)
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeLessThanOrEqual(4)
  })
})
