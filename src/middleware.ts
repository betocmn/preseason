import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '~/lib/supabase/middleware'

const protectedRoutes = ['/admin']
const vercelAnalyticsRoutePrefix = '/_vercel/insights'

function normalizePathPrefix(path: string | undefined) {
  if (!path) return undefined

  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.replace(/\/+$/, '') || undefined
}

function matchesPathPrefix(pathname: string, pathPrefix: string) {
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`)
}

export function isVercelAnalyticsRoute(
  pathname: string,
  analyticsBasePath = process.env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH,
) {
  const normalizedAnalyticsBasePath = normalizePathPrefix(analyticsBasePath)

  return (
    matchesPathPrefix(pathname, vercelAnalyticsRoutePrefix) ||
    (normalizedAnalyticsBasePath !== undefined &&
      matchesPathPrefix(pathname, normalizedAnalyticsBasePath))
  )
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (isVercelAnalyticsRoute(pathname)) {
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
