import supabase from '../../../../db/supabase.js';
export async function fetchOnlineUsers(count) {
    const { data } = await supabase.from('users').select('id').eq('stream_online', true).limit(count);
    return data ?? [];
}
//# sourceMappingURL=fetchOnlineUsers.js.map