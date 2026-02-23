/**
 * Activities Page
 * Server component that checks auth and renders the activities client
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import ActivitiesClient from '@/components/activities-client';
import PageContentWrapper from '@/components/page-content-wrapper';

export default async function ActivitiesPage() {
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
          <h1 style={styles.title}>My Activities</h1>
        </div>
      </div>

      {/* Content */}
      <PageContentWrapper>
        <ActivitiesClient />
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
