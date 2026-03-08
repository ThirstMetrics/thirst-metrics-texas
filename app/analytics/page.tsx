/**
 * Analytics Page
 * Client component with dynamic Recharts import (ssr: false requires 'use client' in Next.js 15+)
 * Auth enforced by middleware
 */

'use client';

import dynamic from 'next/dynamic';

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

export default function AnalyticsPage() {
  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.title}>Analytics</h1>
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
  content: {
    padding: '16px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
};
