import { supabase } from '@dotabod/shared-utils'

export async function fetchOnlineUsers(count: number) {
  // Handle case when supabase is not configured (missing env vars in test environment)
  if (!supabase) {
    console.warn('Supabase not configured - skipping fetchOnlineUsers')
    return []
  }
  const { data } = await supabase.from('users').select('id').eq('stream_online', true).limit(count)
  return data ?? []
}
