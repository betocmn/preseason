import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { describe, expect, it } from 'vitest'
import { config, isVercelAnalyticsRoute } from './middleware'

describe('isVercelAnalyticsRoute', () => {
  it('matches the default Vercel insights route', () => {
    expect(isVercelAnalyticsRoute('/_vercel/insights/view')).toBe(true)
  })

  it('matches a configured Vercel analytics base path', () => {
    expect(isVercelAnalyticsRoute('/va-path/insights/view', '/va-path')).toBe(true)
    expect(isVercelAnalyticsRoute('/va-path/insights/view', 'va-path/')).toBe(true)
  })

  it('does not match protected app routes', () => {
    expect(isVercelAnalyticsRoute('/admin', '/va-path')).toBe(false)
    expect(isVercelAnalyticsRoute('/admin/view', '/va-path')).toBe(false)
  })

  it('only matches insights under a configured base path', () => {
    expect(isVercelAnalyticsRoute('/admin/insights/view', '/admin')).toBe(true)
    expect(isVercelAnalyticsRoute('/admin', '/admin')).toBe(false)
    expect(isVercelAnalyticsRoute('/admin/benchmark/runs/run_123', '/admin')).toBe(false)
  })

  it('ignores an invalid root analytics base path', () => {
    expect(isVercelAnalyticsRoute('/admin', '/')).toBe(false)
  })

  it('matches endpoints configured by Vercel analytics client config', () => {
    const clientConfig = JSON.stringify({
      analytics: {
        scriptSrc: '/va/script.js',
        viewEndpoint: '/va/view',
        eventEndpoint: '/va/event',
      },
    })

    expect(isVercelAnalyticsRoute('/va/script.js', '', clientConfig)).toBe(true)
    expect(isVercelAnalyticsRoute('/va/view', '', clientConfig)).toBe(true)
    expect(isVercelAnalyticsRoute('/va/event', '', clientConfig)).toBe(true)
    expect(isVercelAnalyticsRoute('/va/view/extra', '', clientConfig)).toBe(false)
  })

  it('reads Vercel analytics client config from the server env variable', () => {
    const originalConfig = process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG
    const originalPublicConfig = process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG

    try {
      process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG = JSON.stringify({
        analytics: { viewEndpoint: '/va/view' },
      })
      delete process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG

      expect(isVercelAnalyticsRoute('/va/view', '')).toBe(true)
    } finally {
      if (originalConfig === undefined) {
        delete process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG
      } else {
        process.env.VERCEL_OBSERVABILITY_CLIENT_CONFIG = originalConfig
      }

      if (originalPublicConfig === undefined) {
        delete process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG
      } else {
        process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG = originalPublicConfig
      }
    }
  })

  it('matches same-origin absolute endpoints configured by Vercel analytics client config', () => {
    const clientConfig = JSON.stringify({
      analytics: {
        viewEndpoint: 'https://preseason.ai/va/view',
      },
    })

    expect(isVercelAnalyticsRoute('/va/view', '', clientConfig, 'https://preseason.ai')).toBe(true)
    expect(isVercelAnalyticsRoute('/va/view', '', clientConfig, 'https://example.com')).toBe(false)
  })

  it('matches base paths configured by Vercel analytics client config', () => {
    const clientConfig = JSON.stringify({ analytics: { basePath: '/observability' } })

    expect(isVercelAnalyticsRoute('/observability/insights/view', '', clientConfig)).toBe(true)
    expect(isVercelAnalyticsRoute('/observability/view', '', clientConfig)).toBe(false)
  })

  it('matches deprecated endpoint config as an intake prefix', () => {
    const clientConfig = JSON.stringify({ analytics: { endpoint: '/observability/insights' } })

    expect(isVercelAnalyticsRoute('/observability/insights/view', '', clientConfig)).toBe(true)
  })
})

describe('middleware config', () => {
  it('excludes the default Vercel insights route from middleware matching', () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: 'https://preseason.ai/_vercel/insights/view',
      }),
    ).toBe(false)
  })
})
