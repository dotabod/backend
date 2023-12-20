import { createClient } from '@supabase/supabase-js'

import { Database } from './supabase-types'

const supabaseUrl = process.env.DB_URL ?? ''
const supabaseKey = process.env.DB_SECRET ?? ''

const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})
export default supabase
