/**
 * Customer Detail Client Component
 * Displays customer info, revenue charts, and activities
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';
import { CustomerRevenue, MonthlyRevenue } from '@/lib/data/beverage-receipts';
import { SalesActivity } from '@/lib/data/activities';
import RevenueChart from './revenue-chart';
import ActivityTimeline from './activity-timeline';

interface CustomerDetailClientProps {
  customer: CustomerRevenue;
  monthlyRevenue: MonthlyRevenue[];
  activities: SalesActivity[];
  userId: string;
}

export default function CustomerDetailClient(props: CustomerDetailClientProps) {
  const { customer, monthlyRevenue, activities, userId } = props;
  const [showActivityForm, setShowActivityForm] = useState(false);
  
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '$0';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'N/A';
    try {
      let date = parseISO(dateStr);
      if (!isValid(date)) {
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return 'Invalid Date';
        }
      }
      return format(date, 'MMMM yyyy');
    } catch (error) {
      console.error('Date formatting error:', error, dateStr);
      return 'Invalid Date';
    }
  };
  
  // County: always show name from Counties table; never show county code on screen
  const countyLabel = customer.location_county ?? null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link href="/customers" style={styles.backLink}>
          ← Back to Customers
        </Link>
        <div style={styles.headerContent}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>
              {customer.location_name || 'Unknown Customer'}
            </h1>
            <span style={{ fontSize: '14px', color: '#6b7280' }}>
              {customer.tabc_permit_number}
            </span>
          </div>
          <button
            onClick={() => setShowActivityForm(!showActivityForm)}
            style={styles.logActivityButton}
          >
            {showActivityForm ? 'Cancel' : 'Log Activity'}
          </button>
        </div>
      </div>

      {/* Two-column: Customer Info (left) + Activities (right) */}
      <div style={{ display: 'flex', gap: '24px', marginTop: '20px', flexWrap: 'wrap' as const }}>
        {/* LEFT: Customer Info */}
        <div style={{ flex: '1', minWidth: 280, maxWidth: '50%' }}>
          <div style={styles.infoCard}>
            <div style={{ display: 'flex', gap: '32px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
              <div>
                <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>Total Revenue</span>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{formatCurrency(customer.total_revenue)}</div>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>Last Receipt</span>
                <div style={{ fontSize: '14px' }}>{formatDate(customer.last_receipt_date)}</div>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#6b7280', display: 'block' }}>Receipt Months</span>
                <div style={{ fontSize: '14px' }}>{customer.receipt_count}</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', lineHeight: 1.5 }}>
              {customer.location_address && (
                <div style={{ whiteSpace: 'nowrap' }}>{customer.location_address}</div>
              )}
              {(customer.location_city || customer.location_state || customer.location_zip) && (
                <div style={{ whiteSpace: 'nowrap' }}>
                  {[customer.location_city, customer.location_state].filter(Boolean).join(', ')}
                  {customer.location_zip ? ` ${customer.location_zip}` : ''}
                </div>
              )}
              {countyLabel && (
                <div style={{ whiteSpace: 'nowrap' }}>County: {countyLabel}</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Activities */}
        <div style={{ flex: '1', minWidth: 280, maxWidth: '50%' }}>
          <div style={styles.infoCard}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', margin: 0 }}>Activities</h3>
            <ActivityTimeline
              activities={activities}
              permitNumber={customer.tabc_permit_number}
              userId={userId}
              onActivityCreated={() => {
                setShowActivityForm(false);
                window.location.reload();
              }}
              showForm={showActivityForm}
              onCloseForm={() => setShowActivityForm(false)}
              onOpenForm={() => setShowActivityForm(true)}
            />
          </div>
        </div>
      </div>

      {/* Charts - full width below two-column section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Revenue History (Last 12 Months)</h2>
        <RevenueChart data={monthlyRevenue} />
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
  },
  backLink: {
    display: 'inline-block',
    marginBottom: '16px',
    color: '#667eea',
    textDecoration: 'none',
    fontSize: '14px',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logActivityButton: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  infoCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: '#fff',
  },
  section: {
    background: 'white',
    borderRadius: '8px',
    padding: '24px',
    marginTop: '24px',
    marginBottom: '24px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#333',
  },
};
