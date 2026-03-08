/**
 * Goal Form Component
 * Modal form for creating and editing goals.
 */

'use client';

import { useState } from 'react';
import { useIsMobile } from '@/lib/hooks/use-media-query';

type GoalType = 'revenue' | 'growth' | 'new_accounts' | 'visits';

interface GoalFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  editGoal?: {
    id: string;
    goal_type: GoalType;
    target_value: number;
    target_date: string;
    current_value: number;
  } | null;
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  revenue: 'Revenue ($)',
  growth: 'Growth (%)',
  new_accounts: 'New Accounts',
  visits: 'Visits',
};

export default function GoalForm({ onSuccess, onCancel, editGoal }: GoalFormProps) {
  const isMobile = useIsMobile();
  const isEdit = !!editGoal;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>(editGoal?.goal_type || 'visits');
  const [targetValue, setTargetValue] = useState(editGoal?.target_value?.toString() || '');
  const [targetDate, setTargetDate] = useState(editGoal?.target_date || '');
  const [currentValue, setCurrentValue] = useState(editGoal?.current_value?.toString() || '0');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tv = parseFloat(targetValue);
    if (!tv || tv <= 0) {
      setError('Target value must be a positive number');
      setLoading(false);
      return;
    }

    if (!targetDate) {
      setError('Target date is required');
      setLoading(false);
      return;
    }

    try {
      if (isEdit) {
        const updates: Record<string, unknown> = {
          target_value: tv,
          target_date: targetDate,
        };
        // Only allow manual current_value update for non-visit goals
        if (goalType !== 'visits') {
          updates.current_value = parseFloat(currentValue) || 0;
        }

        const res = await fetch(`/api/goals/${editGoal!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update goal');
        }
      } else {
        const res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal_type: goalType,
            target_value: tv,
            target_date: targetDate,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create goal');
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div
        style={{
          ...styles.modal,
          ...(isMobile ? { width: '95%', padding: '16px' } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div style={styles.header}>
            <h2 style={styles.title}>{isEdit ? 'Edit Goal' : 'Add Goal'}</h2>
            <button type="button" onClick={onCancel} style={styles.closeButton}>
              ×
            </button>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.field}>
            <label style={styles.label}>Goal Type</label>
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
              disabled={isEdit}
              style={{
                ...styles.select,
                ...(isEdit ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
              }}
            >
              {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Target Value
              {goalType === 'revenue' && ' ($)'}
              {goalType === 'growth' && ' (%)'}
            </label>
            <input
              type="number"
              step={goalType === 'growth' ? '0.1' : '1'}
              min="0.01"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              required
              style={styles.input}
              placeholder={
                goalType === 'revenue'
                  ? '50000'
                  : goalType === 'growth'
                  ? '15'
                  : goalType === 'visits'
                  ? '100'
                  : '20'
              }
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          {isEdit && goalType !== 'visits' && (
            <div style={styles.field}>
              <label style={styles.label}>Current Value</label>
              <input
                type="number"
                step={goalType === 'growth' ? '0.1' : '1'}
                min="0"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                style={styles.input}
              />
            </div>
          )}

          {isEdit && goalType === 'visits' && (
            <div style={styles.hint}>
              Visit count is auto-computed from your logged activities.
            </div>
          )}

          <div style={styles.actions}>
            <button type="submit" disabled={loading} style={styles.submitButton}>
              {loading ? 'Saving...' : isEdit ? 'Update Goal' : 'Create Goal'}
            </button>
            <button type="button" onClick={onCancel} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '440px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#999',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  },
  error: {
    padding: '10px 12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  hint: {
    padding: '10px 12px',
    background: '#f0fdf4',
    color: '#166534',
    borderRadius: '6px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  },
  submitButton: {
    padding: '10px 20px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '10px 20px',
    background: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
};
