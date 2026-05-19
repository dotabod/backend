import { createClient } from '@supabase/supabase-js'

import type { Database } from './supabase-types.js'

// Placeholders let the module import cleanly when env vars are absent
// (e.g. unit tests without Doppler). Any real network call against the
// resulting client will still fail, which is the desired behavior outside
// of an integration environment.
const supabaseUrl = process.env.DB_URL || 'https://placeholder.invalid'
const supabaseKey = process.env.DB_SECRET || 'placeholder-key'

if (process.env.NODE_ENV !== 'test' && (!process.env.DB_URL || !process.env.DB_SECRET)) {
  console.warn(
    '[shared-utils] DB_URL or DB_SECRET missing; supabase client is using placeholder credentials and any real query will fail.',
  )
}

type SupabaseClient = ReturnType<typeof createClient<Database>>

let supabaseInstance: SupabaseClient | null = null

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  }
  return supabaseInstance
}

const supabase = getSupabaseClient()
export default supabase
