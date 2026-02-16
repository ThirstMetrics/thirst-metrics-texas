/**
 * Billing Page
 * Placeholder for subscription and payment management (launches April 1, 2026)
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function BillingPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const planFeatures = [
    'Unlimited customer views and activity logging',
    'GPS-verified visit tracking',
    'Photo uploads with OCR text extraction',
    'Revenue analytics and trend charts',
    'Priority scoring for all Texas locations',
    'Mobile-optimized map view',
  ];

  const billingItems = [
    {
      title: 'Subscription Plan',
      description: 'View your current plan, compare tiers, and upgrade or downgrade as your team grows.',
      icon: '\u{1F4E6}',
    },
    {
      title: 'Payment Method',
      description: 'Add or update your credit card, set up automatic payments, and manage billing contacts.',
      icon: '\u{1F4B3}',
    },
    {
      title: 'Invoices & Receipts',
      description: 'Download past invoices, view payment history, and access receipts for your records.',
      icon: '\u{1F4C4}',
    },
    {
      title: 'Team Seats',
      description: 'Manage the number of seats on your plan. Add seats for new reps or reduce when team changes.',
      icon: '\u{1F4BA}',
    },
  ];

  return (
    <div style={styles.container}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <div style={styles.headerRow}>
            <div>
              <h1 style={styles.title}>Billing</h1>
              <p style={styles.subtitle}>Subscription management and payment details</p>
            </div>
            <span style={styles.badge}>Launching April 1, 2026</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* Current Status Banner */}
        <div style={styles.statusBanner}>
          <div style={styles.statusIcon}>{'\u{2728}'}</div>
          <div style={styles.statusText}>
            <strong style={styles.statusTitle}>You are on the Free Beta</strong>
            <p style={styles.statusDescription}>
              Enjoy full access to all features during the beta period. Paid subscriptions launch
              on April 1, 2026. You will be notified before any charges apply.
            </p>
          </div>
        </div>

        {/* What's Included */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>What's Included in Your Beta Access</h2>
          <div style={styles.featureList}>
            {planFeatures.map((feature) => (
              <div key={feature} style={styles.featureRow}>
                <span style={styles.checkmark}>{'\u2713'}</span>
                <span style={styles.featureText}>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Billing Features Coming Soon */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>Billing Features Coming Soon</h2>
          <p style={styles.intro}>
            When paid subscriptions launch, you will be able to manage every aspect of your
            account billing right here.
          </p>

          <div style={styles.grid}>
            {billingItems.map((item) => (
              <div key={item.title} style={styles.featureCard}>
                <div style={styles.featureCardIcon}>{item.icon}</div>
                <h3 style={styles.featureCardTitle}>{item.title}</h3>
                <p style={styles.featureCardDescription}>{item.description}</p>
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
    whiteSpace: 'nowrap' as const,
  },
  content: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  statusBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    background: 'linear-gradient(135deg, #e6f5f5 0%, #f0fdfa 100%)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #b2dfdb',
  },
  statusIcon: {
    fontSize: '32px',
    flexShrink: 0,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#042829',
  },
  statusDescription: {
    fontSize: '14px',
    color: '#475569',
    lineHeight: '1.5',
    marginTop: '6px',
    marginBottom: 0,
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '32px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#0f172a',
    margin: '0 0 20px 0',
  },
  intro: {
    fontSize: '15px',
    color: '#475569',
    lineHeight: '1.6',
    marginTop: 0,
    marginBottom: '24px',
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  featureRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  checkmark: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: '#0d7377',
    color: 'white',
    fontSize: '12px',
    fontWeight: '700',
    flexShrink: 0,
  },
  featureText: {
    fontSize: '14px',
    color: '#334155',
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
  featureCardIcon: {
    fontSize: '28px',
    marginBottom: '12px',
  },
  featureCardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#0f172a',
    margin: '0 0 8px 0',
  },
  featureCardDescription: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: '1.5',
    margin: 0,
  },
  backLinkWrapper: {
    marginTop: '4px',
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
