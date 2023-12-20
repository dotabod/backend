import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.DB_URL ?? '';
const supabaseKey = process.env.DB_SECRET ?? '';
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
});
export default supabase;
//# sourceMappingURL=supabase.js.map