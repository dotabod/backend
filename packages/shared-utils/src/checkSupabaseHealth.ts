import supabase from './db/supabase'

// Dependency-aware health probe for Uptime Kuma heartbeats.
//
// A process-liveness check (HTTP 200 / an "I'm alive" push) stays green even
// when the container has lost its route to Supabase. That happened on
// 2026-05-29: a Supabase stack redeploy recreated its docker network and
// silently detached the app containers, so every user/account lookup failed
// (getaddrinfo ENOTFOUND supabase-kong) while every monitor showed green —
// only twitch-events alerted, and only because it happened to crash.
//
// This does a real round-trip through Supabase (kong -> postgrest), so
// "can't reach Supabase" turns a heartbeat red instead of failing silently.

const SUPABASE_HEALTH_TIMEOUT_MS = 8000

export async function checkSupabaseHealth(): Promise<{ up: boolean; msg: string }> {
  try {
    const { error } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(SUPABASE_HEALTH_TIMEOUT_MS))

    if (error) return { up: false, msg: `supabase error: ${error.message}` }
    return { up: true, msg: 'supabase reachable' }
  } catch (e) {
    return {
      up: false,
      msg: `supabase unreachable: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
