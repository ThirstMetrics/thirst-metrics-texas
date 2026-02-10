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
        <h2 style={styles.sectionTitle}>Recent Activity</h2>
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
              <div key={activity.id} style={styles.activityItem}>
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
              <div key={followup.id} style={styles.followupItem}>
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
    borderTop: '4px solid #667eea',
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
    background: '#667eea',
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
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '16px',
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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
    color: '#667eea',
    textDecoration: 'underline',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  activityItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '8px',
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
  followupItem: {
    display: 'flex',
    gap: '16px',
    padding: '12px',
    background: '#fef3c7',
    borderRadius: '8px',
    alignItems: 'center',
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
};
