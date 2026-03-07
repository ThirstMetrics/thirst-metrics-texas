/**
 * Role-Based Middleware
 * Protects routes based on user roles: salesperson, manager, admin
 * Uses @supabase/ssr for reliable cookie-based session detection
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

// Public routes that don't require authentication
const publicRoutes = ['/login', '/signup', '/'];

// Role-based route protection
const routeRoles: Record<string, string[]> = {
  '/admin': ['admin'],
  '/dashboard': ['salesperson', 'manager', 'admin'],
  '/customers': ['salesperson', 'manager', 'admin'],
  '/activities': ['salesperson', 'manager', 'admin'],
  '/analytics': ['manager', 'admin'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    const response = NextResponse.next();
    response.headers.set('x-pathname', pathname);
    return response;
  }

  // Check if route requires authentication
  const requiresAuth = Object.keys(routeRoles).some(route =>
    pathname.startsWith(route)
  );

  if (!requiresAuth) {
    const response = NextResponse.next();
    response.headers.set('x-pathname', pathname);
    return response;
  }

  try {
    const { supabase, response } = await createMiddlewareClient(request);

    // Refresh session - this is critical for keeping the session alive
    // and properly reading chunked cookies set by @supabase/ssr
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      const redirectUrl = new URL('/login', request.url);
      redirectUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // Get user role from database
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const userRole = userData?.role || 'salesperson';

    // Check if user has required role for this route
    for (const [route, allowedRoles] of Object.entries(routeRoles)) {
      if (pathname.startsWith(route)) {
        if (!allowedRoles.includes(userRole)) {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
        break;
      }
    }

    // Add pathname header and return response with refreshed cookies
    response.headers.set('x-pathname', pathname);
    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    // On unexpected error, let the request through rather than loop
    // The page itself will handle auth if needed
    const response = NextResponse.next();
    response.headers.set('x-pathname', pathname);
    return response;
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
