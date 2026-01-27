/**
 * Supabase Client for Server Components
 * Use this in Server Components, Server Actions, and API routes
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local'
  );
}

/**
 * Get Supabase client for server-side operations
 * This creates a client with the user's session from cookies
 * Note: setItem and removeItem are no-ops in server components/API routes
 * Cookies are managed by the client-side Supabase instance
 */
export async function createServerClient() {
  const cookieStore = await cookies();
  
  // Create a client that uses cookies for session management
  // In server components/API routes, we can only read cookies, not write them
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: {
        getItem: (key: string) => {
          const cookie = cookieStore.get(key);
          return cookie?.value ?? null;
        },
        setItem: () => {
          // No-op in server context - cookies are set by client
          // This prevents the "cookies can only be modified in a Server Action" error
        },
        removeItem: () => {
          // No-op in server context - cookies are removed by client
        },
      },
    },
  });
  
  return client;
}

/**
 * Get Supabase client with service role (bypasses RLS)
 * Use only in server-side code that needs admin access
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. This is required for service role operations.'
    );
  }
  
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
