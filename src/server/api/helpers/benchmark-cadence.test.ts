import { describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import { getBenchmarkRunWindowAtOrAfter } from './benchmark'

describe('benchmark run cadence helpers', () => {
  it('uses the configured UTC month days and start hour', () => {
    expect(serverSettings.benchmark.newRunStartUtcHour).toBe(12)
    expect(serverSettings.benchmark.newRunUtcMonthDays).toEqual([5, 15, 25])

    expect(getBenchmarkRunWindowAtOrAfter(new Date('2026-03-05T11:59:59.999Z')).toISOString()).toBe(
      '2026-03-05T12:00:00.000Z',
    )
    expect(getBenchmarkRunWindowAtOrAfter(new Date('2026-03-05T12:00:00.000Z')).toISOString()).toBe(
      '2026-03-05T12:00:00.000Z',
    )
    expect(getBenchmarkRunWindowAtOrAfter(new Date('2026-03-05T12:00:00.001Z')).toISOString()).toBe(
      '2026-03-15T12:00:00.000Z',
    )
  })

  it('uses the intentional 8- to 11-day month-boundary gaps', () => {
    expect(getBenchmarkRunWindowAtOrAfter(new Date('2026-02-25T12:00:00.001Z')).toISOString()).toBe(
      '2026-03-05T12:00:00.000Z',
    )
    expect(getBenchmarkRunWindowAtOrAfter(new Date('2026-03-25T12:00:00.001Z')).toISOString()).toBe(
      '2026-04-05T12:00:00.000Z',
    )
  })

  it('supports alternate month-day calendars for future tuning', () => {
    expect(
      getBenchmarkRunWindowAtOrAfter(
        new Date('2026-03-06T00:00:00.000Z'),
        12,
        [6, 16, 26],
      ).toISOString(),
    ).toBe('2026-03-06T12:00:00.000Z')
  })
})
