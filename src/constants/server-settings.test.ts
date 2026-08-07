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

  it('opens fresh benchmark runs at the configured UTC hour', () => {
    expect(serverSettings.benchmark.newRunStartUtcHour).toBe(12)
    expect(serverSettings.benchmark.newRunStartUtcHour).toBeGreaterThanOrEqual(0)
    expect(serverSettings.benchmark.newRunStartUtcHour).toBeLessThanOrEqual(23)
  })

  it('opens fresh benchmark runs on unique configured UTC month days', () => {
    expect(serverSettings.benchmark.newRunUtcMonthDays).toEqual([5, 15, 25])
    expect(new Set(serverSettings.benchmark.newRunUtcMonthDays).size).toBe(
      serverSettings.benchmark.newRunUtcMonthDays.length,
    )
    for (const monthDay of serverSettings.benchmark.newRunUtcMonthDays) {
      expect(monthDay).toBeGreaterThanOrEqual(1)
      expect(monthDay).toBeLessThanOrEqual(31)
    }
  })
})

describe('serverSettings.contact', () => {
  it('keeps the per-ip limit positive and small', () => {
    expect(serverSettings.contact.maxSubmissionsPerIp).toBeGreaterThan(0)
    expect(serverSettings.contact.maxSubmissionsPerIp).toBeLessThanOrEqual(5)
  })

  it('sets a positive throttling window', () => {
    expect(serverSettings.contact.rateLimitWindowMs).toBeGreaterThan(0)
  })

  it('defaults to a positive trusted proxy hop count', () => {
    expect(serverSettings.contact.forwardedForTrustedProxyHops).toBeGreaterThan(0)
    expect(serverSettings.contact.forwardedForTrustedProxyHops).toBeLessThanOrEqual(2)
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

  it('keeps per-request timeouts short enough for repairable evaluations', () => {
    expect(serverSettings.match.requestTimeoutMs).toBeGreaterThan(0)
    expect(serverSettings.match.requestTimeoutMs).toBeLessThan(
      serverSettings.openRouter.requestTimeoutMs,
    )
    expect(serverSettings.match.requestTimeoutMs).toBeLessThanOrEqual(2 * 60 * 1000)
  })

  it('configures a dedicated repair model for invalid match outputs', () => {
    expect(serverSettings.match.outputRepair.modelProvider).toBe('openai')
    expect(serverSettings.match.outputRepair.modelId).toContain('gpt-5.4-mini')
    expect(serverSettings.match.outputRepair.maxTokens).toBeGreaterThan(0)
  })

  it('excludes the known unreliable match models', () => {
    expect(serverSettings.match.excludedRequestedModelIds).toContain('google/gemini-2.5-pro')
    expect(serverSettings.match.excludedRequestedModelIds).toContain('moonshotai/kimi-k2.5')
  })
})

describe('serverSettings.openRouter', () => {
  it('bounds request retries tightly enough for serverless routes', () => {
    expect(serverSettings.openRouter.transportRetryAttempts).toBeGreaterThan(0)
    expect(serverSettings.openRouter.transportRetryAttempts).toBeLessThanOrEqual(2)
    expect(serverSettings.openRouter.requestTimeoutMs).toBeGreaterThan(0)
  })
})
