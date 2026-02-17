'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  hover: '#0a5f63',
};

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>!</span>
        </div>
        <h1 style={styles.title}>Something went wrong</h1>
        <p style={styles.subtitle}>
          We encountered an unexpected error. Please try again or return to the dashboard.
        </p>

        {error.message && (
          <div style={styles.errorDetails}>
            <p style={styles.errorLabel}>Error Details:</p>
            <code style={styles.errorMessage}>{error.message}</code>
            {error.digest && (
              <p style={styles.errorDigest}>Digest: {error.digest}</p>
            )}
          </div>
        )}

        <div style={styles.actions}>
          <button onClick={reset} style={styles.primaryButton}>
            Try again
          </button>
          <Link href="/dashboard" style={styles.secondaryButton}>
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    backgroundColor: '#f8fafc',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '40px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.08)',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#fef2f2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 24px',
    border: '3px solid #fecaca',
  },
  icon: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#dc2626',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: brandColors.primaryDark,
    margin: '0 0 12px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#64748b',
    lineHeight: 1.5,
    margin: '0 0 24px 0',
  },
  errorDetails: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    textAlign: 'left',
  },
  errorLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#991b1b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '0 0 8px 0',
  },
  errorMessage: {
    fontSize: '13px',
    color: '#b91c1c',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    display: 'block',
  },
  errorDigest: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '8px',
    marginBottom: 0,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '12px 24px',
    backgroundColor: brandColors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  secondaryButton: {
    padding: '12px 24px',
    backgroundColor: 'white',
    color: brandColors.primary,
    border: `2px solid ${brandColors.primary}`,
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    textDecoration: 'none',
    transition: 'all 0.2s',
  },
};
