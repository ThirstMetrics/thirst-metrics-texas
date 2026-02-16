/**
 * Dashboard Client Component
 * Displays summary cards, quick actions, and recent activity feed
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DashboardStats {
  totalCustomers: number;
  recentActivityCount: number;
  upcomingFollowupsCount: number;
  topCustomer: {
    permit: string;
    name: string;
    revenue: number;
  } | null;
}

interface Activity {
  id: string;
  tabc_permit_number: string;
  activity_type: string;
  activity_date: string;
  outcome: string | null;
  notes: string | null;
  contact_name: string | null;
  next_followup_date: string | null;
  created_at: string;
}

interface DashboardData {
  stats: DashboardStats;
  recentActivities: Activity[];
  upcomingFollowups: Activity[];
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'visit': return '🏢';
      case 'call': return '📞';
      case 'email': return '📧';
      case 'note': return '📝';
      default: return '📋';
    }
  };

  const getOutcomeColor = (outcome: string | null) => {
    switch (outcome) {
      case 'positive': return '#10b981';
      case 'neutral': return '#6b7280';
      case 'negative': return '#ef4444';
      case 'no_contact': return '#f59e0b';
      default: return '#9ca3af';
    }
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>Error: {error}</p>
        <button onClick={fetchDashboardData} style={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Compute activity type breakdown from recent activities
  const activityTypeCounts: Record<string, number> = {};
  const outcomeCounts: Record<string, number> = {};
  data.recentActivities.forEach((a) => {
    activityTypeCounts[a.activity_type] = (activityTypeCounts[a.activity_type] || 0) + 1;
    if (a.outcome) {
      outcomeCounts[a.outcome] = (outcomeCounts[a.outcome] || 0) + 1;
    }
  });

  const activityTypeLabels: Record<string, string> = {
    visit: 'Visits',
    call: 'Calls',
    email: 'Emails',
    note: 'Notes',
  };

  const outcomeLabels: Record<string, string> = {
    positive: 'Positive',
    neutral: 'Neutral',
    negative: 'Negative',
    no_contact: 'No Contact',
  };

  const outcomeColors: Record<string, string> = {
    positive: '#10b981',
    neutral: '#6b7280',
    negative: '#ef4444',
    no_contact: '#f59e0b',
  };

  const totalActivities = data.recentActivities.length;
  const totalOutcomes = Object.values(outcomeCounts).reduce((s, v) => s + v, 0);

  return (
    <div style={styles.container}>
      {/* Summary Cards */}
      <div style={styles.cardsGrid}>
        <div style={styles.card}>
          <div style={styles.cardIcon}>🏪</div>
          <div style={styles.cardContent}>
            <div style={styles.cardValue}>{formatNumber(data.stats.totalCustomers)}</div>
            <div style={styles.cardLabel}>Total Customers</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIcon}>📊</div>
          <div style={styles.cardContent}>
            <div style={styles.cardValue}>{data.stats.recentActivityCount}</div>
            <div style={styles.cardLabel}>Activities (7 days)</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardIcon}>📅</div>
          <div style={styles.cardContent}>
            <div style={styles.cardValue}>{data.stats.upcomingFollowupsCount}</div>
            <div style={styles.cardLabel}>Upcoming Follow-ups</div>
          </div>
        </div>

        {data.stats.topCustomer && (
          <div style={styles.card}>
            <div style={styles.cardIcon}>🏆</div>
            <div style={styles.cardContent}>
              <div style={styles.cardValueSmall}>
                {formatCurrency(data.stats.topCustomer.revenue)}
              </div>
              <div style={styles.cardLabel}>Top Customer Revenue</div>
              <div style={styles.cardSubtext}>
                {data.stats.topCustomer.name?.substring(0, 25)}
                {(data.stats.topCustomer.name?.length || 0) > 25 ? '...' : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* This Week's Performance */}
      {totalActivities > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>This Week's Performance</h2>
          <div style={styles.performanceGrid}>
            {/* Activities by Type */}
            <div style={styles.performanceColumn}>
              <div style={styles.performanceSubtitle}>Activities by Type</div>
              {Object.entries(activityTypeLabels).map(([type, label]) => {
                const count = activityTypeCounts[type] || 0;
                const pct = totalActivities > 0 ? (count / totalActivities) * 100 : 0;
                return (
                  <div key={type} style={styles.statBarRow}>
                    <div style={styles.statBarLabel}>
                      <span>{label}</span>
                      <span style={styles.statBarCount}>{count}</span>
                    </div>
                    <div style={styles.statBarTrack}>
                      <div
                        style={{
                          ...styles.statBarFill,
                          width: `${Math.max(pct, 2)}%`,
                          background: '#0d7377',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Outcomes Breakdown */}
            <div style={styles.performanceColumn}>
              <div style={styles.performanceSubtitle}>Outcomes</div>
              {Object.entries(outcomeLabels).map(([outcome, label]) => {
                const count = outcomeCounts[outcome] || 0;
                const pct = totalOutcomes > 0 ? (count / totalOutcomes) * 100 : 0;
                return (
                  <div key={outcome} style={styles.statBarRow}>
                    <div style={styles.statBarLabel}>
                      <span>{label}</span>
                      <span style={styles.statBarCount}>{count}</span>
                    </div>
                    <div style={styles.statBarTrack}>
                      <div
                        style={{
                          ...styles.statBarFill,
                          width: `${Math.max(pct, 2)}%`,
                          background: outcomeColors[outcome] || '#9ca3af',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div style={styles.actionsGrid}>
          <Link href="/customers" style={styles.actionButton}>
            <span style={styles.actionIcon}>👥</span>
            <span>View Customers</span>
          </Link>
          <Link href="/customers" style={styles.actionButton}>
            <span style={styles.actionIcon}>➕</span>
            <span>Log Activity</span>
          </Link>
          <Link href="/activities" style={styles.actionButton}>
            <span style={styles.actionIcon}>📋</span>
            <span>My Activities</span>
          </Link>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <h2 style={{ ...styles.sectionTitle, marginBottom: 0 }}>Recent Activity</h2>
          <Link href="/activities" style={styles.viewAllLink}>
            View All
          </Link>
        </div>
        {data.recentActivities.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No recent activities</p>
            <Link href="/customers" style={styles.emptyStateLink}>
              Log your first activity
            </Link>
          </div>
        ) : (
          <div style={styles.activityList}>
            {data.recentActivities.map((activity) => (
              <Link
                key={activity.id}
                href={`/customers/${activity.tabc_permit_number}`}
                style={styles.activityItemLink}
              >
                <div style={styles.activityItem}>
                  <div style={styles.activityIcon}>
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div style={styles.activityContent}>
                    <div style={styles.activityHeader}>
                      <span style={styles.activityType}>
                        {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                      </span>
                      {activity.outcome && (
                        <span style={{
                          ...styles.activityOutcome,
                          backgroundColor: getOutcomeColor(activity.outcome)
                        }}>
                          {activity.outcome.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div style={styles.activityPermit}>
                      Permit: {activity.tabc_permit_number}
                    </div>
                    {activity.notes && (
                      <div style={styles.activityNotes}>
                        {activity.notes.substring(0, 100)}
                        {activity.notes.length > 100 ? '...' : ''}
                      </div>
                    )}
                    <div style={styles.activityDate}>
                      {formatDate(activity.activity_date)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Follow-ups */}
      {data.upcomingFollowups.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Upcoming Follow-ups</h2>
          <div style={styles.followupList}>
            {data.upcomingFollowups.map((followup) => (
              <Link
                key={followup.id}
                href={`/customers/${followup.tabc_permit_number}`}
                style={styles.followupItemLink}
              >
                <div style={styles.followupItem}>
                  <div style={styles.followupDate}>
                    {formatDate(followup.next_followup_date || '')}
                  </div>
                  <div style={styles.followupContent}>
                    <div style={styles.followupPermit}>
                      {followup.tabc_permit_number}
                    </div>
                    {followup.contact_name && (
                      <div style={styles.followupContact}>
                        Contact: {followup.contact_name}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#666',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #0d7377',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  errorContainer: {
    padding: '20px',
    background: '#fee',
    borderRadius: '8px',
    textAlign: 'center',
  },
  errorText: {
    color: '#c33',
    marginBottom: '12px',
  },
  retryButton: {
    padding: '8px 16px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardIcon: {
    fontSize: '32px',
  },
  cardContent: {
    flex: 1,
  },
  cardValue: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#333',
  },
  cardValueSmall: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#333',
  },
  cardLabel: {
    fontSize: '14px',
    color: '#666',
  },
  cardSubtext: {
    fontSize: '12px',
    color: '#999',
    marginTop: '4px',
  },
  section: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '16px',
  },
  viewAllLink: {
    fontSize: '14px',
    color: '#0d7377',
    textDecoration: 'none',
    fontWeight: '500',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
  },
  actionButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    background: 'linear-gradient(135deg, #0d7377 0%, #042829 100%)',
    color: 'white',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '500',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  actionIcon: {
    fontSize: '24px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '20px',
    color: '#666',
  },
  emptyStateLink: {
    color: '#0d7377',
    textDecoration: 'underline',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activityItemLink: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
  },
  activityItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  activityIcon: {
    fontSize: '24px',
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px',
  },
  activityType: {
    fontWeight: '600',
    color: '#333',
  },
  activityOutcome: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '12px',
    color: 'white',
    textTransform: 'capitalize',
  },
  activityPermit: {
    fontSize: '13px',
    color: '#666',
  },
  activityNotes: {
    fontSize: '13px',
    color: '#888',
    marginTop: '4px',
  },
  activityDate: {
    fontSize: '12px',
    color: '#999',
    marginTop: '4px',
  },
  followupList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  followupItemLink: {
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
  },
  followupItem: {
    display: 'flex',
    gap: '16px',
    padding: '12px',
    background: '#fef3c7',
    borderRadius: '8px',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  followupDate: {
    fontWeight: '600',
    color: '#92400e',
    minWidth: '100px',
  },
  followupContent: {
    flex: 1,
  },
  followupPermit: {
    fontWeight: '500',
    color: '#333',
  },
  followupContact: {
    fontSize: '13px',
    color: '#666',
  },
  performanceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '24px',
  },
  performanceColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  performanceSubtitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#555',
    marginBottom: '4px',
  },
  statBarRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statBarLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#555',
  },
  statBarCount: {
    fontWeight: '600',
    color: '#333',
  },
  statBarTrack: {
    height: '8px',
    background: '#e6f5f5',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
};
