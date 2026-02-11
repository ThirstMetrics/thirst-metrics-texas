/**
 * Activities Page - Coming Soon
 */

'use client';

import Link from 'next/link';

const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

export default function ActivitiesPage() {
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>

        <h1 style={styles.title}>Activities</h1>

        <span style={styles.badge}>Coming Soon</span>

        <p style={styles.description}>
          Track sales activities, log customer interactions, and manage your pipeline.
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
