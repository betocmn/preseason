import { createServerSupabaseClient } from '~/lib/supabase/server'

function isSessionMissingError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AuthSessionMissingError'
}

export async function getServerUser() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    if (isSessionMissingError(error)) return null
    throw error
  }
  return data.user
}

export async function getServerSession() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    if (isSessionMissingError(error)) return null
    throw error
  }
  return data.session
}
