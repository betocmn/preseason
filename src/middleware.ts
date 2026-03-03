import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '~/lib/supabase/middleware'

const publicRoutes = ['/', '/login', '/signup']

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const pathname = request.nextUrl.pathname

  // Redirect /admin to /beto-admin (actual URL)
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/^\/admin/, '/beto-admin')
    return NextResponse.redirect(url)
  }

  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  if (!user && !isPublicRoute) {
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
  matcher: ['/((?!api|auth/callback|_next/static|_next/image|favicon.ico).*)'],
}
