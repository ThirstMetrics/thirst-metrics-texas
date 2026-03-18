/**
 * Role-Based + Subscription Middleware
 * Protects routes based on user roles and subscription status.
 * Uses @supabase/ssr for reliable cookie-based session detection.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

// Routes that never require auth or subscription
const publicRoutes = ['/login', '/signup', '/'];

// Routes that require auth but NOT a subscription
const billingExemptRoutes = ['/billing', '/settings', '/preferences'];

// Role-based route protection
const routeRoles: Record<string, string[]> = {
  '/admin': ['admin'],
  '/dashboard': ['salesperson', 'manager', 'admin'],
  '/customers': ['salesperson', 'manager', 'admin'],
  '/activities': ['salesperson', 'manager', 'admin'],
  '/goals': ['salesperson', 'manager', 'admin'],
  '/analytics': ['manager', 'admin'],
  '/chains': ['salesperson', 'manager', 'admin'],
  '/billing': ['salesperson', 'manager', 'admin'],
  '/territories': ['manager', 'admin'],
};

// Subscription statuses that allow app access
const allowedStatuses = ['active', 'trialing', 'past_due'];

// Marketing domains serve only the landing page — all other paths redirect to app subdomain
const MARKETING_DOMAINS = new Set(['whiskeyrivertx.com', 'www.whiskeyrivertx.com']);
const APP_DOMAIN = 'app.whiskeyrivertx.com';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Handle marketing domain routing
  if (MARKETING_DOMAINS.has(host)) {
    if (pathname === '/') {
      const response = NextResponse.next();
      response.headers.set('x-pathname', pathname);
      return response;
    }
    // Any non-root path on marketing domain → redirect to app subdomain
    const appUrl = new URL(`https://${APP_DOMAIN}${pathname}`);
    appUrl.search = request.nextUrl.search;
    return NextResponse.redirect(appUrl);
  }

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

    // Get user role and org from database
    const { data: userData } = await supabase
      .from('users')
      .select('role, org_id')
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

    // Subscription gating — skip for billing-exempt routes
    const isBillingExempt = billingExemptRoutes.some(
      (route) => pathname === route || pathname.startsWith(route + '/')
    );

    if (!isBillingExempt && userData?.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('subscription_status')
        .eq('id', userData.org_id)
        .single();

      if (org && !allowedStatuses.includes(org.subscription_status)) {
        return NextResponse.redirect(new URL('/billing', request.url));
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
