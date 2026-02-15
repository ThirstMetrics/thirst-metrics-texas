/**
 * Customer List Page
 * Displays customers with sorting and filtering
 */

import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
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
              userId={user.id}
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
    height: 'calc(100vh - 64px)',
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
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
