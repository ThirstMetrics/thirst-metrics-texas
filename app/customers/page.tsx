/**
 * Customer List Page
 * Displays customers with sorting and filtering
 */

import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import CustomerListClient from '@/components/customer-list-client';

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',      // brand-500 (teal)
  primaryDark: '#042829',  // brand-900
  primaryLight: '#e6f5f5', // brand-50
  accent: '#22d3e6',       // accent-400 (cyan)
  gradient: 'linear-gradient(135deg, #042829 0%, #063a3c 50%, #021a1b 100%)',
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get user role from profile
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role || 'salesperson';

  // Parse search params
  const page = parseInt(searchParams.page as string) || 1;
  const search = (searchParams.search as string) || '';
  const county = (searchParams.county as string) || '';
  const city = (searchParams.city as string) || '';
  const sortBy = (searchParams.sortBy as string) || 'revenue';
  const sortOrder = (searchParams.sortOrder as 'asc' | 'desc') || 'desc';
  const minRevenue = searchParams.minRevenue ? parseFloat(searchParams.minRevenue as string) : undefined;
  const monthsBack = parseInt(searchParams.monthsBack as string) || 12;

  const limit = 50;
  const offset = (page - 1) * limit;

  return (
    <div style={styles.wrapper}>
      {/* Navigation Header */}
      <header style={styles.navHeader}>
        <div style={styles.navContent}>
          <div style={styles.navLeft}>
            <Link href="/dashboard" style={styles.logoLink}>
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={styles.logoIcon}>
                <rect width="40" height="40" rx="9" fill="#0d7377"/>
                <rect x="6" y="22" width="5.5" height="12" rx="1.5" fill="white" opacity="0.55"/>
                <rect x="7.25" y="19.5" width="3" height="3" rx="0.8" fill="white" opacity="0.55"/>
                <rect x="13.5" y="16" width="5.5" height="18" rx="1.5" fill="white" opacity="0.7"/>
                <rect x="14.75" y="13" width="3" height="3.5" rx="0.8" fill="white" opacity="0.7"/>
                <rect x="21" y="11" width="5.5" height="23" rx="1.5" fill="white" opacity="0.85"/>
                <rect x="22.25" y="7.5" width="3" height="4" rx="0.8" fill="white" opacity="0.85"/>
                <rect x="28.5" y="6" width="5.5" height="28" rx="1.5" fill="white"/>
                <rect x="29.75" y="3" width="3" height="3.5" rx="0.8" fill="white"/>
                <path d="M8.5 26 L16.25 20 L23.75 14.5 L31.25 9" stroke="#22d3e6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
                <circle cx="8.5" cy="26" r="1.5" fill="#22d3e6"/>
                <circle cx="16.25" cy="20" r="1.5" fill="#22d3e6"/>
                <circle cx="23.75" cy="14.5" r="1.5" fill="#22d3e6"/>
                <circle cx="31.25" cy="9" r="1.5" fill="#22d3e6"/>
              </svg>
              <span style={styles.logoText}>Thirst Metrics</span>
            </Link>
            <nav style={styles.nav}>
              <Link href="/dashboard" style={styles.navLink}>Dashboard</Link>
              <Link href="/customers" style={styles.navLinkActive}>Customers</Link>
              <Link href="/activities" style={styles.navLink}>Activities</Link>
              {(role === 'manager' || role === 'admin') && (
                <Link href="/analytics" style={styles.navLink}>Analytics</Link>
              )}
              {role === 'admin' && (
                <Link href="/admin" style={styles.navLink}>Admin</Link>
              )}
            </nav>
          </div>
          <div style={styles.navRight}>
            <span style={styles.userEmail}>{user.email}</span>
            <span style={styles.userRole}>{role}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={styles.scrollArea}>
        <div style={styles.container}>
          <Suspense fallback={<div style={styles.loading}>Loading customers...</div>}>
            <CustomerListClient
              initialPage={page}
              initialSearch={search}
              initialCounty={county}
              initialCity={city}
              initialSortBy={sortBy}
              initialSortOrder={sortOrder}
              initialMinRevenue={minRevenue}
              initialMonthsBack={monthsBack}
              limit={limit}
              offset={offset}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  navHeader: {
    background: 'linear-gradient(135deg, #042829 0%, #063a3c 50%, #021a1b 100%)',
    padding: '0 24px',
    flexShrink: 0,
  },
  navContent: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '64px',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  logoLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textDecoration: 'none',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'white',
  },
  nav: {
    display: 'flex',
    gap: '8px',
  },
  navLink: {
    padding: '8px 16px',
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    transition: 'all 0.2s',
  },
  navLinkActive: {
    padding: '8px 16px',
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.1)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userEmail: {
    color: 'white',
    fontSize: '14px',
  },
  userRole: {
    backgroundColor: 'rgba(34, 211, 230, 0.2)',
    color: '#22d3e6',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    textTransform: 'capitalize' as const,
  },
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '12px 24px',
    flexShrink: 0,
  },
  pageHeaderContent: {
    width: '100%',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  subtitle: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '2px',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
    minHeight: 0,
  },
  container: {
    padding: '24px',
    width: '100%',
  },
  loading: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#64748b',
  },
};
