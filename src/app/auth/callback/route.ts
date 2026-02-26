import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { routing } from '~/i18n/routing'
import { createServerSupabaseClient } from '~/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Detect locale from NEXT_LOCALE cookie (set by next-intl middleware)
  const cookieStore = await cookies()
  const locale = cookieStore.get('NEXT_LOCALE')?.value ?? routing.defaultLocale

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const redirectPath = next.startsWith(`/${locale}`) ? next : `/${locale}${next}`
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth`)
}
