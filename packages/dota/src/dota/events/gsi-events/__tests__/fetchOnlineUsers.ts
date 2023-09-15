import supabase from '../../../../db/supabase.js'

export async function fetchOnlineUsers(count: number) {
  const { data } = await supabase
    .from('users')
    .select('id, name')
    .eq('stream_online', true)
    .order('name', { ascending: true })
    .limit(count)
  return data ?? []
}
