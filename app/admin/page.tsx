/**
 * Admin Page
 * Client component with dynamic import (ssr: false requires 'use client' in Next.js 15+)
 * Auth enforced by middleware
 */

'use client';

import dynamic from 'next/dynamic';
import PageContentWrapper from '@/components/page-content-wrapper';

const AdminClient = dynamic(() => import('@/components/admin-client'), {
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
      Loading admin portal...
    </div>
  ),
});

export default function AdminPage() {
  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.title}>Admin Portal</h1>
        </div>
      </div>

      {/* Content */}
      <PageContentWrapper>
        <AdminClient />
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
