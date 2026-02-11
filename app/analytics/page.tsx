/**
 * Analytics Page - Coming Soon
 */

'use client';

import Link from 'next/link';

const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

export default function AnalyticsPage() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke={brandColors.primary}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
            <line x1="3" y1="20" x2="21" y2="20" />
          </svg>
        </div>

        <h1 style={styles.title}>Analytics</h1>

        <span style={styles.badge}>Coming Soon</span>

        <p style={styles.description}>
          Advanced reporting, trend analysis, and data visualizations to drive your sales strategy.
        </p>

        <p style={styles.subtext}>
          This feature is currently in development and will be available in a future update.
        </p>

        <Link href="/dashboard" style={styles.backLink}>
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: `linear-gradient(135deg, ${brandColors.primary} 0%, ${brandColors.primaryDark} 100%)`,
  },
  card: {
    width: '100%',
    maxWidth: '480px',
    background: 'white',
    borderRadius: '16px',
    padding: '48px 40px',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
    textAlign: 'center',
  },
  iconContainer: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: brandColors.primaryDark,
    margin: '0 0 16px 0',
  },
  badge: {
    display: 'inline-block',
    padding: '6px 16px',
    background: brandColors.primaryLight,
    color: brandColors.primary,
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '24px',
  },
  description: {
    fontSize: '18px',
    color: '#475569',
    lineHeight: '1.6',
    margin: '0 0 16px 0',
  },
  subtext: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 32px 0',
  },
  backLink: {
    display: 'inline-block',
    color: brandColors.primary,
    fontSize: '16px',
    fontWeight: '500',
    textDecoration: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    backgroundColor: brandColors.primaryLight,
    transition: 'all 0.2s',
  },
};
