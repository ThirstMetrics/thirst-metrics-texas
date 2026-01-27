/**
 * Customer List Page
 * Displays customers with sorting and filtering
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import CustomerListClient from '@/components/customer-list-client';

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
  
  const limit = 50;
  const offset = (page - 1) * limit;
  
  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <h1 style={styles.title}>Customers</h1>
      </div>
      <div style={styles.scrollArea}>
        <div style={styles.container}>
          <Suspense fallback={<div>Loading customers...</div>}>
            <CustomerListClient
              initialPage={page}
              initialSearch={search}
              initialCounty={county}
              initialCity={city}
              initialSortBy={sortBy}
              initialSortOrder={sortOrder}
              initialMinRevenue={minRevenue}
              limit={limit}
              offset={offset}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  header: {
    flexShrink: 0,
    padding: '20px 40px 0',
    maxWidth: '95vw',
    margin: '0 auto',
    width: '100%',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
  container: {
    padding: '20px 40px',
    maxWidth: '95vw',
    margin: '0 auto',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
  },
};
