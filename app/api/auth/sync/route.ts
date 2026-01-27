/**
 * Auth Sync API Route
 * Syncs Supabase session from localStorage to cookies for middleware access
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
    
    // Set auth tokens in cookies for middleware to read
    const cookieName = `sb-${supabaseUrl.split('//')[1]?.split('.')[0]}-auth-token`;
    
    cookieStore.set(cookieName, JSON.stringify({
      access_token,
      refresh_token,
      expires_at: Date.now() + (60 * 60 * 1000), // 1 hour
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Auth sync error:', error);
    return NextResponse.json({ error: 'Failed to sync session' }, { status: 500 });
  }
}
