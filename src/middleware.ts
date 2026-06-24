import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '~/lib/supabase/middleware'

const protectedRoutes = ['/admin']
const vercelAnalyticsRoutePrefix = '/_vercel/insights'
const vercelAnalyticsClientConfigPathKeys = [
  'scriptSrc',
  'viewEndpoint',
  'eventEndpoint',
  'sessionEndpoint',
] as const

function normalizePathPrefix(path: string | undefined, requestOrigin?: string) {
  if (!path) return undefined
  let pathToNormalize = path

  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
    if (!requestOrigin) return undefined

    try {
      const url = new URL(path, requestOrigin)
      if (url.origin !== requestOrigin) return undefined

      pathToNormalize = url.pathname
    } catch {
      return undefined
    }
  }

  const normalized = pathToNormalize.startsWith('/') ? pathToNormalize : `/${pathToNormalize}`
  return normalized.replace(/\/+$/, '') || undefined
}

function buildInsightsPathPrefix(path: string | undefined, requestOrigin: string | undefined) {
  const normalized = normalizePathPrefix(path, requestOrigin)
  if (!normalized) return undefined

  return `${normalized}/insights`
}

function matchesPathPrefix(pathname: string, pathPrefix: string) {
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`)
}

function getAnalyticsConfig(configString: string | undefined): Record<string, unknown> | undefined {
  if (!configString) return undefined

  try {
    const parsed = JSON.parse(configString) as { analytics?: unknown }
    return typeof parsed.analytics === 'object' && parsed.analytics !== null
      ? (parsed.analytics as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

function addPathPrefix(
  pathPrefixes: Set<string>,
  path: string | undefined,
  requestOrigin: string | undefined,
) {
  const normalized = normalizePathPrefix(path, requestOrigin)
  if (normalized) {
    pathPrefixes.add(normalized)
  }
}

function addPath(paths: Set<string>, path: string | undefined, requestOrigin: string | undefined) {
  const normalized = normalizePathPrefix(path, requestOrigin)
  if (normalized) {
    paths.add(normalized)
  }
}

function addInsightsPathPrefix(
  pathPrefixes: Set<string>,
  path: string | undefined,
  requestOrigin: string | undefined,
) {
  const normalized = buildInsightsPathPrefix(path, requestOrigin)
  if (normalized) {
    pathPrefixes.add(normalized)
  }
}

function getVercelAnalyticsRoutes(
  analyticsBasePath: string | undefined,
  analyticsClientConfig: string | undefined,
  requestOrigin: string | undefined,
) {
  const pathPrefixes = new Set([vercelAnalyticsRoutePrefix])
  const paths = new Set<string>()
  const analyticsConfig = getAnalyticsConfig(analyticsClientConfig)

  addInsightsPathPrefix(pathPrefixes, analyticsBasePath, requestOrigin)

  if (analyticsConfig) {
    const configuredBasePath = analyticsConfig.basePath
    if (typeof configuredBasePath === 'string') {
      addInsightsPathPrefix(pathPrefixes, configuredBasePath, requestOrigin)
    }

    const configuredEndpoint = analyticsConfig.endpoint
    if (typeof configuredEndpoint === 'string') {
      addPathPrefix(pathPrefixes, configuredEndpoint, requestOrigin)
    }

    for (const key of vercelAnalyticsClientConfigPathKeys) {
      const configuredPath = analyticsConfig[key]
      if (typeof configuredPath === 'string') {
        addPath(paths, configuredPath, requestOrigin)
      }
    }
  }

  return { pathPrefixes: [...pathPrefixes], paths: [...paths] }
}

export function isVercelAnalyticsRoute(
  pathname: string,
  analyticsBasePath = process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH,
  analyticsClientConfig = process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG,
  requestOrigin?: string,
) {
  const { pathPrefixes, paths } = getVercelAnalyticsRoutes(
    analyticsBasePath,
    analyticsClientConfig,
    requestOrigin,
  )

  return (
    pathPrefixes.some((pathPrefix) => matchesPathPrefix(pathname, pathPrefix)) ||
    paths.includes(pathname)
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (isVercelAnalyticsRoute(pathname, undefined, undefined, request.nextUrl.origin)) {
    return NextResponse.next()
  }

  const { supabaseResponse, user } = await updateSession(request)

  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|auth/callback|_next/static|_next/image|_vercel/insights|favicon.ico).*)'],
}
