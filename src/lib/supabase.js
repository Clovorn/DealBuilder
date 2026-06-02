import { createClient } from '@supabase/supabase-js';

/**
 * Single Supabase client for the OneRonnoco platform.
 *
 * This rebuild collapses the original three-project wiring (catalog +
 * deal-pipeline + distributor-leads) onto ONE database: the OneRonnoco
 * project. Every read and write in the app flows through this client.
 *
 * Env (set in .env locally and in Netlify site env for deploy):
 *   VITE_SUPABASE_URL      - https://<ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY - the publishable / anon key for the project
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase env vars. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
