/**
 * Supabase Client for Middleware
 * Uses @supabase/ssr to read/refresh session cookies in middleware context
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createMiddlewareClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Set cookies on the request (for downstream server components)
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        // Create a new response with updated cookies
        supabaseResponse = NextResponse.next({
          request,
        });
        // Set cookies on the response (for the browser)
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, response: supabaseResponse };
}
