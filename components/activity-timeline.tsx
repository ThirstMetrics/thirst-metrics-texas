/**
 * Activity Timeline Component
 * Displays activities and activity form
 */

'use client';

import { useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { SalesActivity } from '@/lib/data/activities';
import ActivityForm from './activity-form';

interface ActivityTimelineProps {
  activities: SalesActivity[];
  permitNumber: string;
  userId: string;
  onActivityCreated: () => void;
  showForm: boolean;
  onCloseForm: () => void;
}

export default function ActivityTimeline(props: ActivityTimelineProps) {
  const { activities, permitNumber, userId, onActivityCreated, showForm, onCloseForm } = props;
  
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
        <p>No activities recorded yet.</p>
      </div>
    );
  }
  
  return (
    <div>
      <div style={styles.timeline}>
        {activities.map((activity) => (
          <div key={activity.id} style={styles.activityItem}>
            <div style={styles.activityHeader}>
              <span style={styles.icon}>{getActivityTypeIcon(activity.activity_type)}</span>
              <div style={styles.activityInfo}>
                <div style={styles.activityType}>
                  {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                </div>
                <div style={styles.activityDate}>
                  {(() => {
                    try {
                      let date = parseISO(activity.activity_date);
                      if (!isValid(date)) {
                        date = new Date(activity.activity_date);
                        if (isNaN(date.getTime())) {
                          return 'Invalid Date';
                        }
                      }
                      return format(date, 'MMM d, yyyy');
                    } catch (error) {
                      return 'Invalid Date';
                    }
                  })()}
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
            {activity.contact_name && (
              <div style={styles.contactInfo}>
                <strong>Contact:</strong> {activity.contact_name}
                {activity.contact_cell_phone && ` • ${activity.contact_cell_phone}`}
                {activity.contact_email && ` • ${activity.contact_email}`}
              </div>
            )}
            {activity.next_followup_date && (
              <div style={styles.followup}>
                <strong>Next follow-up:</strong>{' '}
                {(() => {
                  try {
                    let date = parseISO(activity.next_followup_date);
                    if (!isValid(date)) {
                      date = new Date(activity.next_followup_date);
                      if (isNaN(date.getTime())) {
                        return 'Invalid Date';
                      }
                    }
                    return format(date, 'MMM d, yyyy');
                  } catch (error) {
                    return 'Invalid Date';
                  }
                })()}
              </div>
            )}
          </div>
        ))}
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
};
