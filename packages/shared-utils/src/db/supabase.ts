import { createClient } from '@supabase/supabase-js'

// Singleton instance of the Supabase client
let supabaseClient: ReturnType<typeof createClient> | null = null

/**
 * Get or create a singleton instance of the Supabase client
 * @returns Supabase client instance
 */
export const getSupabaseClient = () => {
  if (supabaseClient) return supabaseClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey)
  return supabaseClient
}
