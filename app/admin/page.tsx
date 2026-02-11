/**
 * Admin Page - Coming Soon
 */

'use client';

import Link from 'next/link';

const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

export default function AdminPage() {
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>

        <h1 style={styles.title}>Admin</h1>

        <span style={styles.badge}>Coming Soon</span>

        <p style={styles.description}>
          User management, system settings, and configuration options for your organization.
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
