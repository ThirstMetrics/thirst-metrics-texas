/**
 * Preferences Page
 * Placeholder for user preference settings (V2)
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function PreferencesPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const preferenceItems = [
    {
      title: 'Notification Settings',
      description: 'Configure email and push notifications for follow-ups, team updates, and weekly reports.',
      icon: '\u{1F514}',
    },
    {
      title: 'Default Filters',
      description: 'Set your default county, city, and revenue filters so your customer list loads exactly how you like it.',
      icon: '\u{1F50D}',
    },
    {
      title: 'Display Preferences',
      description: 'Choose between table or map view as your default, adjust date formats, and set your preferred currency display.',
      icon: '\u{1F3A8}',
    },
    {
      title: 'Activity Defaults',
      description: 'Pre-fill common fields on the activity form like activity type, outcome, and product interest.',
      icon: '\u{1F4CB}',
    },
  ];

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title}>Preferences</h1>
              <p style={styles.subtitle}>Customize your Thirst Metrics experience</p>
            </div>
            <span style={styles.badge}>Coming in V2</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.card}>
          <p style={styles.intro}>
            Personalize how Thirst Metrics works for you. These preference controls will let you
            tailor notifications, default views, and activity form behavior to match your workflow.
          </p>

          <div style={styles.grid}>
            {preferenceItems.map((item) => (
              <div key={item.title} style={styles.featureCard}>
                <div style={styles.featureIcon}>{item.icon}</div>
                <h3 style={styles.featureTitle}>{item.title}</h3>
                <p style={styles.featureDescription}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.backLinkWrapper}>
          <Link href="/dashboard" style={styles.backLink}>
            &larr; Back to Dashboard
          </Link>
        </div>
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
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
    gap: '12px',
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
  badge: {
    display: 'inline-block',
    background: 'rgba(34, 211, 230, 0.2)',
    color: '#22d3e6',
    fontSize: '13px',
    fontWeight: '600',
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid rgba(34, 211, 230, 0.4)',
  },
  content: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
  },
  intro: {
    fontSize: '15px',
    color: '#475569',
    lineHeight: '1.6',
    marginTop: 0,
    marginBottom: '28px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  featureCard: {
    background: '#f8fafc',
    borderRadius: '10px',
    padding: '24px',
    border: '1px solid #e2e8f0',
  },
  featureIcon: {
    fontSize: '28px',
    marginBottom: '12px',
  },
  featureTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#0f172a',
    margin: '0 0 8px 0',
  },
  featureDescription: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: '1.5',
    margin: 0,
  },
  backLinkWrapper: {
    marginTop: '24px',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#0d7377',
    textDecoration: 'none',
  },
};
