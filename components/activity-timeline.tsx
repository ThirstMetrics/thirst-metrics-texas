/**
 * Activity Timeline Component
 * Displays activities (with photos, summary, next action, product interest) and activity form
 */

'use client';

import { useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { SalesActivity } from '@/lib/data/activities';
import ActivityForm from './activity-form';

function formatActivityDate(dateStr: string): string {
  try {
    let date = parseISO(dateStr);
    if (!isValid(date)) {
      date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid Date';
    }
    return format(date, 'MMM d, yyyy');
  } catch {
    return 'Invalid Date';
  }
}

interface ActivityTimelineProps {
  activities: SalesActivity[];
  permitNumber: string;
  userId: string;
  onActivityCreated: () => void;
  showForm: boolean;
  onCloseForm: () => void;
  /** When provided, empty state shows "Log first activity" and calls this to open the form */
  onOpenForm?: () => void;
}

export default function ActivityTimeline(props: ActivityTimelineProps) {
  const { activities, permitNumber, userId, onActivityCreated, showForm, onCloseForm, onOpenForm } = props;
  
  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'visit': return '📍';
      case 'call': return '📞';
      case 'email': return '📧';
      case 'note': return '📝';
      default: return '•';
    }
  };
  
  const getOutcomeColor = (outcome?: string | null) => {
    switch (outcome) {
      case 'positive': return '#43e97b';
      case 'neutral': return '#999';
      case 'negative': return '#f093fb';
      case 'no_contact': return '#ff6b6b';
      default: return '#ccc';
    }
  };
  
  if (showForm) {
    return (
      <ActivityForm
        permitNumber={permitNumber}
        userId={userId}
        onSuccess={onActivityCreated}
        onCancel={onCloseForm}
      />
    );
  }
  
  if (activities.length === 0) {
    return (
      <div style={styles.empty}>
        <p style={{ marginBottom: '12px' }}>No activities recorded yet.</p>
        {onOpenForm && (
          <button
            type="button"
            onClick={onOpenForm}
            style={styles.addButton}
          >
            Log first activity
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div>
      <div style={styles.timeline}>
        {activities.map((activity) => {
          const photos = Array.isArray(activity.activity_photos) ? activity.activity_photos : [];
          return (
            <div key={activity.id} style={styles.activityItem}>
              <div style={styles.activityHeader}>
                <span style={styles.icon}>{getActivityTypeIcon(activity.activity_type)}</span>
                <div style={styles.activityInfo}>
                  <div style={styles.activityType}>
                    {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                  </div>
                  <div style={styles.activityDate}>
                    {formatActivityDate(activity.activity_date)}
                  </div>
                </div>
                {activity.outcome && (
                  <div
                    style={{
                      ...styles.outcomeBadge,
                      background: getOutcomeColor(activity.outcome),
                    }}
                  >
                    {activity.outcome}
                  </div>
                )}
              </div>
              {activity.notes && (
                <div style={styles.notes}>{activity.notes}</div>
              )}
              {activity.conversation_summary && (
                <div style={styles.intel}>
                  <strong>Summary:</strong> {activity.conversation_summary}
                </div>
              )}
              {activity.product_interest && activity.product_interest.length > 0 && (
                <div style={styles.intel}>
                  <strong>Product interest:</strong>{' '}
                  {activity.product_interest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')}
                </div>
              )}
              {activity.next_action && (
                <div style={styles.nextAction}>
                  <strong>Next action:</strong> {activity.next_action}
                </div>
              )}
              {activity.contact_name && (
                <div style={styles.contactInfo}>
                  <strong>Contact:</strong> {activity.contact_name}
                  {activity.contact_cell_phone && ` • ${activity.contact_cell_phone}`}
                  {activity.contact_email && ` • ${activity.contact_email}`}
                </div>
              )}
              {activity.next_followup_date && (
                <div style={styles.followup}>
                  <strong>Next follow-up:</strong> {formatActivityDate(activity.next_followup_date)}
                </div>
              )}
              {photos.length > 0 && (
                <div style={styles.photos}>
                  {photos.slice(0, 5).map((p) => (
                    <a
                      key={p.id}
                      href={p.photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.photoThumb}
                      title={p.photo_type || 'Photo'}
                    >
                      <img src={p.photo_url} alt="" style={styles.photoImg} />
                    </a>
                  ))}
                  {photos.length > 5 && (
                    <span style={styles.photoMore}>+{photos.length - 5}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  empty: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#999',
  },
  addButton: {
    marginTop: '16px',
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  activityItem: {
    padding: '16px',
    background: '#f9f9f9',
    borderRadius: '8px',
    borderLeft: '4px solid #667eea',
  },
  activityHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  icon: {
    fontSize: '20px',
  },
  activityInfo: {
    flex: 1,
  },
  activityType: {
    fontWeight: '600',
    fontSize: '16px',
    color: '#333',
  },
  activityDate: {
    fontSize: '12px',
    color: '#666',
    marginTop: '2px',
  },
  outcomeBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize' as const,
  },
  notes: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.5',
  },
  contactInfo: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#666',
  },
  followup: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#667eea',
  },
  intel: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#555',
    lineHeight: 1.4,
  },
  nextAction: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#333',
    fontWeight: 500,
  },
  photos: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginTop: '12px',
    alignItems: 'center',
  },
  photoThumb: {
    display: 'block',
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #ddd',
    flexShrink: 0,
  },
  photoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  photoMore: {
    fontSize: '13px',
    color: '#666',
  },
};
