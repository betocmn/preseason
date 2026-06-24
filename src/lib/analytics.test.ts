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

  it('drops login page views with protected redirect targets', () => {
    const event: BeforeSendEvent = {
      type: 'pageview',
      url: 'https://preseason.ai/login?redirectTo=/admin/benchmark/runs/run_123',
    }

    expect(filterAnalyticsEvent(event)).toBeNull()
  })

  it('drops encoded protected redirect targets', () => {
    const event: BeforeSendEvent = {
      type: 'pageview',
      url: 'https://preseason.ai/login?redirectTo=%2Fadmin%2Fmatches%2Fmatch_123',
    }

    expect(filterAnalyticsEvent(event)).toBeNull()
  })

  it('keeps public query targets', () => {
    const event: BeforeSendEvent = {
      type: 'pageview',
      url: 'https://preseason.ai/login?redirectTo=/rankings',
    }

    expect(filterAnalyticsEvent(event)).toBe(event)
  })

  it('keeps invalid URL-like query values', () => {
    const event: BeforeSendEvent = {
      type: 'pageview',
      url: 'https://preseason.ai/login?redirectTo=https://%',
    }

    expect(filterAnalyticsEvent(event)).toBe(event)
  })
})
