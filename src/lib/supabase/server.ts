import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '~/env'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch (error) {
          // The `setAll` method was called from a Server Component.
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Supabase] Cookie setAll failed (expected in Server Components):', error)
          }
        }
      },
    },
  })
}
