/**
 * Goals Widget
 * Dashboard widget showing up to 5 active goals with progress bars.
 */

'use client';

import Link from 'next/link';

interface Goal {
  id: string;
  goal_type: 'revenue' | 'growth' | 'new_accounts' | 'visits';
  target_value: number;
  target_date: string;
  current_value: number;
  status: string;
  created_at: string;
}

interface GoalsWidgetProps {
  goals: Goal[];
}

const GOAL_ICONS: Record<string, string> = {
  revenue: '$',
  growth: '%',
  new_accounts: '+',
  visits: '#',
};

const GOAL_LABELS: Record<string, string> = {
  revenue: 'Revenue',
  growth: 'Growth',
  new_accounts: 'New Accounts',
  visits: 'Visits',
};

function getProgressColor(progress: number, timeElapsed: number): string {
  // Compare progress % vs time elapsed %
  if (progress >= timeElapsed * 0.8) return '#10b981'; // on track (green)
  if (progress >= timeElapsed * 0.5) return '#f59e0b'; // behind (yellow)
  return '#ef4444'; // at risk (red)
}

function getDaysRemaining(targetDate: string): number {
  const now = new Date();
  const target = new Date(targetDate);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getTimeElapsed(createdAt: string, targetDate: string): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(targetDate).getTime();
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / total));
}

function formatValue(type: string, value: number): string {
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

export default function GoalsWidget({ goals }: GoalsWidgetProps) {
  if (goals.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Goals</h2>
          <Link href="/goals" style={styles.viewAllLink}>
            Add Goal
          </Link>
        </div>
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No active goals yet</p>
          <Link href="/goals" style={styles.emptyLink}>
            Set your first goal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Goals</h2>
        <Link href="/goals" style={styles.viewAllLink}>
          View All
        </Link>
      </div>
      <div style={styles.list}>
        {goals.slice(0, 5).map((goal) => {
          const progress = goal.target_value > 0
            ? Math.min(100, (goal.current_value / goal.target_value) * 100)
            : 0;
          const timeElapsed = getTimeElapsed(goal.created_at, goal.target_date);
          const daysLeft = getDaysRemaining(goal.target_date);
          const barColor = getProgressColor(progress / 100, timeElapsed);

          return (
            <div key={goal.id} style={styles.goalItem}>
              <div style={styles.goalTop}>
                <div style={styles.goalIcon}>{GOAL_ICONS[goal.goal_type]}</div>
                <div style={styles.goalInfo}>
                  <div style={styles.goalLabel}>
                    {GOAL_LABELS[goal.goal_type]}
                  </div>
                  <div style={styles.goalValues}>
                    {formatValue(goal.goal_type, goal.current_value)} / {formatValue(goal.goal_type, goal.target_value)}
                  </div>
                </div>
                <div style={styles.goalDays}>
                  {daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}
                </div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    margin: 0,
  },
  viewAllLink: {
    fontSize: '14px',
    color: '#0d7377',
    textDecoration: 'none',
    fontWeight: '500',
  },
  emptyState: {
    textAlign: 'center',
    padding: '16px',
  },
  emptyText: {
    color: '#666',
    marginBottom: '8px',
  },
  emptyLink: {
    color: '#0d7377',
    textDecoration: 'underline',
    fontSize: '14px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  goalItem: {
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '8px',
  },
  goalTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  goalIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #0d7377 0%, #042829 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '14px',
    flexShrink: 0,
  },
  goalInfo: {
    flex: 1,
    minWidth: 0,
  },
  goalLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  goalValues: {
    fontSize: '12px',
    color: '#666',
    marginTop: '2px',
  },
  goalDays: {
    fontSize: '12px',
    color: '#888',
    whiteSpace: 'nowrap',
  },
  barTrack: {
    height: '6px',
    background: '#e5e7eb',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
};
