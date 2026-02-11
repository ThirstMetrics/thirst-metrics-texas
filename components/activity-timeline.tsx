/**
 * Activity Timeline Component
 * Displays activities (with photos, summary, next action, product interest) and activity form
 * Includes GPS display and photo viewer integration
 */

'use client';

import { useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { SalesActivity } from '@/lib/data/activities';
import ActivityForm from './activity-form';
import PhotoViewer, { Photo } from './photo-viewer';

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

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

  // Photo viewer state
  const [viewerPhotos, setViewerPhotos] = useState<Photo[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [showViewer, setShowViewer] = useState(false);

  const openPhotoViewer = (photos: Photo[], index: number) => {
    setViewerPhotos(photos);
    setViewerInitialIndex(index);
    setShowViewer(true);
  };

  const closePhotoViewer = () => {
    setShowViewer(false);
    setViewerPhotos([]);
  };

  const formatGPS = (lat?: number | null, lng?: number | null, accuracy?: number | null) => {
    if (!lat || !lng) return null;
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    const accuracyStr = accuracy ? ` (±${Math.round(accuracy)}m)` : '';
    return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}${accuracyStr}`;
  };

  const getGoogleMapsUrl = (lat: number, lng: number) => {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

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
              {/* GPS Display */}
              {activity.gps_latitude && activity.gps_longitude && (
                <div style={styles.gpsDisplay}>
                  <a
                    href={getGoogleMapsUrl(activity.gps_latitude, activity.gps_longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.gpsLink}
                    title="Open in Google Maps"
                  >
                    📍 {formatGPS(activity.gps_latitude, activity.gps_longitude, activity.gps_accuracy_meters)}
                  </a>
                </div>
              )}
              {/* Photo thumbnails - clickable to open viewer */}
              {photos.length > 0 && (
                <div style={styles.photos}>
                  {photos.slice(0, 5).map((p, idx) => (
                    <button
                      key={p.id}
                      onClick={() => openPhotoViewer(photos as Photo[], idx)}
                      style={styles.photoThumb}
                      title={`${p.photo_type || 'Photo'}${p.ocr_text ? ' (OCR available)' : ''}`}
                      type="button"
                    >
                      <img src={p.photo_url} alt="" style={styles.photoImg} />
                      {p.ocr_text && <span style={styles.ocrBadge}>📝</span>}
                    </button>
                  ))}
                  {photos.length > 5 && (
                    <button
                      onClick={() => openPhotoViewer(photos as Photo[], 5)}
                      style={styles.photoMoreBtn}
                      type="button"
                    >
                      +{photos.length - 5} more
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Photo Viewer Modal */}
      {showViewer && viewerPhotos.length > 0 && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerInitialIndex}
          onClose={closePhotoViewer}
        />
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  empty: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#999',
  },
  addButton: {
    marginTop: '16px',
    padding: '10px 20px',
    background: brandColors.primary,
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
    borderLeft: `4px solid ${brandColors.primary}`,
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
    color: brandColors.primary,
  },
  gpsDisplay: {
    marginTop: '10px',
    fontSize: '12px',
  },
  gpsLink: {
    color: '#666',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
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
    position: 'relative' as const,
    display: 'block',
    width: '48px',
    height: '48px',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #ddd',
    flexShrink: 0,
    cursor: 'pointer',
    padding: 0,
    background: 'none',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  photoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  ocrBadge: {
    position: 'absolute' as const,
    bottom: '2px',
    right: '2px',
    fontSize: '10px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: '3px',
    padding: '1px 3px',
  },
  photoMore: {
    fontSize: '13px',
    color: '#666',
  },
  photoMoreBtn: {
    fontSize: '12px',
    color: brandColors.primary,
    background: brandColors.primaryLight,
    border: 'none',
    borderRadius: '4px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
