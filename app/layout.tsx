/**
 * Root Layout
 * Provides the base HTML structure for all pages
 */

import type { Metadata } from 'next';
import './globals.css';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth';
import NavBarWrapper from '@/components/navbar-wrapper';

export const metadata: Metadata = {
  title: 'Thirst Metrics Texas',
  description: 'Sales intelligence platform for beverage distributors in Texas',
  icons: {
    icon: '/favicon.svg',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is authenticated
  let userEmail = '';
  let userRole = 'salesperson';
  let isAuthenticated = false;

  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      userEmail = user.email || '';
      const role = await getUserRole();
      userRole = role || 'salesperson';
    }
  } catch (error) {
    // User not authenticated - that's ok
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
        {isAuthenticated && (
          <NavBarWrapper
            userEmail={userEmail}
            userRole={userRole}
          />
        )}
        {children}
        <div style={{ position: 'fixed', bottom: 4, right: 8, fontSize: '10px', opacity: 0.4, color: '#666', zIndex: 9999, pointerEvents: 'none' }}>
          Build: {new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} CT
        </div>
      </body>
    </html>
  );
}
