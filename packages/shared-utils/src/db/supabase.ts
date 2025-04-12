import { createClient } from '@supabase/supabase-js'

import type { Database } from './supabase-types.js'
import { logger } from '../logger.js'

const supabaseUrl = process.env.DB_URL
const supabaseKey = process.env.DB_SECRET

// Validate required environment variables
if (!supabaseUrl || !supabaseKey) {
  logger.error('[SUPABASE] Missing required environment variables for Supabase connection')
  throw new Error('Missing required Supabase configuration (DB_URL or DB_SECRET)')
}

// Create a singleton instance of the Supabase client
let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null

/**
 * Returns the Supabase client instance, creating it if it doesn't exist
 */
export const getSupabaseClient = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  }
  return supabaseInstance
}

// For backward compatibility
const supabase = getSupabaseClient()
export default supabase
