'use client';

import React from 'react';

interface ErrorFallbackProps {
  message?: string;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}

/**
 * Reusable inline error display component
 * For use within client components to show error states
 */
export default function ErrorFallback({
  message = 'An error occurred',
  onRetry,
  title,
  compact = false,
}: ErrorFallbackProps) {
  if (compact) {
    return (
      <div style={styles.compactContainer}>
        <span style={styles.compactIcon}>!</span>
        <span style={styles.compactMessage}>{message}</span>
        {onRetry && (
          <button onClick={onRetry} style={styles.compactRetryButton}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.iconWrapper}>
          <span style={styles.icon}>!</span>
        </div>
        {title && <h3 style={styles.title}>{title}</h3>}
        <p style={styles.message}>{message}</p>
        {onRetry && (
          <button onClick={onRetry} style={styles.retryButton}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Inline error message for form fields or small areas
 */
export function InlineError({ message }: { message: string }) {
  return (
    <div style={styles.inlineContainer}>
      <span style={styles.inlineIcon}>!</span>
      <span style={styles.inlineMessage}>{message}</span>
    </div>
  );
}

/**
 * Error banner for top of page notifications
 */
export function ErrorBanner({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  return (
    <div style={styles.bannerContainer}>
      <div style={styles.bannerContent}>
        <span style={styles.bannerIcon}>!</span>
        <span style={styles.bannerMessage}>{message}</span>
      </div>
      <div style={styles.bannerActions}>
        {onRetry && (
          <button onClick={onRetry} style={styles.bannerRetryButton}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} style={styles.bannerDismissButton}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // Standard error fallback
  container: {
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '24px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  iconWrapper: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#fecaca',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  icon: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#991b1b',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#991b1b',
    margin: '0 0 8px 0',
  },
  message: {
    fontSize: '14px',
    color: '#991b1b',
    margin: '0 0 16px 0',
    lineHeight: 1.5,
  },
  retryButton: {
    padding: '10px 20px',
    backgroundColor: '#991b1b',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },

  // Compact error fallback
  compactContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    padding: '8px 12px',
  },
  compactIcon: {
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: '#fecaca',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
    color: '#991b1b',
    flexShrink: 0,
  },
  compactMessage: {
    fontSize: '13px',
    color: '#991b1b',
    flex: 1,
  },
  compactRetryButton: {
    padding: '4px 10px',
    backgroundColor: '#991b1b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    flexShrink: 0,
  },

  // Inline error
  inlineContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
  },
  inlineIcon: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: '#fecaca',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#991b1b',
    flexShrink: 0,
  },
  inlineMessage: {
    fontSize: '12px',
    color: '#991b1b',
  },

  // Error banner
  bannerContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  bannerIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#fecaca',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#991b1b',
    flexShrink: 0,
  },
  bannerMessage: {
    fontSize: '14px',
    color: '#991b1b',
  },
  bannerActions: {
    display: 'flex',
    gap: '8px',
  },
  bannerRetryButton: {
    padding: '6px 14px',
    backgroundColor: '#991b1b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  bannerDismissButton: {
    padding: '6px 14px',
    backgroundColor: 'transparent',
    color: '#991b1b',
    border: '1px solid #991b1b',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};
