import type { BeforeSendEvent } from '@vercel/analytics/next'

const analyticsUrlBase = 'http://localhost'
const protectedAnalyticsPaths = ['/admin']

function isProtectedAnalyticsPath(pathname: string) {
  return protectedAnalyticsPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

function isProtectedAnalyticsTarget(value: string) {
  if (!value.startsWith('/') && !value.startsWith('http://') && !value.startsWith('https://')) {
    return false
  }

  try {
    const { pathname } = new URL(value, analyticsUrlBase)
    return isProtectedAnalyticsPath(pathname)
  } catch {
    return false
  }
}

function hasProtectedAnalyticsSearchParam(searchParams: URLSearchParams) {
  return [...searchParams.values()].some((value) => isProtectedAnalyticsTarget(value))
}

export function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url, analyticsUrlBase)

  if (
    isProtectedAnalyticsPath(url.pathname) ||
    hasProtectedAnalyticsSearchParam(url.searchParams)
  ) {
    return null
  }

  return event
}
