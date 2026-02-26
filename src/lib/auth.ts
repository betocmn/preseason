import { createServerSupabaseClient } from '~/lib/supabase/server'

export async function getServerUser() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

export async function getServerSession() {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}
