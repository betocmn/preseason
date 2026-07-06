import { describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import { getNextEligibleBenchmarkRunAt, isBenchmarkRunDue } from './benchmark'

describe('benchmark run cadence helpers', () => {
  it('computes the next eligible run time from the latest scheduled date', () => {
    expect(serverSettings.benchmark.newRunIntervalHours).toBe(3 * 24)
    expect(serverSettings.benchmark.newRunStartUtcHour).toBe(12)
    expect(serverSettings.benchmark.newRunUtcWeekdays).toEqual([1, 4])
    expect(getNextEligibleBenchmarkRunAt('2026-03-23').toISOString()).toBe(
      '2026-03-26T12:00:00.000Z',
    )
  })

  it('keeps the run closed just before the cadence boundary', () => {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt('2026-03-23')
    const justBeforeBoundary = new Date(nextEligibleAt.getTime() - 1)

    expect(isBenchmarkRunDue(justBeforeBoundary, '2026-03-23')).toBe(false)
  })

  it('keeps hourly cron ticks idle until the next twice-weekly start hour', () => {
    const latestScheduledFor = '2026-03-23'

    for (const elapsedHours of [1, 24, 72, 83]) {
      const tick = new Date('2026-03-23T00:00:00.000Z')
      tick.setUTCHours(tick.getUTCHours() + elapsedHours)

      expect(isBenchmarkRunDue(tick, latestScheduledFor)).toBe(false)
    }
  })

  it('opens the next run exactly at the cadence boundary', () => {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt('2026-03-23')

    expect(isBenchmarkRunDue(nextEligibleAt, '2026-03-23')).toBe(true)
  })

  it('waits for the next configured weekday when the shorter weekend cadence has elapsed', () => {
    expect(isBenchmarkRunDue(new Date('2026-03-29T12:00:00.000Z'), '2026-03-26')).toBe(false)
    expect(isBenchmarkRunDue(new Date('2026-03-30T12:00:00.000Z'), '2026-03-26')).toBe(true)
  })

  it('supports cadence overrides for future tuning', () => {
    const nextEligibleAt = getNextEligibleBenchmarkRunAt('2026-03-25', 72, 12, [0, 3])

    expect(nextEligibleAt.toISOString()).toBe('2026-03-29T12:00:00.000Z')
    expect(
      isBenchmarkRunDue(new Date('2026-03-29T11:59:59.999Z'), '2026-03-25', 72, 12, [0, 3]),
    ).toBe(false)
    expect(
      isBenchmarkRunDue(new Date('2026-03-29T12:00:00.000Z'), '2026-03-25', 72, 12, [0, 3]),
    ).toBe(true)
  })
})
