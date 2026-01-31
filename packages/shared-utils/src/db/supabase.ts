import { createClient } from '@supabase/supabase-js'

import { logger } from '../logger.js'
import type { Database } from './supabase-types.js'

const supabaseUrl = process.env.DB_URL
const supabaseKey = process.env.DB_SECRET

// Log warning if environment variables are missing (don't throw - allow tests to run)
const isConfigured = !!(supabaseUrl && supabaseKey)
if (!isConfigured) {
  logger.error('[SUPABASE] Missing required environment variables for Supabase connection')
}

// Create a singleton instance of the Supabase client
let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null

/**
 * Returns the Supabase client instance, creating it if it doesn't exist
 * Returns null if Supabase is not configured (missing env vars)
 */
export const getSupabaseClient = (): ReturnType<typeof createClient<Database>> | null => {
  if (!isConfigured) {
    return null
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false },
    })
  }
  return supabaseInstance
}

// For backward compatibility - can be null if not configured
const supabase = getSupabaseClient()
export default supabase
