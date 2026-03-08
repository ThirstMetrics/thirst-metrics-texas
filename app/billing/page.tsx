/**
 * Billing Page
 * Shows subscription status, plan tiers, and manage/subscribe actions.
 * Client component — calls /api/stripe/* endpoints for Checkout and Portal.
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface SubscriptionInfo {
  status: string;
  seatCount: number;
  tierName: string | null;
  pricePerSeat: number | null;
  trialEndsAt: string | null;
  trialUsed: boolean;
  hasPaymentMethod: boolean;
}

interface SubResponse {
  hasOrg: boolean;
  subscription: SubscriptionInfo | null;
}

const tiers = [
  { name: 'Starter', price: 49, seats: '1-3 seats', features: ['Full CRM access', 'GPS verification', 'Photo + OCR', 'Revenue analytics'] },
  { name: 'Growth', price: 39, seats: '4-10 seats', features: ['Everything in Starter', 'Volume discount', 'Priority support'] },
  { name: 'Enterprise', price: 29, seats: '11+ seats', features: ['Everything in Growth', 'Best per-seat rate', 'Dedicated onboarding'] },
];

export default function BillingPageWrapper() {
  return (
    <Suspense fallback={
      <div style={styles.container}>
        <div style={styles.pageHeader}>
          <div style={styles.pageHeaderContent}>
            <h1 style={styles.title}>Billing</h1>
            <p style={styles.subtitle}>Loading...</p>
          </div>
        </div>
      </div>
    }>
      <BillingPage />
    </Suspense>
  );
}

function BillingPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<SubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [seatCount, setSeatCount] = useState(1);

  const success = searchParams.get('success');
  const canceled = searchParams.get('canceled');

  useEffect(() => {
    fetch('/api/stripe/subscription')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.subscription?.seatCount) setSeatCount(d.subscription.seatCount);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatCount }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleManageBilling() {
    setActionLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open billing portal');
    } finally {
      setActionLoading(false);
    }
  }

  const sub = data?.subscription;
  const isActive = sub && ['active', 'trialing', 'past_due'].includes(sub.status);

  // Determine which tier label to highlight based on seat count selector
  const selectedTierName = seatCount >= 11 ? 'Enterprise' : seatCount >= 4 ? 'Growth' : 'Starter';

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.pageHeader}>
          <div style={styles.pageHeaderContent}>
            <h1 style={styles.title}>Billing</h1>
            <p style={styles.subtitle}>Loading subscription details...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.title}>Billing</h1>
          <p style={styles.subtitle}>Manage your subscription and payment method</p>
        </div>
      </div>

      <div style={styles.content}>
        {/* Success/Cancel banners */}
        {success && (
          <div style={styles.successBanner}>
            Subscription activated! You now have full access to Thirst Metrics.
          </div>
        )}
        {canceled && (
          <div style={styles.cancelBanner}>
            Checkout was canceled. You can try again whenever you're ready.
          </div>
        )}

        {/* Past due warning */}
        {sub?.status === 'past_due' && (
          <div style={styles.warningBanner}>
            Your payment is past due. Please update your payment method to avoid losing access.
          </div>
        )}

        {/* Current subscription status */}
        {isActive && sub ? (
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Current Plan</h2>
            <div style={styles.planInfo}>
              <div>
                <div style={styles.planName}>{sub.tierName || 'Active'} Plan</div>
                <div style={styles.planDetail}>
                  {sub.seatCount} seat{sub.seatCount !== 1 ? 's' : ''}
                  {sub.pricePerSeat ? ` \u00d7 $${sub.pricePerSeat}/mo` : ''}
                </div>
                {sub.status === 'trialing' && sub.trialEndsAt && (
                  <div style={styles.trialNote}>
                    Free trial ends {new Date(sub.trialEndsAt).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div style={{ ...styles.statusBadge, ...statusStyle(sub.status) }}>
                {statusLabel(sub.status)}
              </div>
            </div>

            <button
              onClick={handleManageBilling}
              disabled={actionLoading}
              style={styles.secondaryButton}
            >
              {actionLoading ? 'Opening...' : 'Manage Billing'}
            </button>
          </div>
        ) : (
          /* Subscribe flow */
          <div style={styles.card}>
            <h2 style={styles.sectionTitle}>Choose Your Plan</h2>

            {/* Seat selector */}
            <div style={styles.seatSelector}>
              <label style={styles.seatLabel}>How many seats do you need?</label>
              <div style={styles.seatInputRow}>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={seatCount}
                  onChange={(e) => setSeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                  style={styles.seatInput}
                />
                <span style={styles.seatPrice}>
                  = ${seatCount * (seatCount >= 11 ? 29 : seatCount >= 4 ? 39 : 49)}/mo
                </span>
              </div>
            </div>

            {/* Tier cards */}
            <div style={styles.tierGrid}>
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    ...styles.tierCard,
                    ...(selectedTierName === tier.name ? styles.tierCardActive : {}),
                  }}
                >
                  <div style={styles.tierName}>{tier.name}</div>
                  <div style={styles.tierPrice}>${tier.price}<span style={styles.tierUnit}>/seat/mo</span></div>
                  <div style={styles.tierSeats}>{tier.seats}</div>
                  <ul style={styles.tierFeatures}>
                    {tier.features.map((f) => (
                      <li key={f} style={styles.tierFeature}>{f}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <button
              onClick={handleSubscribe}
              disabled={actionLoading}
              style={styles.primaryButton}
            >
              {actionLoading ? 'Starting checkout...' : `Subscribe \u2014 ${seatCount} seat${seatCount !== 1 ? 's' : ''}`}
            </button>

            <p style={styles.achNote}>
              Pay by bank transfer (ACH) for lower fees, or use a credit/debit card.
              {!sub?.trialUsed && ' Includes a 14-day free trial.'}
            </p>
          </div>
        )}

        <div style={styles.backLinkWrapper}>
          <Link href="/dashboard" style={styles.backLink}>
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active';
    case 'trialing': return 'Trial';
    case 'past_due': return 'Past Due';
    case 'canceled': return 'Canceled';
    case 'incomplete': return 'Pending';
    default: return status;
  }
}

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'active': return { background: '#dcfce7', color: '#166534' };
    case 'trialing': return { background: '#e0f2fe', color: '#075985' };
    case 'past_due': return { background: '#fef9c3', color: '#854d0e' };
    default: return { background: '#f1f5f9', color: '#475569' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', background: '#f8fafc' },
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '24px',
  },
  pageHeaderContent: { maxWidth: '1400px', margin: '0 auto' },
  title: { fontSize: '28px', fontWeight: '700', color: 'white', margin: 0 },
  subtitle: { fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginTop: '4px' },
  content: {
    padding: '24px', maxWidth: '900px', margin: '0 auto',
    display: 'flex', flexDirection: 'column' as const, gap: '20px',
  },
  successBanner: {
    background: '#dcfce7', color: '#166534', padding: '16px',
    borderRadius: '8px', border: '1px solid #bbf7d0', fontWeight: '500',
  },
  cancelBanner: {
    background: '#fef9c3', color: '#854d0e', padding: '16px',
    borderRadius: '8px', border: '1px solid #fde68a', fontWeight: '500',
  },
  warningBanner: {
    background: '#fef3c7', color: '#92400e', padding: '16px',
    borderRadius: '8px', border: '1px solid #fcd34d', fontWeight: '600',
  },
  card: {
    background: 'white', borderRadius: '12px', padding: '32px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
  },
  sectionTitle: { fontSize: '18px', fontWeight: '600', color: '#0f172a', margin: '0 0 20px 0' },
  planInfo: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '24px', flexWrap: 'wrap' as const, gap: '12px',
  },
  planName: { fontSize: '20px', fontWeight: '700', color: '#0f172a' },
  planDetail: { fontSize: '15px', color: '#475569', marginTop: '4px' },
  trialNote: { fontSize: '13px', color: '#0d7377', marginTop: '6px', fontWeight: '500' },
  statusBadge: {
    padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '600',
  },
  seatSelector: { marginBottom: '24px' },
  seatLabel: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#334155', marginBottom: '8px' },
  seatInputRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  seatInput: {
    width: '80px', padding: '8px 12px', fontSize: '16px', borderRadius: '8px',
    border: '1px solid #cbd5e1', textAlign: 'center' as const,
  },
  seatPrice: { fontSize: '18px', fontWeight: '700', color: '#0d7377' },
  tierGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px', marginBottom: '24px',
  },
  tierCard: {
    padding: '20px', borderRadius: '10px', border: '2px solid #e2e8f0',
    background: '#f8fafc', transition: 'border-color 0.2s',
  },
  tierCardActive: { borderColor: '#0d7377', background: '#f0fdfa' },
  tierName: { fontSize: '16px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' },
  tierPrice: { fontSize: '24px', fontWeight: '700', color: '#0d7377' },
  tierUnit: { fontSize: '13px', fontWeight: '400', color: '#64748b' },
  tierSeats: { fontSize: '13px', color: '#64748b', marginBottom: '12px' },
  tierFeatures: { listStyle: 'none', padding: 0, margin: 0 },
  tierFeature: {
    fontSize: '13px', color: '#334155', padding: '3px 0',
    borderTop: '1px solid #e2e8f0',
  },
  primaryButton: {
    width: '100%', padding: '14px', fontSize: '16px', fontWeight: '600',
    color: 'white', background: '#0d7377', border: 'none', borderRadius: '10px',
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '12px 24px', fontSize: '14px', fontWeight: '600',
    color: '#0d7377', background: 'white', border: '2px solid #0d7377',
    borderRadius: '10px', cursor: 'pointer',
  },
  achNote: {
    fontSize: '13px', color: '#64748b', textAlign: 'center' as const, marginTop: '12px',
  },
  backLinkWrapper: { marginTop: '4px' },
  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontSize: '14px', fontWeight: '500', color: '#0d7377', textDecoration: 'none',
  },
};
