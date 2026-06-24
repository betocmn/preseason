import type { BeforeSendEvent } from '@vercel/analytics/next'

const analyticsUrlBase = 'http://localhost'
const protectedAnalyticsPaths = ['/admin']

function isProtectedAnalyticsPath(pathname: string) {
  return protectedAnalyticsPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

export function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const { pathname } = new URL(event.url, analyticsUrlBase)

  if (isProtectedAnalyticsPath(pathname)) {
    return null
  }

  return event
}
