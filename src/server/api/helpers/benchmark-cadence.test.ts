import { describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import { getNextEligibleBenchmarkRunAt, isBenchmarkRunDue } from './benchmark'

describe('benchmark run cadence helpers', () => {
  it('computes the next eligible run time from the latest scheduled date', () => {
    expect(serverSettings.benchmark.newRunIntervalHours).toBe(14 * 24)
    expect(getNextEligibleBenchmarkRunAt('2026-03-25').toISOString()).toBe(
      '2026-04-08T00:00:00.000Z',
    )
  })

  it('keeps the run closed just before the cadence boundary', () => {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt('2026-03-25')
    const justBeforeBoundary = new Date(nextEligibleAt.getTime() - 1)

    expect(isBenchmarkRunDue(justBeforeBoundary, '2026-03-25')).toBe(false)
  })

  it('opens the next run exactly at the cadence boundary', () => {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt('2026-03-25')

    expect(isBenchmarkRunDue(nextEligibleAt, '2026-03-25')).toBe(true)
  })

  it('supports cadence overrides for future tuning', () => {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt('2026-03-25', 72)

    expect(nextEligibleAt.toISOString()).toBe('2026-03-28T00:00:00.000Z')
    expect(isBenchmarkRunDue(new Date('2026-03-27T23:59:59.999Z'), '2026-03-25', 72)).toBe(false)
    expect(isBenchmarkRunDue(new Date('2026-03-28T00:00:00.000Z'), '2026-03-25', 72)).toBe(true)
  })
})
