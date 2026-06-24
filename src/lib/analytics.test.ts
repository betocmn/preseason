import type { BeforeSendEvent } from '@vercel/analytics/next'
import { describe, expect, it } from 'vitest'
import { filterAnalyticsEvent } from './analytics'

describe('filterAnalyticsEvent', () => {
  it('keeps public page views', () => {
    const event: BeforeSendEvent = { type: 'pageview', url: 'https://preseason.ai/rankings' }

    expect(filterAnalyticsEvent(event)).toBe(event)
  })

  it('drops admin page views', () => {
    const event: BeforeSendEvent = {
      type: 'pageview',
      url: 'https://preseason.ai/admin/benchmark/runs/run_123',
    }

    expect(filterAnalyticsEvent(event)).toBeNull()
  })

  it('drops admin events when the event URL is relative', () => {
    const event: BeforeSendEvent = { type: 'event', url: '/admin/matches/match_123' }

    expect(filterAnalyticsEvent(event)).toBeNull()
  })
})
