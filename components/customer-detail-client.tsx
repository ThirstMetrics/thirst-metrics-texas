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
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link href="/customers" style={styles.backLink}>
          ← Back to Customers
        </Link>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>{customer.location_name || 'Unknown Customer'}</h1>
            <div style={styles.subtitle}>
              Permit: {customer.tabc_permit_number}
            </div>
          </div>
        <button
          onClick={() => setShowActivityForm(!showActivityForm)}
          style={styles.logActivityButton}
        >
          {showActivityForm ? 'Cancel' : 'Log Activity'}
        </button>
        </div>
      </div>
      
      {/* Customer Info */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Customer Information</h2>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}>
            <strong>Total Revenue:</strong> {formatCurrency(customer.total_revenue)}
          </div>
          <div style={styles.infoItem}>
            <strong>Location:</strong>
            <div style={styles.address}>
              {customer.location_address && <div>{customer.location_address}</div>}
              {customer.location_city && customer.location_state && (
                <div>{customer.location_city}, {customer.location_state}</div>
              )}
              {customer.location_zip && <div>{customer.location_zip}</div>}
              {customer.location_county && <div>{customer.location_county}</div>}
            </div>
          </div>
          <div style={styles.infoItem}>
            <strong>Last Receipt:</strong> {formatDate(customer.last_receipt_date)}
          </div>
          <div style={styles.infoItem}>
            <strong>Receipt Months:</strong> {customer.receipt_count}
          </div>
        </div>
      </div>
      
      {/* Revenue Chart */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Revenue History (Last 12 Months)</h2>
        <RevenueChart data={monthlyRevenue} />
      </div>
      
      {/* Activities */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Activities</h2>
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
        />
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
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
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
  section: {
    background: 'white',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#333',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  infoItem: {
    fontSize: '14px',
    color: '#666',
  },
  address: {
    marginTop: '4px',
    fontSize: '14px',
    color: '#333',
  },
};
