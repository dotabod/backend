import { createClient } from '@supabase/supabase-js'
import { logger } from '../twitch/lib/logger.js'

import type { Database } from './supabase-types'

// Get environment variables with validation
const supabaseUrl = process.env.DB_URL
const supabaseKey = process.env.DB_SECRET

// Validate required environment variables
if (!supabaseUrl || !supabaseKey) {
  logger.error('[SUPABASE] Missing required environment variables for Supabase connection')
  throw new Error('Missing required Supabase configuration (DB_URL or DB_SECRET)')
}

// Create and configure Supabase client as a singleton
let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null

function getSupabaseClient() {
  if (!supabaseInstance) {
    supabaseInstance = createClient<Database>(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: false },
    })
  }
  return supabaseInstance
}

const supabase = getSupabaseClient()

export default supabase
