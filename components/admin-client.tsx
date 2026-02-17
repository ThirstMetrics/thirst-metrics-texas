/**
 * Admin Client Component
 * Admin portal with four tabs:
 *   1. Overview - System stats dashboard with KPIs, data coverage, activity summary
 *   2. Users - User management table with role editing
 *   3. Data Ingestion - Texas.gov API monitoring and ingestion controls
 *   4. Activity Analytics - Team-wide activity stats and leaderboard
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues and keep bundle size manageable
const AdminEnrichments = dynamic(() => import('@/components/admin-enrichments'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
      <div style={{
        width: '36px',
        height: '36px',
        border: '4px solid #f3f3f3',
        borderTop: '4px solid #0d7377',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 12px',
      }} />
      Loading enrichments...
    </div>
  ),
});

// ============================================
// Types
// ============================================

interface AdminStats {
  system: {
    totalRecords: number;
    totalCustomers: number;
    totalRevenue: number;
    enrichedCustomers: number;
    geocodedCustomers: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
  };
  userStats: {
    totalUsers: number;
    byRole: {
      salesperson: number;
      manager: number;
      admin: number;
    };
  };
  activityStats: {
    totalActivities: number;
    activitiesThisWeek: number;
    activitiesThisMonth: number;
    totalPhotos: number;
    photosWithOcr: number;
  };
  dataFreshness: {
    monthsCovered: number;
    recordsByMonth: { month: string; count: number }[];
  };
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  activityCount: number;
  activityCount7d: number;
  activityCount30d: number;
  lastActivityDate: string | null;
  created_at: string;
}

interface IngestionData {
  latestRecord: string | null;
  totalRecords: number;
  apiStatus: 'available' | 'unavailable';
  lastChecked: string;
  recordsByMonth: { month: string; count: number }[];
}

interface IngestionCheckResult {
  latestInApi: string | null;
  latestInDb: string | null;
  newMonthsAvailable: string[];
  estimatedNewRecords: number;
  sampleRecords: {
    permit: string;
    name: string;
    date: string;
    total: number;
  }[];
  message: string;
  instructions: string;
}

type TabKey = 'overview' | 'users' | 'ingestion' | 'activity' | 'enrichments';
type UserSortField = 'email' | 'role' | 'activityCount';
type SortDir = 'asc' | 'desc';

// ============================================
// Constants
// ============================================

const BRAND = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
  hover: '#0a5f63',
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'ingestion', label: 'Data Ingestion' },
  { key: 'activity', label: 'Activity Analytics' },
  { key: 'enrichments', label: 'Enrichments' },
];

// ============================================
// Helpers
// ============================================

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('en-US').format(v);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const formatDateTime = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// ============================================
// Main Component
// ============================================

export default function AdminClient() {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Data state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ingestionData, setIngestionData] = useState<IngestionData | null>(null);
  const [ingestionCheck, setIngestionCheck] = useState<IngestionCheckResult | null>(null);

  // Loading/error state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [ingestionLoading, setIngestionLoading] = useState(false);
  const [ingestionCheckLoading, setIngestionCheckLoading] = useState(false);
  const [roleUpdateLoading, setRoleUpdateLoading] = useState<string | null>(null);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);
  const [ingestionRunning, setIngestionRunning] = useState(false);
  const [ingestionResult, setIngestionResult] = useState<{
    success: boolean;
    message: string;
    summary?: { added: string; modified: string; fetched: string; errors: string };
    output?: string;
    error?: string;
  } | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<{
    running: boolean;
    output: string;
    startedAt: string | null;
    screenActive: boolean;
  } | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Backfill state
  const [backfillMonths, setBackfillMonths] = useState(6);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    success: boolean;
    message: string;
    summary?: { added: string; modified: string; errors: string };
    error?: string;
  } | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<{
    running: boolean;
    output: string;
    startedAt: string | null;
    screenActive: boolean;
  } | null>(null);
  const [backfillBoundary, setBackfillBoundary] = useState<{
    earliestDate: string | null;
    latestDate: string | null;
    totalRecords: number;
  } | null>(null);
  const backfillPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Track which tabs have been fetched (lazy loading + caching)
  const fetchedRef = useRef<Record<string, boolean>>({ overview: false, users: false, ingestion: false });

  // Users table sort state
  const [userSort, setUserSort] = useState<UserSortField>('activityCount');
  const [userSortDir, setUserSortDir] = useState<SortDir>('desc');

  // ----------------------------------------
  // Fetch: Overview stats
  // ----------------------------------------

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/stats');
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch admin stats');
      }
      const result: AdminStats = await response.json();
      setStats(result);
      fetchedRef.current.overview = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // ----------------------------------------
  // Fetch: Users
  // ----------------------------------------

  const fetchUsers = useCallback(async () => {
    if (fetchedRef.current.users) return;
    setUsersLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch users');
      }
      const result = await response.json();
      setUsers(result.users || result);
      fetchedRef.current.users = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ----------------------------------------
  // Fetch: Ingestion data
  // ----------------------------------------

  const fetchIngestion = useCallback(async () => {
    if (fetchedRef.current.ingestion) return;
    setIngestionLoading(true);
    try {
      const response = await fetch('/api/admin/ingestion');
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch ingestion data');
      }
      const result: IngestionData = await response.json();
      setIngestionData(result);
      fetchedRef.current.ingestion = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ingestion data');
    } finally {
      setIngestionLoading(false);
    }
  }, []);

  // ----------------------------------------
  // Fetch on mount (overview) + lazy load others
  // ----------------------------------------

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'activity') {
      fetchUsers();
    }
    if (activeTab === 'ingestion') {
      fetchIngestion();
    }
  }, [activeTab, fetchUsers, fetchIngestion]);

  // ----------------------------------------
  // Role update
  // ----------------------------------------

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    const previousUsers = [...users];
    setRoleUpdateLoading(userId);
    setRoleUpdateError(null);

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) {
        throw new Error('Failed to update role');
      }
    } catch (err) {
      // Revert on error
      setUsers(previousUsers);
      setRoleUpdateError(
        err instanceof Error ? err.message : 'Failed to update role'
      );
    } finally {
      setRoleUpdateLoading(null);
    }
  }, [users]);

  // ----------------------------------------
  // Check for new data (ingestion)
  // ----------------------------------------

  const handleCheckNewData = useCallback(async () => {
    setIngestionCheckLoading(true);
    setIngestionCheck(null);
    try {
      const res = await fetch('/api/admin/ingestion', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to check for new data');
      }
      const result: IngestionCheckResult = await res.json();
      setIngestionCheck(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setIngestionCheckLoading(false);
    }
  }, []);

  // ----------------------------------------
  // Ingestion status polling
  // ----------------------------------------

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const pollIngestionStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ingestion', { method: 'DELETE' });
      if (!res.ok) return;
      const status = await res.json();
      setIngestionStatus(status);

      // If not running and screen not active, ingestion is done
      if (!status.running && !status.screenActive) {
        stopPolling();
        setIngestionRunning(false);
        // Parse the log output for summary stats
        const output = status.output || '';
        const addedMatch = output.match(/Added:\s*(\d[\d,]*)/);
        const modifiedMatch = output.match(/Modified:\s*(\d[\d,]*)/);
        const fetchedMatch = output.match(/Fetched:\s*(\d[\d,]*)/);
        const errorMatch = output.match(/Errors:\s*(\d[\d,]*)/);
        const hasComplete = output.includes('INGESTION COMPLETE');

        if (hasComplete || addedMatch) {
          setIngestionResult({
            success: true,
            message: `Ingestion complete. Added: ${addedMatch?.[1] || '0'}, Modified: ${modifiedMatch?.[1] || '0'}`,
            summary: {
              added: addedMatch?.[1] || '0',
              modified: modifiedMatch?.[1] || '0',
              fetched: fetchedMatch?.[1] || 'unknown',
              errors: errorMatch?.[1] || '0',
            },
          });
        } else if (output.includes('Fatal') || output.includes('ERROR LIMIT') || output.includes('ABORT')) {
          setIngestionResult({
            success: false,
            message: 'Ingestion failed. Check log output for details.',
            output: output.substring(output.length - 500),
            error: 'Process exited with errors',
          });
        }
        // Invalidate cached data so it refreshes
        fetchedRef.current.ingestion = false;
      }
    } catch {
      // Silently ignore polling errors — will retry on next interval
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    // Poll immediately, then every 5 seconds
    pollIngestionStatus();
    pollingRef.current = setInterval(pollIngestionStatus, 5000);
  }, [stopPolling, pollIngestionStatus]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ----------------------------------------
  // Run ingestion via SSH (fire-and-forget)
  // ----------------------------------------

  const handleRunIngestion = useCallback(async () => {
    setIngestionRunning(true);
    setIngestionResult(null);
    setIngestionStatus(null);
    try {
      const res = await fetch('/api/admin/ingestion', { method: 'PUT' });
      const result = await res.json();

      if (res.status === 409) {
        // Already running
        setIngestionResult({
          success: false,
          message: `Ingestion is already running (started ${result.startedAt || 'unknown'})`,
          error: 'Already running',
        });
        setIngestionRunning(false);
        // Start polling to track the existing run
        startPolling();
        return;
      }

      if (!res.ok) {
        setIngestionResult({
          success: false,
          message: result.error || 'Failed to start ingestion',
          error: result.error || 'Unknown error',
        });
        setIngestionRunning(false);
        return;
      }

      // Successfully started — begin polling for status
      startPolling();
    } catch (err) {
      setIngestionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Ingestion request failed',
        error: 'Network error',
      });
      setIngestionRunning(false);
    }
  }, [startPolling]);

  // ----------------------------------------
  // Backfill: fetch data boundaries
  // ----------------------------------------

  const fetchBackfillBoundary = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/backfill');
      if (res.ok) {
        const data = await res.json();
        setBackfillBoundary(data);
      }
    } catch {
      // silently ignore
    }
  }, []);

  // Fetch boundaries when ingestion tab opens
  useEffect(() => {
    if (activeTab === 'ingestion' && !backfillBoundary) {
      fetchBackfillBoundary();
    }
  }, [activeTab, backfillBoundary, fetchBackfillBoundary]);

  // ----------------------------------------
  // Backfill: polling
  // ----------------------------------------

  const stopBackfillPolling = useCallback(() => {
    if (backfillPollingRef.current) {
      clearInterval(backfillPollingRef.current);
      backfillPollingRef.current = null;
    }
  }, []);

  const pollBackfillStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/backfill', { method: 'DELETE' });
      if (!res.ok) return;
      const status = await res.json();
      setBackfillStatus(status);

      if (!status.running && !status.screenActive) {
        stopBackfillPolling();
        setBackfillRunning(false);
        const output = status.output || '';
        const addedMatch = output.match(/Added:\s*(\d[\d,]*)/);
        const modifiedMatch = output.match(/Modified:\s*(\d[\d,]*)/);
        const errorMatch = output.match(/Errors:\s*(\d[\d,]*)/);
        const hasComplete = output.includes('BACKFILL COMPLETE');

        if (hasComplete || addedMatch) {
          setBackfillResult({
            success: true,
            message: `Backfill complete. Added: ${addedMatch?.[1] || '0'}, Modified: ${modifiedMatch?.[1] || '0'}`,
            summary: {
              added: addedMatch?.[1] || '0',
              modified: modifiedMatch?.[1] || '0',
              errors: errorMatch?.[1] || '0',
            },
          });
        } else if (output.includes('Fatal') || output.includes('ERROR LIMIT') || output.includes('ABORT')) {
          setBackfillResult({
            success: false,
            message: 'Backfill failed. Check log output for details.',
            error: output.substring(output.length - 500),
          });
        }
        // Refresh boundaries
        fetchBackfillBoundary();
        fetchedRef.current.ingestion = false;
      }
    } catch {
      // silently ignore
    }
  }, [stopBackfillPolling, fetchBackfillBoundary]);

  const startBackfillPolling = useCallback(() => {
    stopBackfillPolling();
    pollBackfillStatus();
    backfillPollingRef.current = setInterval(pollBackfillStatus, 5000);
  }, [stopBackfillPolling, pollBackfillStatus]);

  useEffect(() => {
    return () => stopBackfillPolling();
  }, [stopBackfillPolling]);

  // ----------------------------------------
  // Backfill: trigger
  // ----------------------------------------

  const handleRunBackfill = useCallback(async () => {
    setBackfillRunning(true);
    setBackfillResult(null);
    setBackfillStatus(null);
    try {
      const res = await fetch('/api/admin/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: backfillMonths }),
      });
      const result = await res.json();

      if (res.status === 409) {
        setBackfillResult({
          success: false,
          message: `Backfill is already running (started ${result.startedAt || 'unknown'})`,
          error: 'Already running',
        });
        setBackfillRunning(false);
        startBackfillPolling();
        return;
      }

      if (!res.ok) {
        setBackfillResult({
          success: false,
          message: result.error || 'Failed to start backfill',
          error: result.error || 'Unknown error',
        });
        setBackfillRunning(false);
        return;
      }

      startBackfillPolling();
    } catch (err) {
      setBackfillResult({
        success: false,
        message: err instanceof Error ? err.message : 'Backfill request failed',
        error: 'Network error',
      });
      setBackfillRunning(false);
    }
  }, [backfillMonths, startBackfillPolling]);

  // ----------------------------------------
  // Users: sorting
  // ----------------------------------------

  const handleUserSort = (field: UserSortField) => {
    if (userSort === field) {
      setUserSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setUserSort(field);
      setUserSortDir('desc');
    }
  };

  const sortIndicator = (field: UserSortField) => {
    if (userSort !== field) return '';
    return userSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (userSort) {
        case 'email':
          cmp = a.email.localeCompare(b.email);
          break;
        case 'role':
          cmp = a.role.localeCompare(b.role);
          break;
        case 'activityCount':
          cmp = a.activityCount - b.activityCount;
          break;
      }
      return userSortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [users, userSort, userSortDir]);

  // ----------------------------------------
  // Activity analytics: derived data
  // ----------------------------------------

  const activityLeaderboard = useMemo(() => {
    return [...users].sort((a, b) => b.activityCount - a.activityCount);
  }, [users]);

  const totalTeamActivities = useMemo(() => {
    return users.reduce((sum, u) => sum + u.activityCount, 0);
  }, [users]);

  const maxUserActivities = useMemo(() => {
    return users.reduce((max, u) => Math.max(max, u.activityCount), 0);
  }, [users]);

  // ============================================
  // Render: Tab Bar
  // ============================================

  const renderTabs = () => (
    <div style={s.tabBar}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          style={{
            ...s.tabPill,
            ...(activeTab === tab.key ? s.tabPillActive : {}),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  // ============================================
  // Render: Loading Spinner
  // ============================================

  const renderSpinner = (message?: string) => (
    <div style={s.loadingContainer}>
      <div style={s.spinner} />
      <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>
        {message || 'Loading...'}
      </p>
    </div>
  );

  // ============================================
  // Render: Error State
  // ============================================

  const renderError = (retryFn: () => void) => (
    <div style={s.errorContainer}>
      <p style={s.errorText}>Error: {error}</p>
      <button
        onClick={() => {
          setError(null);
          retryFn();
        }}
        style={s.retryButton}
      >
        Retry
      </button>
    </div>
  );

  // ============================================
  // Render: Overview Tab
  // ============================================

  const renderOverview = () => {
    if (loading) return renderSpinner('Loading admin stats...');
    if (error && !stats) return renderError(() => { fetchedRef.current.overview = false; fetchStats(); });
    if (!stats) return null;

    const { system, userStats, activityStats, dataFreshness } = stats;
    const last6Months = dataFreshness.recordsByMonth.slice(-6);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* KPI Cards */}
        <div style={s.kpiGrid}>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F4CA}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(system.totalRecords)}</div>
              <div style={s.kpiLabel}>Total Records</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F3EA}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(system.totalCustomers)}</div>
              <div style={s.kpiLabel}>Total Customers</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F4B0}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatCurrency(system.totalRevenue)}</div>
              <div style={s.kpiLabel}>Total Revenue</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F465}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(userStats.totalUsers)}</div>
              <div style={s.kpiLabel}>Total Users</div>
            </div>
          </div>
        </div>

        {/* Two Column: Data Coverage + Activity Summary */}
        <div style={s.twoColResponsive}>
          {/* Data Coverage Card */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Data Coverage</h3>
            <div style={s.statsList}>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Date Range</span>
                <span style={s.statsValue}>
                  {formatDate(system.dateRange.earliest)} &mdash; {formatDate(system.dateRange.latest)}
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Months Covered</span>
                <span style={s.statsValue}>{formatNumber(dataFreshness.monthsCovered)}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Enriched Customers</span>
                <span style={s.statsValue}>{formatNumber(system.enrichedCustomers)}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Geocoded Customers</span>
                <span style={s.statsValue}>{formatNumber(system.geocodedCustomers)}</span>
              </div>
            </div>

            {/* Records by month - last 6 months */}
            <div style={{ marginTop: '20px' }}>
              <div style={s.miniSectionTitle}>Records by Month (Last 6)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {last6Months.map((item) => {
                  const maxCount = Math.max(...last6Months.map((m) => m.count), 1);
                  const pct = (item.count / maxCount) * 100;
                  return (
                    <div key={item.month} style={s.barRow}>
                      <div style={s.barLabel}>{item.month}</div>
                      <div style={s.barTrack}>
                        <div
                          style={{
                            ...s.barFill,
                            width: `${Math.max(pct, 2)}%`,
                          }}
                        />
                      </div>
                      <div style={s.barCount}>{formatNumber(item.count)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Activity Summary Card */}
          <div style={s.card}>
            <h3 style={s.cardTitle}>Activity Summary</h3>
            <div style={s.statsList}>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Total Activities</span>
                <span style={s.statsValue}>{formatNumber(activityStats.totalActivities)}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>This Week</span>
                <span style={s.statsValue}>{formatNumber(activityStats.activitiesThisWeek)}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>This Month</span>
                <span style={s.statsValue}>{formatNumber(activityStats.activitiesThisMonth)}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Total Photos</span>
                <span style={s.statsValue}>{formatNumber(activityStats.totalPhotos)}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Photos with OCR</span>
                <span style={s.statsValue}>{formatNumber(activityStats.photosWithOcr)}</span>
              </div>
            </div>

            {/* User Role Breakdown */}
            <div style={{ marginTop: '20px' }}>
              <div style={s.miniSectionTitle}>Users by Role</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                {[
                  { label: 'Salesperson', count: userStats.byRole.salesperson, color: BRAND.primary },
                  { label: 'Manager', count: userStats.byRole.manager, color: BRAND.accent },
                  { label: 'Admin', count: userStats.byRole.admin, color: '#ec4899' },
                ].map((role) => {
                  const totalForBar = userStats.totalUsers || 1;
                  const pct = (role.count / totalForBar) * 100;
                  return (
                    <div key={role.label} style={s.barRow}>
                      <div style={s.barLabel}>{role.label}</div>
                      <div style={s.barTrack}>
                        <div
                          style={{
                            ...s.barFill,
                            width: `${Math.max(pct, 2)}%`,
                            background: role.color,
                          }}
                        />
                      </div>
                      <div style={s.barCount}>{role.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // Render: Users Tab
  // ============================================

  const renderUsers = () => {
    if (usersLoading) return renderSpinner('Loading users...');
    if (error && users.length === 0) return renderError(() => { fetchedRef.current.users = false; fetchUsers(); });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Role update error banner */}
        {roleUpdateError && (
          <div style={s.errorBanner}>
            <span>Error updating role: {roleUpdateError}</span>
            <button
              onClick={() => setRoleUpdateError(null)}
              style={s.errorBannerClose}
            >
              {'\u2715'}
            </button>
          </div>
        )}

        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ ...s.cardTitle, marginBottom: 0 }}>
              User Management ({users.length} users)
            </h3>
          </div>

          {users.length === 0 ? (
            <div style={s.emptyState}>No users found</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th
                      style={{ ...s.th, cursor: 'pointer' }}
                      onClick={() => handleUserSort('email')}
                    >
                      Email{sortIndicator('email')}
                    </th>
                    <th
                      style={{ ...s.th, cursor: 'pointer' }}
                      onClick={() => handleUserSort('role')}
                    >
                      Role{sortIndicator('role')}
                    </th>
                    <th
                      style={{ ...s.th, textAlign: 'right', cursor: 'pointer' }}
                      onClick={() => handleUserSort('activityCount')}
                    >
                      Total Activities{sortIndicator('activityCount')}
                    </th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Last 7 Days</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Last 30 Days</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Last Activity</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr key={user.id} style={s.tr}>
                      <td style={s.td}>
                        <span style={{ fontWeight: 500, color: '#1e293b' }}>{user.email}</span>
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={roleUpdateLoading === user.id}
                            style={{
                              ...s.roleSelect,
                              opacity: roleUpdateLoading === user.id ? 0.5 : 1,
                            }}
                          >
                            <option value="salesperson">Salesperson</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                          {roleUpdateLoading === user.id && (
                            <div style={s.miniSpinner} />
                          )}
                        </div>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>
                        {formatNumber(user.activityCount)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        {formatNumber(user.activityCount7d)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        {formatNumber(user.activityCount30d)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#64748b' }}>
                        {user.lastActivityDate ? formatDate(user.lastActivityDate) : '\u2014'}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', color: '#64748b' }}>
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // Render: Ingestion Tab
  // ============================================

  const renderIngestion = () => {
    if (ingestionLoading) return renderSpinner('Loading ingestion data...');
    if (error && !ingestionData) return renderError(() => { fetchedRef.current.ingestion = false; fetchIngestion(); });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Status Card */}
        {ingestionData && (
          <div style={s.card}>
            <h3 style={s.cardTitle}>Ingestion Status</h3>
            <div style={s.statsList}>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Latest Data in Database</span>
                <span style={s.statsValue}>
                  {ingestionData.latestRecord
                    ? formatDate(ingestionData.latestRecord)
                    : '\u2014'}
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Total Records</span>
                <span style={s.statsValue}>
                  {formatNumber(ingestionData.totalRecords)}
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>API Status</span>
                <span>
                  <span
                    style={{
                      ...s.statusBadge,
                      background: ingestionData.apiStatus === 'available' ? '#dcfce7' : '#fef2f2',
                      color: ingestionData.apiStatus === 'available' ? '#166534' : '#991b1b',
                    }}
                  >
                    {ingestionData.apiStatus === 'available' ? '\u2713 Available' : '\u2717 Unavailable'}
                  </span>
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Last Checked</span>
                <span style={s.statsValue}>
                  {ingestionData.lastChecked
                    ? formatDateTime(ingestionData.lastChecked)
                    : '\u2014'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Records by Month */}
        {ingestionData && ingestionData.recordsByMonth.length > 0 && (
          <div style={s.card}>
            <h3 style={s.cardTitle}>Records by Month</h3>
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Month</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Records</th>
                    <th style={{ ...s.th, width: '50%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ingestionData.recordsByMonth.slice(-6).map((item) => {
                    const maxCount = Math.max(
                      ...ingestionData.recordsByMonth.slice(-6).map((m) => m.count),
                      1
                    );
                    const pct = (item.count / maxCount) * 100;
                    return (
                      <tr key={item.month} style={s.tr}>
                        <td style={s.td}>{item.month}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>
                          {formatNumber(item.count)}
                        </td>
                        <td style={s.td}>
                          <div style={s.barTrack}>
                            <div
                              style={{
                                ...s.barFill,
                                width: `${Math.max(pct, 2)}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Check for New Data */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Check for New Data</h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 16px 0' }}>
            Query the Texas.gov API to see if new mixed beverage receipt data is available.
          </p>
          <button
            onClick={handleCheckNewData}
            disabled={ingestionCheckLoading}
            style={{
              ...s.primaryButton,
              opacity: ingestionCheckLoading ? 0.6 : 1,
              cursor: ingestionCheckLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {ingestionCheckLoading ? 'Checking...' : 'Check for New Data'}
          </button>

          {/* Check Results */}
          {ingestionCheck && (
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={s.resultCard}>
                <div style={s.statsList}>
                  <div style={s.statsRow}>
                    <span style={s.statsKey}>Latest in API</span>
                    <span style={s.statsValue}>{ingestionCheck.latestInApi ? formatDate(ingestionCheck.latestInApi) : 'N/A'}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsKey}>Latest in DB</span>
                    <span style={s.statsValue}>{ingestionCheck.latestInDb ? formatDate(ingestionCheck.latestInDb) : 'N/A'}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsKey}>Estimated New Records</span>
                    <span style={{ ...s.statsValue, fontWeight: 700, color: BRAND.primary }}>
                      {formatNumber(ingestionCheck.estimatedNewRecords)}
                    </span>
                  </div>
                </div>
              </div>

              {/* New Months Available */}
              {ingestionCheck.newMonthsAvailable.length > 0 && (
                <div>
                  <div style={s.miniSectionTitle}>New Months Available</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {ingestionCheck.newMonthsAvailable.map((month) => (
                      <span key={month} style={s.monthBadge}>
                        {month}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Records */}
              {ingestionCheck.sampleRecords.length > 0 && (
                <div>
                  <div style={s.miniSectionTitle}>Sample Records</div>
                  <div style={{ ...s.tableWrap, marginTop: '8px' }}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th}>Permit</th>
                          <th style={s.th}>Name</th>
                          <th style={s.th}>Date</th>
                          <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ingestionCheck.sampleRecords.map((rec, idx) => (
                          <tr key={idx} style={s.tr}>
                            <td style={{ ...s.td, fontFamily: 'monospace', fontSize: '12px' }}>
                              {rec.permit}
                            </td>
                            <td style={s.td}>{rec.name}</td>
                            <td style={s.td}>{formatDate(rec.date)}</td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>
                              {formatCurrency(rec.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Status message */}
              {ingestionCheck.message && (
                <div style={s.instructionsBanner}>
                  <span style={{ fontSize: '14px', color: '#1e293b' }}>
                    {ingestionCheck.message}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Run Ingestion */}
        <div style={{
          ...s.card,
          ...(ingestionRunning ? {
            border: '2px solid #22c55e',
            animation: 'glowGreen 2s ease-in-out infinite',
            position: 'relative' as const,
            overflow: 'hidden' as const,
          } : {}),
        }}>
          {/* Animated progress bar at top of card */}
          {ingestionRunning && (
            <div style={{
              position: 'absolute' as const,
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'rgba(34,197,94,0.15)',
              overflow: 'hidden' as const,
            }}>
              <div style={{
                width: '50%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, #22c55e, transparent)',
                animation: 'progressSlide 1.5s ease-in-out infinite',
              }} />
            </div>
          )}
          <h3 style={s.cardTitle}>Run Ingestion</h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 16px 0' }}>
            Remotely trigger the ingestion script on the production server via a background screen session. This will fetch new records from the Texas.gov API and insert them into the database.
          </p>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
            The process runs in a detached screen session and survives connection drops. Status updates every 5 seconds.
          </p>
          <button
            onClick={handleRunIngestion}
            disabled={ingestionRunning}
            style={{
              ...s.primaryButton,
              background: ingestionRunning ? '#94a3b8' : '#0d7377',
              opacity: ingestionRunning ? 0.8 : 1,
              cursor: ingestionRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {ingestionRunning ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                Running Ingestion...
              </span>
            ) : 'Run Ingestion'}
          </button>

          {/* Immediate feedback before first poll */}
          {ingestionRunning && !ingestionStatus && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #93c5fd',
              background: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid rgba(13,115,119,0.3)',
                borderTop: '2px solid #0d7377',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e40af' }}>
                Launching ingestion on server...
              </span>
            </div>
          )}

          {/* Live Status (while running) */}
          {ingestionRunning && ingestionStatus && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #93c5fd',
              background: '#eff6ff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: ingestionStatus.screenActive ? '#22c55e' : '#f59e0b',
                    animation: ingestionStatus.screenActive ? 'pulse 2s infinite' : 'none',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e40af' }}>
                    {ingestionStatus.screenActive ? 'Ingestion Running' : 'Finishing up...'}
                  </span>
                </div>
                {ingestionStatus.startedAt && (
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Started: {formatDateTime(ingestionStatus.startedAt)}
                  </span>
                )}
              </div>

              {/* Live log output */}
              {ingestionStatus.output && (
                <div style={{
                  background: '#1e293b',
                  borderRadius: '6px',
                  padding: '12px',
                  maxHeight: '240px',
                  overflow: 'auto',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {ingestionStatus.output}
                </div>
              )}
            </div>
          )}

          {/* Ingestion Result (when complete) */}
          {!ingestionRunning && ingestionResult && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: `1px solid ${ingestionResult.success ? '#86efac' : '#fca5a5'}`,
              background: ingestionResult.success ? '#f0fdf4' : '#fef2f2',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}>
                <span style={{ fontSize: '18px' }}>
                  {ingestionResult.success ? '\u2705' : '\u274C'}
                </span>
                <span style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  color: ingestionResult.success ? '#166534' : '#991b1b',
                }}>
                  {ingestionResult.message}
                </span>
              </div>

              {/* Summary stats */}
              {ingestionResult.summary && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '12px',
                  marginTop: '12px',
                }}>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: BRAND.primary }}>{ingestionResult.summary.added}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Added</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{ingestionResult.summary.modified}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Modified</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#6b7280' }}>{ingestionResult.summary.fetched}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Fetched</div>
                  </div>
                  {ingestionResult.summary.errors !== '0' && (
                    <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{ingestionResult.summary.errors}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Errors</div>
                    </div>
                  )}
                </div>
              )}

              {/* Error detail */}
              {ingestionResult.error && !ingestionResult.success && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: '#fff5f5',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: '#991b1b',
                  maxHeight: '120px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {ingestionResult.error}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Backfill Historical Data */}
        <div style={{
          ...s.card,
          ...(backfillRunning ? {
            border: '2px solid #7c3aed',
            animation: 'glowPurple 2s ease-in-out infinite',
            position: 'relative' as const,
            overflow: 'hidden' as const,
          } : {}),
        }}>
          {/* Animated progress bar at top of card */}
          {backfillRunning && (
            <div style={{
              position: 'absolute' as const,
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: 'rgba(124,58,237,0.15)',
              overflow: 'hidden' as const,
            }}>
              <div style={{
                width: '50%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, #7c3aed, transparent)',
                animation: 'progressSlide 1.5s ease-in-out infinite',
              }} />
            </div>
          )}
          <h3 style={s.cardTitle}>Backfill Historical Data</h3>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 12px 0' }}>
            Load historical data backwards from the earliest date in the database. Choose how many months to fetch per run.
          </p>

          {/* Data boundaries */}
          {backfillBoundary && (
            <div style={{ ...s.statsCard, marginBottom: '16px' }}>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Earliest Date in DB</span>
                <span style={{ ...s.statsValue, fontWeight: 700, color: BRAND.primary }}>
                  {backfillBoundary.earliestDate ? formatDate(backfillBoundary.earliestDate) : 'N/A'}
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Latest Date in DB</span>
                <span style={s.statsValue}>
                  {backfillBoundary.latestDate ? formatDate(backfillBoundary.latestDate) : 'N/A'}
                </span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsKey}>Total Records</span>
                <span style={s.statsValue}>{formatNumber(backfillBoundary.totalRecords)}</span>
              </div>
            </div>
          )}

          {/* Month selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <label style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
              Months to backfill:
            </label>
            <select
              value={backfillMonths}
              onChange={(e) => setBackfillMonths(parseInt(e.target.value, 10))}
              disabled={backfillRunning}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                color: '#334155',
                background: backfillRunning ? '#f1f5f9' : 'white',
                cursor: backfillRunning ? 'not-allowed' : 'pointer',
              }}
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
              <option value={24}>24 months</option>
              <option value={36}>36 months</option>
              <option value={48}>48 months</option>
              <option value={60}>60 months (5 years)</option>
            </select>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              ~{formatNumber(backfillMonths * 23000)} estimated records
            </span>
          </div>

          <button
            onClick={handleRunBackfill}
            disabled={backfillRunning}
            style={{
              ...s.primaryButton,
              background: backfillRunning ? '#94a3b8' : '#7c3aed',
              opacity: backfillRunning ? 0.8 : 1,
              cursor: backfillRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {backfillRunning ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '14px',
                  height: '14px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                Running Backfill...
              </span>
            ) : 'Run Backfill'}
          </button>

          {/* Immediate feedback before first poll */}
          {backfillRunning && !backfillStatus && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #c4b5fd',
              background: '#f5f3ff',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                border: '2px solid rgba(124,58,237,0.3)',
                borderTop: '2px solid #7c3aed',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#5b21b6' }}>
                Launching backfill on server...
              </span>
            </div>
          )}

          {/* Live Status (while running) */}
          {backfillRunning && backfillStatus && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #c4b5fd',
              background: '#f5f3ff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: backfillStatus.screenActive ? '#7c3aed' : '#f59e0b',
                    animation: backfillStatus.screenActive ? 'pulse 2s infinite' : 'none',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#5b21b6' }}>
                    {backfillStatus.screenActive ? 'Backfill Running' : 'Finishing up...'}
                  </span>
                </div>
                {backfillStatus.startedAt && (
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Started: {formatDateTime(backfillStatus.startedAt)}
                  </span>
                )}
              </div>

              {backfillStatus.output && (
                <div style={{
                  background: '#1e293b',
                  borderRadius: '6px',
                  padding: '12px',
                  maxHeight: '240px',
                  overflow: 'auto',
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                  fontSize: '11px',
                  lineHeight: 1.5,
                  color: '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {backfillStatus.output}
                </div>
              )}
            </div>
          )}

          {/* Backfill Result (when complete) */}
          {!backfillRunning && backfillResult && (
            <div style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '8px',
              border: `1px solid ${backfillResult.success ? '#86efac' : '#fca5a5'}`,
              background: backfillResult.success ? '#f0fdf4' : '#fef2f2',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>
                  {backfillResult.success ? '\u2705' : '\u274C'}
                </span>
                <span style={{
                  fontWeight: 600,
                  fontSize: '15px',
                  color: backfillResult.success ? '#166534' : '#991b1b',
                }}>
                  {backfillResult.message}
                </span>
              </div>

              {backfillResult.summary && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '12px',
                  marginTop: '12px',
                }}>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#7c3aed' }}>{backfillResult.summary.added}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Added</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#f59e0b' }}>{backfillResult.summary.modified}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>Modified</div>
                  </div>
                  {backfillResult.summary.errors !== '0' && (
                    <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>{backfillResult.summary.errors}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Errors</div>
                    </div>
                  )}
                </div>
              )}

              {backfillResult.error && !backfillResult.success && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: '#fff5f5',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  color: '#991b1b',
                  maxHeight: '120px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}>
                  {backfillResult.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // Render: Activity Analytics Tab
  // ============================================

  const renderActivityAnalytics = () => {
    if (usersLoading) return renderSpinner('Loading activity data...');
    if (error && users.length === 0) return renderError(() => { fetchedRef.current.users = false; fetchUsers(); });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Team Summary KPI */}
        <div style={s.kpiGrid}>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F4CB}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(totalTeamActivities)}</div>
              <div style={s.kpiLabel}>Total Team Activities</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F465}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(users.length)}</div>
              <div style={s.kpiLabel}>Active Users</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F4C8}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>
                {users.length > 0
                  ? formatNumber(Math.round(totalTeamActivities / users.length))
                  : '0'}
              </div>
              <div style={s.kpiLabel}>Avg per User</div>
            </div>
          </div>
        </div>

        {/* Activities by User - Bar Display */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Activities by User</h3>
          {users.length === 0 ? (
            <div style={s.emptyState}>No users with activity data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activityLeaderboard.map((user) => {
                const pct = maxUserActivities > 0
                  ? (user.activityCount / maxUserActivities) * 100
                  : 0;
                return (
                  <div key={user.id} style={s.barRow}>
                    <div style={{ ...s.barLabel, minWidth: '180px', maxWidth: '220px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user.email}
                      </span>
                    </div>
                    <div style={s.barTrack}>
                      <div
                        style={{
                          ...s.barFill,
                          width: `${Math.max(pct, 2)}%`,
                        }}
                      />
                    </div>
                    <div style={{ ...s.barCount, minWidth: '50px' }}>
                      {formatNumber(user.activityCount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Leaderboard Table */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>Activity Leaderboard</h3>
          {activityLeaderboard.length === 0 ? (
            <div style={s.emptyState}>No activity data available</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, textAlign: 'center', width: '50px' }}>Rank</th>
                    <th style={s.th}>Email</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Total Activities</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Last 7 Days</th>
                    <th style={{ ...s.th, textAlign: 'right' }}>Last 30 Days</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLeaderboard.map((user, idx) => (
                    <tr key={user.id} style={s.tr}>
                      <td style={{ ...s.td, textAlign: 'center' }}>
                        <span style={{
                          ...s.rankBadge,
                          background: idx === 0 ? '#fef3c7' : idx === 1 ? '#f1f5f9' : idx === 2 ? '#fef2e8' : 'transparent',
                          color: idx === 0 ? '#92400e' : idx === 1 ? '#475569' : idx === 2 ? '#9a3412' : '#64748b',
                          fontWeight: idx < 3 ? 700 : 500,
                        }}>
                          {idx + 1}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={{ fontWeight: 500, color: '#1e293b' }}>{user.email}</span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontWeight: 700, color: BRAND.primary }}>
                        {formatNumber(user.activityCount)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        {formatNumber(user.activityCount7d)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        {formatNumber(user.activityCount30d)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // Main Render
  // ============================================

  return (
    <div style={s.container}>
      {/* Spin keyframes (injected once) */}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes glowGreen {
          0%, 100% { box-shadow: 0 0 8px rgba(34,197,94,0.3), 0 0 0 2px rgba(34,197,94,0.15); border-color: #22c55e; }
          50% { box-shadow: 0 0 20px rgba(34,197,94,0.5), 0 0 0 3px rgba(34,197,94,0.3); border-color: #16a34a; }
        }
        @keyframes glowPurple {
          0%, 100% { box-shadow: 0 0 8px rgba(124,58,237,0.3), 0 0 0 2px rgba(124,58,237,0.15); border-color: #7c3aed; }
          50% { box-shadow: 0 0 20px rgba(124,58,237,0.5), 0 0 0 3px rgba(124,58,237,0.3); border-color: #6d28d9; }
        }
        @keyframes progressSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>

      {renderTabs()}
      <div style={s.tabContent}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'users' && renderUsers()}
        {activeTab === 'ingestion' && renderIngestion()}
        {activeTab === 'activity' && renderActivityAnalytics()}
        {activeTab === 'enrichments' && <AdminEnrichments />}
      </div>
    </div>
  );
}

// ============================================
// Styles
// ============================================

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },

  // ---- Tab bar (pill style) ----
  tabBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  tabPill: {
    padding: '8px 20px',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    background: '#e6f5f5',
    color: '#0d7377',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  tabPillActive: {
    background: '#0d7377',
    color: 'white',
  },
  tabContent: {
    minHeight: '400px',
  },

  // ---- Loading ----
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
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

  // ---- Error ----
  errorContainer: {
    padding: '24px',
    background: '#fef2f2',
    borderRadius: '12px',
    textAlign: 'center',
  },
  errorText: {
    color: '#b91c1c',
    marginBottom: '12px',
    fontSize: '15px',
  },
  retryButton: {
    padding: '10px 20px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#b91c1c',
    fontSize: '14px',
  },
  errorBannerClose: {
    background: 'none',
    border: 'none',
    color: '#b91c1c',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px',
    lineHeight: 1,
  },

  // ---- KPI cards ----
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  kpiCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  kpiIcon: {
    fontSize: '28px',
    flexShrink: 0,
  },
  kpiContent: {
    flex: 1,
    minWidth: 0,
  },
  kpiValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
    lineHeight: 1.2,
  },
  kpiLabel: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '2px',
  },

  // ---- Cards ----
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
    marginTop: 0,
    marginBottom: '16px',
  },

  // ---- Responsive two-column ----
  twoColResponsive: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '24px',
  },

  // ---- Stats list (key-value rows) ----
  statsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '10px',
    borderBottom: '1px solid #f1f5f9',
  },
  statsKey: {
    fontSize: '14px',
    color: '#64748b',
    fontWeight: 500,
  },
  statsValue: {
    fontSize: '14px',
    color: '#1e293b',
    fontWeight: 600,
  },

  // ---- Mini section title ----
  miniSectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },

  // ---- Bar chart rows ----
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  barLabel: {
    fontSize: '13px',
    color: '#475569',
    fontWeight: 500,
    minWidth: '80px',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: '8px',
    background: '#e6f5f5',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: '#0d7377',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  barCount: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e293b',
    minWidth: '40px',
    textAlign: 'right',
    flexShrink: 0,
  },

  // ---- Tables ----
  tableWrap: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background 0.1s',
  },
  td: {
    padding: '10px 12px',
    color: '#334155',
    fontSize: '13px',
  },

  // ---- Role select dropdown ----
  roleSelect: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: 'white',
    fontSize: '13px',
    color: '#1e293b',
    cursor: 'pointer',
    outline: 'none',
    fontWeight: 500,
  },
  miniSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #f3f3f3',
    borderTop: '2px solid #0d7377',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    flexShrink: 0,
  },

  // ---- Empty state ----
  emptyState: {
    textAlign: 'center',
    padding: '32px',
    color: '#94a3b8',
    fontSize: '14px',
  },

  // ---- Ingestion specific ----
  statusBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 600,
  },
  primaryButton: {
    padding: '12px 24px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'background 0.15s',
  },
  resultCard: {
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  monthBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    background: '#e6f5f5',
    color: '#0d7377',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 600,
  },
  instructionsBanner: {
    padding: '12px 16px',
    background: '#fefce8',
    border: '1px solid #fde68a',
    borderRadius: '8px',
  },
  codeBlock: {
    background: '#1e293b',
    borderRadius: '8px',
    padding: '16px',
    overflowX: 'auto',
  },
  codeBlockPre: {
    margin: 0,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#e2e8f0',
    whiteSpace: 'pre',
  },

  // ---- Leaderboard rank badge ----
  rankBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    fontSize: '13px',
  },
};
