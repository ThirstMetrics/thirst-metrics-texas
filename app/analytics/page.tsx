/**
 * Analytics Page
 * Server component that checks auth and renders the analytics dashboard
 * Accessible to manager and admin roles
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with Recharts
const AnalyticsClient = dynamic(() => import('@/components/analytics-client'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #0d7377',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 16px',
      }} />
      Loading analytics...
    </div>
  ),
});

export default async function AnalyticsPage() {
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
          <h1 style={styles.title}>Analytics</h1>
          <p style={styles.subtitle}>Revenue trends, market insights, and performance tracking.</p>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <AnalyticsClient />
      </div>
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
    padding: '24px',
  },
  pageHeaderContent: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '4px',
  },
  content: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
};
