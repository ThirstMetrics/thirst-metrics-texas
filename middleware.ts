/**
 * Role-Based Middleware
 * Protects routes based on user roles: salesperson, manager, admin
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Public routes that don't require authentication
const publicRoutes = ['/login', '/signup', '/'];

// Routes that should bypass auth check (static assets, etc.)
const bypassRoutes = ['/_next', '/api/auth', '/favicon.ico'];

// Role-based route protection
const routeRoles: Record<string, string[]> = {
  '/admin': ['admin'],
  '/dashboard': ['salesperson', 'manager', 'admin'],
  '/customers': ['salesperson', 'manager', 'admin'],
  '/activities': ['salesperson', 'manager', 'admin'],
  '/analytics': ['manager', 'admin'], // Analytics only for managers and admins
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Allow bypass routes (static assets, API routes, etc.)
  if (bypassRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  
  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }
  
  // Check if route requires authentication
  const requiresAuth = Object.keys(routeRoles).some(route => 
    pathname.startsWith(route)
  );
  
  if (!requiresAuth) {
    // Allow access to root and other public pages
    return NextResponse.next();
  }
  
  try {
    // Supabase stores session in cookies with this pattern
    // Check for auth token in cookies
    const authCookieName = `sb-${supabaseUrl.split('//')[1]?.split('.')[0]}-auth-token`;
    const authCookie = request.cookies.get(authCookieName);
    
    // If no auth cookie, user is not authenticated
    if (!authCookie) {
      console.log('[MIDDLEWARE] No auth cookie found, redirecting to login');
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }
    
    // Parse the auth token from cookie
    let authData;
    try {
      authData = JSON.parse(authCookie.value);
    } catch {
      console.log('[MIDDLEWARE] Failed to parse auth cookie');
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }
    
    // Create Supabase client with the access token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
        },
      },
    });
    
    // Try to get user from session using the access token
    const { data: { user }, error } = await supabase.auth.getUser(authData.access_token);
    
    // If not authenticated, redirect to login
    if (error || !user) {
      console.log('[MIDDLEWARE] User not authenticated, redirecting to login');
      console.log('[MIDDLEWARE] Error:', error?.message);
      console.log('[MIDDLEWARE] Pathname:', pathname);
      console.log('[MIDDLEWARE] Auth cookie found:', !!request.cookies.get(authCookieName));
      
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }
    
    console.log('[MIDDLEWARE] User authenticated:', user.id);
    
    // Get user role from database
    // Note: In middleware, we do a simple check. Full role validation happens in pages.
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    
    // If user record doesn't exist, default to salesperson
    const userRole = userData?.role || 'salesperson';
    
    // Check if user has required role for this route
    for (const [route, allowedRoles] of Object.entries(routeRoles)) {
      if (pathname.startsWith(route)) {
        if (!allowedRoles.includes(userRole)) {
          // User doesn't have required role - redirect to dashboard
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        break;
      }
    }
    
    return NextResponse.next();
  } catch (error) {
    console.error('Middleware error:', error);
    // On error, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
