import { type NextRequest, NextResponse } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from '~/i18n/routing'
import { updateSession } from '~/lib/supabase/middleware'

const intlMiddleware = createIntlMiddleware(routing)

const publicRoutes = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  // 1. Run i18n middleware (handles locale detection, redirect, rewrite)
  const intlResponse = intlMiddleware(request)

  // 2. Refresh Supabase session
  const { supabaseResponse, user } = await updateSession(request)

  // 3. Copy Supabase auth cookies onto the i18n response
  for (const cookie of supabaseResponse.cookies.getAll()) {
    intlResponse.cookies.set(cookie.name, cookie.value)
  }

  // 4. Extract locale and path without locale prefix for route matching
  const pathname = request.nextUrl.pathname
  const localeMatch = pathname.match(/^\/(en|bg)(.*)$/)
  const locale = localeMatch?.[1] ?? routing.defaultLocale
  const pathWithoutLocale = localeMatch?.[2] || '/'

  // 5. Auth checks
  const isPublicRoute = publicRoutes.some((route) => pathWithoutLocale.startsWith(route))

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/login`
    url.searchParams.set('redirectTo', pathWithoutLocale)
    return NextResponse.redirect(url)
  }

  if (user && (pathWithoutLocale === '/login' || pathWithoutLocale === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/`
    return NextResponse.redirect(url)
  }

  return intlResponse
}

export const config = {
  matcher: ['/((?!api|auth/callback|_next/static|_next/image|favicon.ico).*)'],
}
