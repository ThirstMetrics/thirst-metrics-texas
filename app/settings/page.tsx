/**
 * Settings Page
 * Placeholder for account and team settings (V2)
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const settingsItems = [
    {
      title: 'Account Information',
      description: 'Update your name, email address, phone number, and profile photo.',
      icon: '\u{1F464}',
    },
    {
      title: 'Password & Security',
      description: 'Change your password, enable two-factor authentication, and manage active sessions.',
      icon: '\u{1F512}',
    },
    {
      title: 'Team Settings',
      description: 'Manage team members, assign territories, and set role permissions. Available for managers and admins.',
      icon: '\u{1F465}',
      managerOnly: true,
    },
    {
      title: 'Territory Configuration',
      description: 'Define and edit sales territories by county or ZIP code. Assign reps to territories.',
      icon: '\u{1F5FA}\u{FE0F}',
      managerOnly: true,
    },
    {
      title: 'Data & Privacy',
      description: 'Export your activity data, manage data retention, and review privacy settings.',
      icon: '\u{1F4BE}',
    },
    {
      title: 'Integrations',
      description: 'Connect Thirst Metrics with your CRM, email, and calendar tools.',
      icon: '\u{1F517}',
    },
  ];

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title}>Settings</h1>
              <p style={styles.subtitle}>Manage your account and team configuration</p>
            </div>
            <span style={styles.badge}>Coming in V2</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.card}>
          <p style={styles.intro}>
            Account and team management settings are on the way. You will be able to update your profile,
            manage security, configure territories, and control team access all from this page.
          </p>

          <div style={styles.grid}>
            {settingsItems.map((item) => (
              <div key={item.title} style={styles.featureCard}>
                <div style={styles.featureHeader}>
                  <div style={styles.featureIcon}>{item.icon}</div>
                  {'managerOnly' in item && item.managerOnly && (
                    <span style={styles.roleBadge}>Manager+</span>
                  )}
                </div>
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
  featureHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '12px',
  },
  featureIcon: {
    fontSize: '28px',
  },
  roleBadge: {
    display: 'inline-block',
    background: '#e6f5f5',
    color: '#0d7377',
    fontSize: '11px',
    fontWeight: '600',
    padding: '3px 8px',
    borderRadius: '10px',
    border: '1px solid #b2dfdb',
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
