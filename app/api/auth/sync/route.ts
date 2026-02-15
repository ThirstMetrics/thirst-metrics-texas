/**
 * Auth Sync API Route
 * Sets Supabase session cookies using @supabase/ssr so middleware can read them.
 * Called by the login page after successful signInWithPassword.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: Request) {
  try {
    const { access_token, refresh_token } = await request.json();

    if (!access_token) {
      return NextResponse.json({ error: 'No access token provided' }, { status: 400 });
    }

    const cookieStore = await cookies();

    // Create a Supabase server client that can set cookies
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    });

    // Set the session — this causes @supabase/ssr to write the session
    // into cookies in its expected format (base64url-encoded, possibly chunked)
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      console.error('Auth sync setSession error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Auth sync error:', error);
    return NextResponse.json({ error: 'Failed to sync session' }, { status: 500 });
  }
}
