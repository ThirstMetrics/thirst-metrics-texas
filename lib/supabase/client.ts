/**
 * Supabase Client for Browser
 * Uses @supabase/ssr for proper cookie-based session management
 * This ensures session is stored in cookies (not just localStorage)
 * so that middleware and server components can access it
 */

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  );
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
