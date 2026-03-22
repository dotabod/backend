import { createClient } from '@supabase/supabase-js'

import type { Database } from './supabase-types.js'

const supabaseUrl = process.env.DB_URL ?? ''
const supabaseKey = process.env.DB_SECRET ?? ''

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
