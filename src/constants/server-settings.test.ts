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

  it('keeps a cleanup buffer before the route max duration', () => {
    expect(serverSettings.match.cronInvocationSafetyBufferMs).toBeGreaterThan(0)
    expect(serverSettings.match.cronInvocationSafetyBufferMs).toBeLessThan(800 * 1000)
  })

  it('configures a dedicated repair model for invalid match outputs', () => {
    expect(serverSettings.match.outputRepair.modelProvider).toBe('openai')
    expect(serverSettings.match.outputRepair.modelId).toContain('gpt-5.4-mini')
    expect(serverSettings.match.outputRepair.maxTokens).toBeGreaterThan(0)
  })
})

describe('serverSettings.openRouter', () => {
  it('bounds request retries tightly enough for serverless routes', () => {
    expect(serverSettings.openRouter.transportRetryAttempts).toBeGreaterThan(0)
    expect(serverSettings.openRouter.transportRetryAttempts).toBeLessThanOrEqual(2)
    expect(serverSettings.openRouter.requestTimeoutMs).toBeGreaterThan(0)
  })
})
