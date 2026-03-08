/**
 * Goals Management Page
 * Full goal CRUD with filter tabs, progress bars, and edit/delete actions.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import GoalForm from '@/components/goal-form';
import { useIsMobile } from '@/lib/hooks/use-media-query';

type GoalType = 'revenue' | 'growth' | 'new_accounts' | 'visits';
type GoalStatus = 'active' | 'achieved' | 'missed' | 'cancelled';
type FilterTab = GoalStatus | 'all';

interface Goal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  target_value: number;
  target_date: string;
  current_value: number;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

const GOAL_LABELS: Record<GoalType, string> = {
  revenue: 'Revenue',
  growth: 'Growth',
  new_accounts: 'New Accounts',
  visits: 'Visits',
};

const GOAL_ICONS: Record<GoalType, string> = {
  revenue: '$',
  growth: '%',
  new_accounts: '+',
  visits: '#',
};

const STATUS_COLORS: Record<GoalStatus, string> = {
  active: '#0d7377',
  achieved: '#10b981',
  missed: '#ef4444',
  cancelled: '#6b7280',
};

function formatValue(type: GoalType, value: number): string {
  if (type === 'revenue') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (type === 'growth') return `${value.toFixed(1)}%`;
  return value.toLocaleString();
}

function getDaysRemaining(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getProgressColor(progress: number, createdAt: string, targetDate: string): string {
  const start = new Date(createdAt).getTime();
  const end = new Date(targetDate).getTime();
  const now = Date.now();
  const total = end - start;
  const timeElapsed = total > 0 ? Math.min(1, Math.max(0, (now - start) / total)) : 1;

  if (progress >= timeElapsed * 0.8) return '#10b981';
  if (progress >= timeElapsed * 0.5) return '#f59e0b';
  return '#ef4444';
}

export default function GoalsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = activeTab !== 'all' ? `?status=${activeTab}` : '';
      const res = await fetch(`/api/goals${params}`);
      if (res.status === 401) {
        router.push('/login?redirect=/goals');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch goals');
      const data = await res.json();
      setGoals(data.goals || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, router]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleDelete = async (goalId: string) => {
    if (!confirm('Delete this goal?')) return;
    setDeletingId(goalId);
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (goal: Goal, newStatus: GoalStatus) => {
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      fetchGoals();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditGoal(null);
    fetchGoals();
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'achieved', label: 'Achieved' },
    { key: 'missed', label: 'Missed' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.headerTitle}>Goals</h1>
          <p style={styles.headerSubtitle}>Track your sales targets and progress</p>
        </div>
      </div>

      {/* Content */}
      <div style={{
        ...styles.content,
        padding: isMobile ? '16px' : '24px',
      }}>
        {/* Toolbar */}
        <div style={{
          ...styles.toolbar,
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '12px' : '16px',
        }}>
          {/* Filter Tabs */}
          <div style={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab.key ? styles.tabActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setEditGoal(null); setShowForm(true); }}
            style={styles.addButton}
          >
            + Add Goal
          </button>
        </div>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Loading */}
        {loading && (
          <div style={styles.loadingContainer}>
            <p>Loading goals...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && goals.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>
              {activeTab === 'all'
                ? 'No goals yet. Create your first goal to start tracking progress.'
                : `No ${activeTab} goals.`}
            </p>
            <button
              onClick={() => { setEditGoal(null); setShowForm(true); }}
              style={styles.addButton}
            >
              + Create Goal
            </button>
          </div>
        )}

        {/* Goal Cards */}
        {!loading && goals.length > 0 && (
          <div style={{
            ...styles.goalGrid,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
          }}>
            {goals.map((goal) => {
              const progress = goal.target_value > 0
                ? Math.min(100, (goal.current_value / goal.target_value) * 100)
                : 0;
              const daysLeft = getDaysRemaining(goal.target_date);
              const barColor = goal.status === 'active'
                ? getProgressColor(progress / 100, goal.created_at, goal.target_date)
                : STATUS_COLORS[goal.status];

              return (
                <div key={goal.id} style={styles.goalCard}>
                  {/* Card Header */}
                  <div style={styles.cardHeader}>
                    <div style={styles.goalIcon}>
                      {GOAL_ICONS[goal.goal_type]}
                    </div>
                    <div style={styles.cardHeaderInfo}>
                      <div style={styles.goalType}>
                        {GOAL_LABELS[goal.goal_type]}
                      </div>
                      <span style={{
                        ...styles.statusBadge,
                        background: STATUS_COLORS[goal.status],
                      }}>
                        {goal.status}
                      </span>
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={styles.progressSection}>
                    <div style={styles.progressValues}>
                      <span style={styles.currentValue}>
                        {formatValue(goal.goal_type, goal.current_value)}
                      </span>
                      <span style={styles.targetValue}>
                        / {formatValue(goal.goal_type, goal.target_value)}
                      </span>
                    </div>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${Math.max(progress, 2)}%`,
                          background: barColor,
                        }}
                      />
                    </div>
                    <div style={styles.progressMeta}>
                      <span>{Math.round(progress)}% complete</span>
                      <span>
                        {goal.status === 'active'
                          ? daysLeft > 0
                            ? `${daysLeft} days left`
                            : 'Past due'
                          : `Target: ${new Date(goal.target_date).toLocaleDateString()}`}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={styles.cardActions}>
                    {goal.status === 'active' && (
                      <>
                        <button
                          onClick={() => { setEditGoal(goal); setShowForm(true); }}
                          style={styles.editButton}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleStatusChange(goal, 'achieved')}
                          style={styles.achieveButton}
                        >
                          Mark Achieved
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(goal.id)}
                      disabled={deletingId === goal.id}
                      style={styles.deleteButton}
                    >
                      {deletingId === goal.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Goal Form Modal */}
      {showForm && (
        <GoalForm
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditGoal(null); }}
          editGoal={editGoal}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '24px',
  },
  pageHeaderContent: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '4px',
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    background: '#e5e7eb',
    borderRadius: '8px',
    padding: '3px',
  },
  tab: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#666',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  tabActive: {
    background: 'white',
    color: '#0d7377',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  addButton: {
    padding: '10px 20px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  error: {
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    marginBottom: '16px',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  emptyText: {
    color: '#666',
    marginBottom: '16px',
    fontSize: '16px',
  },
  goalGrid: {
    display: 'grid',
    gap: '16px',
  },
  goalCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  goalIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #0d7377 0%, #042829 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '16px',
    flexShrink: 0,
  },
  cardHeaderInfo: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalType: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    fontSize: '11px',
    padding: '3px 10px',
    borderRadius: '12px',
    color: 'white',
    textTransform: 'capitalize',
    fontWeight: '500',
  },
  progressSection: {
    marginBottom: '16px',
  },
  progressValues: {
    marginBottom: '8px',
  },
  currentValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#333',
  },
  targetValue: {
    fontSize: '14px',
    color: '#888',
    marginLeft: '4px',
  },
  barTrack: {
    height: '8px',
    background: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#888',
    marginTop: '6px',
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid #f0f0f0',
    paddingTop: '12px',
  },
  editButton: {
    padding: '6px 14px',
    background: '#f0fdf4',
    color: '#0d7377',
    border: '1px solid #0d7377',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  achieveButton: {
    padding: '6px 14px',
    background: '#f0fdf4',
    color: '#10b981',
    border: '1px solid #10b981',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  deleteButton: {
    padding: '6px 14px',
    background: '#fef2f2',
    color: '#ef4444',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    fontSize: '13px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
};
