import { createClient } from '@supabase/supabase-js'

import type { Database } from './supabase-types.js'

const supabaseUrl = process.env.DB_URL ?? ''
const supabaseKey = process.env.DB_SECRET ?? ''

const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})
export default supabase
