import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { describe, expect, it } from 'vitest'
import { config, isVercelAnalyticsRoute } from './middleware'

describe('isVercelAnalyticsRoute', () => {
  it('matches the default Vercel insights route', () => {
    expect(isVercelAnalyticsRoute('/_vercel/insights/view')).toBe(true)
  })

  it('matches a configured Vercel analytics base path', () => {
    expect(isVercelAnalyticsRoute('/va-path/view', '/va-path')).toBe(true)
    expect(isVercelAnalyticsRoute('/va-path/view', 'va-path/')).toBe(true)
  })

  it('does not match protected app routes', () => {
    expect(isVercelAnalyticsRoute('/admin', '/va-path')).toBe(false)
    expect(isVercelAnalyticsRoute('/admin/view', '/va-path')).toBe(false)
  })

  it('ignores an invalid root analytics base path', () => {
    expect(isVercelAnalyticsRoute('/admin', '/')).toBe(false)
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
