/**
 * Customer Detail Client Component
 * Displays customer info, revenue charts, and activities
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';
import dynamic from 'next/dynamic';
import { CustomerRevenue, MonthlyRevenue } from '@/lib/data/beverage-receipts';
import { SalesActivity } from '@/lib/data/activities';
import RevenueChart from './revenue-chart';
import ActivityTimeline from './activity-timeline';
import { useIsMobile } from '@/lib/hooks/use-media-query';
import { ChartSkeleton, MapSkeleton } from './skeleton';
import ErrorFallback from './error-fallback';

// Dynamically import CustomerMap to avoid SSR issues with Mapbox
const CustomerMap = dynamic(() => import('./customer-map'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', borderRadius: '8px' }}>
      Loading map...
    </div>
  ),
});

type TimePeriod = 'all' | '3yr' | '2yr' | '1yr';

interface VisibleSeries {
  total: boolean;
  liquor: boolean;
  wine: boolean;
  beer: boolean;
}

interface CustomerDetailClientProps {
  customer: CustomerRevenue;
  monthlyRevenue: MonthlyRevenue[];
  activities: SalesActivity[];
  userId: string;
}

const TIME_PERIODS: { label: string; value: TimePeriod }[] = [
  { label: 'All', value: 'all' },
  { label: '3 yr', value: '3yr' },
  { label: '2 yr', value: '2yr' },
  { label: '1 yr', value: '1yr' },
];

const timePeriodMonths: Record<TimePeriod, number> = {
  'all': 120,
  '3yr': 36,
  '2yr': 24,
  '1yr': 12,
};

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',      // brand-500 (teal)
  primaryDark: '#042829',  // brand-900
  primaryLight: '#e6f5f5', // brand-50
  accent: '#22d3e6',       // accent-400 (cyan)
  hover: '#0a5f63',        // brand-600
};

// Customer coordinates for map
interface CustomerCoords {
  id: string;
  name: string;
  permit_number: string;
  lat: number;
  lng: number;
  address?: string;
}

export default function CustomerDetailClient(props: CustomerDetailClientProps) {
  const { customer, monthlyRevenue, userId } = props;
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activities, setActivities] = useState<SalesActivity[]>(props.activities);
  const isMobile = useIsMobile();

  // Refresh activities from API instead of full page reload
  const refreshActivities = async () => {
    try {
      const response = await fetch(`/api/activities?permitNumber=${customer.tabc_permit_number}`);
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Failed to refresh activities:', error);
    }
  };

  // Chart controls state
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('1yr');
  const [chartData, setChartData] = useState<MonthlyRevenue[]>(monthlyRevenue);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState<VisibleSeries>({
    total: true,
    liquor: true,
    wine: true,
    beer: true,
  });

  // Map state
  const [customerCoords, setCustomerCoords] = useState<CustomerCoords | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  // Function to fetch coordinates (can be used for retry)
  const fetchCoordinates = async () => {
    setMapLoading(true);
    setMapError(null);
    try {
      const response = await fetch(`/api/customers/coordinates?search=${encodeURIComponent(customer.tabc_permit_number)}&limit=1`);
      if (!response.ok) {
        throw new Error(`Failed to load map data (${response.status})`);
      }
      const data = await response.json();
      if (data.customers && data.customers.length > 0) {
        setCustomerCoords(data.customers[0]);
      }
    } catch (err) {
      console.error('Failed to fetch customer coordinates:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load map';
      setMapError(errorMessage);
    } finally {
      setMapLoading(false);
    }
  };

  // Fetch customer coordinates on mount
  useEffect(() => {
    fetchCoordinates();
  }, [customer.tabc_permit_number]);

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

  const handlePeriodChange = async (period: TimePeriod) => {
    setSelectedPeriod(period);
    setIsLoadingChart(true);
    setChartError(null);

    const months = timePeriodMonths[period];

    try {
      const response = await fetch(`/api/customers/${customer.tabc_permit_number}/revenue?months=${months}`);
      if (!response.ok) {
        throw new Error(`Failed to load chart data (${response.status})`);
      }
      const data = await response.json();
      setChartData(data);
    } catch (err) {
      console.error('Failed to fetch revenue data:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chart data';
      setChartError(errorMessage);
    } finally {
      setIsLoadingChart(false);
    }
  };

  const handleSeriesToggle = (series: keyof VisibleSeries) => {
    setVisibleSeries(prev => ({
      ...prev,
      [series]: !prev[series],
    }));
  };

  // County: always show name from Counties table; never show county code on screen
  const countyLabel = customer.location_county ?? null;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '12px' : '20px' }}>
      <div style={styles.header}>
        <Link href="/customers" style={styles.backLink}>
          ← Back to Customers
        </Link>
        <div style={{
          ...styles.headerContent,
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '12px' : '0'
        }}>
          <div style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'baseline',
            gap: isMobile ? '8px' : '16px',
            flexDirection: isMobile ? 'column' : 'row'
          }}>
            <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', margin: 0 }}>
              {customer.location_name || 'Unknown Customer'}
            </h1>
            <span style={{ fontSize: isMobile ? '12px' : '14px', color: '#6b7280' }}>
              {customer.tabc_permit_number}
            </span>
          </div>
          <button
            onClick={() => setShowActivityForm(!showActivityForm)}
            style={{
              ...styles.logActivityButton,
              width: isMobile ? '100%' : 'auto',
              minHeight: isMobile ? '44px' : 'auto'
            }}
          >
            {showActivityForm ? 'Cancel' : 'Log Activity'}
          </button>
        </div>
      </div>

      {/* Two-column: Customer Info (left) + Activities (right) */}
      <div style={{
        display: 'flex',
        gap: isMobile ? '16px' : '24px',
        marginTop: '20px',
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: 'wrap' as const
      }}>
        {/* LEFT: Customer Info */}
        <div style={{ flex: '1', minWidth: 280, maxWidth: isMobile ? '100%' : '50%' }}>
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

            {/* Embedded Map */}
            <div style={styles.mapSection}>
              {mapLoading ? (
                <MapSkeleton height={200} />
              ) : mapError ? (
                <div style={{ padding: '12px' }}>
                  <ErrorFallback
                    message={mapError}
                    onRetry={fetchCoordinates}
                    compact
                  />
                </div>
              ) : customerCoords ? (
                <CustomerMap
                  customers={[customerCoords]}
                  height="200px"
                  showPopups={false}
                  selectedCustomerId={customerCoords.id}
                />
              ) : (
                <div style={styles.mapPlaceholder}>
                  <span style={styles.mapPlaceholderIcon}>📍</span>
                  <span style={styles.mapPlaceholderText}>
                    No coordinates available
                  </span>
                  {customer.location_address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${customer.location_address}, ${customer.location_city || ''} ${customer.location_state || 'TX'} ${customer.location_zip || ''}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.mapLink}
                    >
                      View on Google Maps →
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Activities */}
        <div style={{ flex: '1', minWidth: 280, maxWidth: isMobile ? '100%' : '50%' }}>
          <div style={styles.infoCard}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', margin: 0 }}>Activities</h3>
            <ActivityTimeline
              activities={activities}
              permitNumber={customer.tabc_permit_number}
              userId={userId}
              onActivityCreated={() => {
                setShowActivityForm(false);
                refreshActivities();
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
        <div style={styles.chartHeader}>
          <h2 style={styles.sectionTitle}>Revenue History</h2>

          {/* Time Period Selector */}
          <div style={styles.timePeriodSelector}>
            <span style={styles.periodLabel}>Period:</span>
            {TIME_PERIODS.map((period) => (
              <button
                key={period.value}
                onClick={() => handlePeriodChange(period.value)}
                style={{
                  ...styles.periodButton,
                  ...(selectedPeriod === period.value ? styles.periodButtonActive : {}),
                }}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        {isLoadingChart ? (
          <ChartSkeleton height={300} />
        ) : chartError ? (
          <ErrorFallback
            title="Chart Loading Error"
            message={chartError}
            onRetry={() => handlePeriodChange(selectedPeriod)}
          />
        ) : (
          <RevenueChart
            data={chartData}
            visibleSeries={visibleSeries}
            onSeriesToggle={handleSeriesToggle}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    color: brandColors.primary,
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
    background: brandColors.primary,
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
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
    color: '#333',
  },
  timePeriodSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  periodLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginRight: '4px',
  },
  periodButton: {
    padding: '8px 14px',
    border: '2px solid #e5e7eb',
    borderRadius: '20px',
    backgroundColor: 'white',
    color: '#6b7280',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  periodButtonActive: {
    borderColor: brandColors.primary,
    backgroundColor: brandColors.primary,
    color: 'white',
  },
  loadingChart: {
    padding: '60px',
    textAlign: 'center',
    color: '#6b7280',
    fontSize: '14px',
  },
  // Map styles
  mapSection: {
    marginTop: '16px',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
  },
  mapLoadingSmall: {
    height: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: '14px',
  },
  mapPlaceholder: {
    height: '120px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    gap: '8px',
  },
  mapPlaceholderIcon: {
    fontSize: '24px',
    opacity: 0.5,
  },
  mapPlaceholderText: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  mapLink: {
    fontSize: '13px',
    color: brandColors.primary,
    textDecoration: 'none',
    fontWeight: '500',
  },
};
