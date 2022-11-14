import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.DB_URL
const supabaseKey = process.env.DB_SECRET

export default createClient(supabaseUrl, supabaseKey)
