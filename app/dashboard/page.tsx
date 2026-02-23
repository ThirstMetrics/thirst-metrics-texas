/**
 * Dashboard Page
 * Main dashboard for authenticated users
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import DashboardClient from '@/components/dashboard-client';
import PageContentWrapper from '@/components/page-content-wrapper';

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',      // brand-500 (teal)
  primaryDark: '#042829',  // brand-900
  primaryLight: '#e6f5f5', // brand-50
  accent: '#22d3e6',       // accent-400 (cyan)
  gradient: 'linear-gradient(135deg, #042829 0%, #063a3c 50%, #021a1b 100%)',
};

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.title}>Dashboard</h1>
        </div>
      </div>

      {/* Content */}
      <PageContentWrapper>
        <DashboardClient />
      </PageContentWrapper>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#f8fafc',
  },
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '10px 16px',
  },
  pageHeaderContent: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
};
