import { createClient } from '@supabase/supabase-js'

import type { Database } from './supabase-types.js'

// Placeholders let the module import cleanly when env vars are absent
// (e.g. unit tests without Doppler). Any real network call against the
// resulting client will still fail, which is the desired behavior outside
// of an integration environment.
const supabaseUrl = process.env.DB_URL || 'https://placeholder.invalid'
const supabaseKey = process.env.DB_SECRET || 'placeholder-key'

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
