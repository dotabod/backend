import supabase from '../../../../db/supabase.js'

export async function fetchOnlineUsers(count: number) {
  const { data } = await supabase.from('users').select('id').eq('stream_online', true).limit(count)
  return data ?? []
}
