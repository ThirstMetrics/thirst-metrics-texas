/**
 * Activity Timeline Component
 * Displays activities with expand/collapse for full CRM details
 * Includes GPS display, photo viewer integration, and inline OCR text
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

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    let date = parseISO(dateStr);
    if (!isValid(date)) {
      date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
    }
    return format(date, 'MMM d, yyyy h:mm a');
  } catch {
    return '';
  }
}

interface ActivityTimelineProps {
  activities: SalesActivity[];
  permitNumber: string;
  userId: string;
  onActivityCreated: () => void;
  showForm: boolean;
  onCloseForm: () => void;
  onOpenForm?: () => void;
}

export default function ActivityTimeline(props: ActivityTimelineProps) {
  const { activities, permitNumber, userId, onActivityCreated, showForm, onCloseForm, onOpenForm } = props;

  // Show/hide older activities - only show most recent by default
  const [showAllActivities, setShowAllActivities] = useState(false);
  const VISIBLE_COUNT = 1; // Show only most recent activity by default

  // Expand/collapse state - auto-expand the most recent
  const [expandedId, setExpandedId] = useState<string | null>(
    activities.length > 0 ? activities[0]?.id || null : null
  );

  // Photo viewer state
  const [viewerPhotos, setViewerPhotos] = useState<Photo[]>([]);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  const [showViewer, setShowViewer] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Determine which activities to display
  const visibleActivities = showAllActivities ? activities : activities.slice(0, VISIBLE_COUNT);
  const hiddenCount = activities.length - VISIBLE_COUNT;

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

  const formatPreferredMethod = (method?: string | null) => {
    switch (method) {
      case 'text': return 'Text';
      case 'call': return 'Phone Call';
      case 'email': return 'Email';
      case 'in_person': return 'In Person';
      default: return method;
    }
  };

  // Check if activity has any availability set
  const hasAvailability = (activity: SalesActivity) => {
    return activity.avail_monday_am || activity.avail_monday_pm ||
      activity.avail_tuesday_am || activity.avail_tuesday_pm ||
      activity.avail_wednesday_am || activity.avail_wednesday_pm ||
      activity.avail_thursday_am || activity.avail_thursday_pm ||
      activity.avail_friday_am || activity.avail_friday_pm ||
      activity.avail_saturday_am || activity.avail_saturday_pm ||
      activity.avail_sunday_am || activity.avail_sunday_pm;
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
          <button type="button" onClick={onOpenForm} style={styles.addButton}>
            Log first activity
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={styles.timeline}>
        {visibleActivities.map((activity) => {
          const photos = Array.isArray(activity.activity_photos) ? activity.activity_photos : [];
          const isExpanded = expandedId === activity.id;
          const photoCount = photos.length;
          const hasOcr = photos.some(p => p.ocr_text);

          return (
            <div key={activity.id} style={styles.activityItem}>
              {/* Clickable Header */}
              <div
                style={styles.activityHeader}
                onClick={() => toggleExpand(activity.id!)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpand(activity.id!);
                  }
                }}
              >
                <span style={styles.icon}>{getActivityTypeIcon(activity.activity_type)}</span>
                <div style={styles.activityInfo}>
                  <div style={styles.activityType}>
                    {activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1)}
                  </div>
                  <div style={styles.activityDate}>
                    {formatActivityDate(activity.activity_date)}
                    {photoCount > 0 && (
                      <span style={styles.photoIndicator}>
                        📷 {photoCount} {hasOcr && '• 📝 OCR'}
                      </span>
                    )}
                  </div>
                </div>
                {activity.outcome && (
                  <div style={{ ...styles.outcomeBadge, background: getOutcomeColor(activity.outcome) }}>
                    {activity.outcome}
                  </div>
                )}
                <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
              </div>

              {/* Collapsed Preview */}
              {!isExpanded && activity.notes && (
                <div style={styles.notesPreview}>
                  {activity.notes.length > 100 ? activity.notes.slice(0, 100) + '...' : activity.notes}
                </div>
              )}

              {/* Expanded Content */}
              {isExpanded && (
                <div style={styles.expandedContent}>
                  {/* Section: Notes & Summary */}
                  {(activity.notes || activity.conversation_summary) && (
                    <div style={styles.section}>
                      {activity.notes && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Notes</div>
                          <div style={styles.fieldValue}>{activity.notes}</div>
                        </div>
                      )}
                      {activity.conversation_summary && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Conversation Summary</div>
                          <div style={styles.fieldValue}>{activity.conversation_summary}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section: Contact Information */}
                  {(activity.contact_name || activity.contact_cell_phone || activity.contact_email) && (
                    <div style={styles.section}>
                      <div style={styles.sectionHeader}>Contact Information</div>
                      <div style={styles.fieldGrid}>
                        {activity.contact_name && (
                          <div style={styles.field}>
                            <div style={styles.fieldLabel}>Name</div>
                            <div style={styles.fieldValue}>
                              {activity.contact_name}
                              {activity.decision_maker && <span style={styles.decisionMakerBadge}>✓ Decision Maker</span>}
                            </div>
                          </div>
                        )}
                        {activity.contact_cell_phone && (
                          <div style={styles.field}>
                            <div style={styles.fieldLabel}>Phone</div>
                            <div style={styles.fieldValue}>{activity.contact_cell_phone}</div>
                          </div>
                        )}
                        {activity.contact_email && (
                          <div style={styles.field}>
                            <div style={styles.fieldLabel}>Email</div>
                            <div style={styles.fieldValue}>{activity.contact_email}</div>
                          </div>
                        )}
                        {activity.contact_preferred_method && (
                          <div style={styles.field}>
                            <div style={styles.fieldLabel}>Preferred Contact</div>
                            <div style={styles.fieldValue}>{formatPreferredMethod(activity.contact_preferred_method)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section: Sales Intelligence */}
                  {(activity.product_interest?.length || activity.current_products_carried || activity.objections || activity.competitors_mentioned?.length || activity.next_action) && (
                    <div style={styles.section}>
                      <div style={styles.sectionHeader}>Sales Intelligence</div>
                      {activity.product_interest && activity.product_interest.length > 0 && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Product Interest</div>
                          <div style={styles.tagContainer}>
                            {activity.product_interest.map((p, i) => (
                              <span key={i} style={styles.tag}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {activity.current_products_carried && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Current Products Carried</div>
                          <div style={styles.fieldValue}>{activity.current_products_carried}</div>
                        </div>
                      )}
                      {activity.objections && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Objections</div>
                          <div style={styles.fieldValue}>{activity.objections}</div>
                        </div>
                      )}
                      {activity.competitors_mentioned && activity.competitors_mentioned.length > 0 && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Competitors Mentioned</div>
                          <div style={styles.tagContainer}>
                            {activity.competitors_mentioned.map((c, i) => (
                              <span key={i} style={styles.tagCompetitor}>{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {activity.next_action && (
                        <div style={styles.field}>
                          <div style={styles.fieldLabel}>Next Action</div>
                          <div style={styles.fieldValueBold}>{activity.next_action}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section: Availability */}
                  {hasAvailability(activity) && (
                    <div style={styles.section}>
                      <div style={styles.sectionHeader}>Availability</div>
                      <div style={styles.availabilityGrid}>
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                          const dayLower = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][idx];
                          const am = activity[`avail_${dayLower}_am` as keyof SalesActivity];
                          const pm = activity[`avail_${dayLower}_pm` as keyof SalesActivity];
                          return (
                            <div key={day} style={styles.availDay}>
                              <div style={styles.availDayLabel}>{day}</div>
                              <div style={{ ...styles.availSlot, backgroundColor: am ? brandColors.primaryLight : '#f5f5f5', color: am ? brandColors.primaryDark : '#ccc' }}>
                                AM
                              </div>
                              <div style={{ ...styles.availSlot, backgroundColor: pm ? brandColors.primaryLight : '#f5f5f5', color: pm ? brandColors.primaryDark : '#ccc' }}>
                                PM
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Section: Follow-up & Location */}
                  {(activity.next_followup_date || activity.gps_latitude) && (
                    <div style={styles.section}>
                      <div style={styles.sectionHeader}>Follow-up & Location</div>
                      <div style={styles.fieldGrid}>
                        {activity.next_followup_date && (
                          <div style={styles.field}>
                            <div style={styles.fieldLabel}>Next Follow-up</div>
                            <div style={styles.fieldValueHighlight}>{formatActivityDate(activity.next_followup_date)}</div>
                          </div>
                        )}
                        {activity.gps_latitude && activity.gps_longitude && (
                          <div style={styles.field}>
                            <div style={styles.fieldLabel}>GPS Location</div>
                            <a
                              href={getGoogleMapsUrl(activity.gps_latitude, activity.gps_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={styles.gpsLink}
                              onClick={(e) => e.stopPropagation()}
                            >
                              📍 {formatGPS(activity.gps_latitude, activity.gps_longitude, activity.gps_accuracy_meters)}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Section: Photos & OCR */}
                  {photos.length > 0 && (
                    <div style={styles.section}>
                      <div style={styles.sectionHeader}>Photos & OCR</div>
                      <div style={styles.photosExpanded}>
                        {photos.map((p, idx) => (
                          <div key={p.id} style={styles.photoCard}>
                            <button
                              onClick={(e) => { e.stopPropagation(); openPhotoViewer(photos as Photo[], idx); }}
                              style={styles.photoThumbLarge}
                              type="button"
                            >
                              <img src={p.photo_url} alt="" style={styles.photoImgLarge} />
                            </button>
                            <div style={styles.photoMeta}>
                              <span style={styles.photoType}>{p.photo_type || 'Photo'}</span>
                              {p.file_size_bytes && (
                                <span style={styles.photoSize}>{(p.file_size_bytes / 1024).toFixed(0)} KB</span>
                              )}
                            </div>
                            {p.ocr_text && (
                              <div style={styles.ocrPreview}>
                                <div style={styles.ocrHeader}>📝 Extracted Text</div>
                                <pre style={styles.ocrText}>{p.ocr_text}</pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section: Metadata */}
                  <div style={styles.metadata}>
                    {activity.created_at && (
                      <span>Created: {formatDateTime(activity.created_at)}</span>
                    )}
                    {activity.updated_at && activity.updated_at !== activity.created_at && (
                      <span>Updated: {formatDateTime(activity.updated_at)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Show More / Show Less Button */}
      {hiddenCount > 0 && (
        <div style={styles.showMoreContainer}>
          <button
            type="button"
            onClick={() => setShowAllActivities(!showAllActivities)}
            style={styles.showMoreButton}
          >
            {showAllActivities
              ? '▲ Show less'
              : `▼ Show ${hiddenCount} more activit${hiddenCount === 1 ? 'y' : 'ies'}`}
          </button>
        </div>
      )}

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
    gap: '12px',
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
    cursor: 'pointer',
    userSelect: 'none' as const,
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
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  photoIndicator: {
    color: '#999',
    fontSize: '11px',
  },
  outcomeBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize' as const,
  },
  expandIcon: {
    fontSize: '12px',
    color: '#999',
    marginLeft: '8px',
  },
  notesPreview: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.4',
    paddingLeft: '32px',
  },
  expandedContent: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e0e0e0',
  },
  section: {
    marginBottom: '20px',
  },
  sectionHeader: {
    fontSize: '13px',
    fontWeight: '600',
    color: brandColors.primary,
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  field: {
    marginBottom: '12px',
  },
  fieldLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  fieldValue: {
    fontSize: '14px',
    color: '#333',
    lineHeight: '1.4',
  },
  fieldValueBold: {
    fontSize: '14px',
    color: '#333',
    fontWeight: '600',
    lineHeight: '1.4',
  },
  fieldValueHighlight: {
    fontSize: '14px',
    color: brandColors.primary,
    fontWeight: '600',
  },
  decisionMakerBadge: {
    marginLeft: '8px',
    padding: '2px 6px',
    backgroundColor: brandColors.primaryLight,
    color: brandColors.primaryDark,
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '500',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  tag: {
    display: 'inline-block',
    padding: '4px 10px',
    backgroundColor: brandColors.primaryLight,
    color: brandColors.primaryDark,
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '500',
  },
  tagCompetitor: {
    display: 'inline-block',
    padding: '4px 10px',
    backgroundColor: '#fff3e0',
    color: '#e65100',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '500',
  },
  availabilityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '8px',
    marginTop: '8px',
  },
  availDay: {
    textAlign: 'center' as const,
  },
  availDayLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '4px',
  },
  availSlot: {
    fontSize: '10px',
    padding: '4px 2px',
    borderRadius: '4px',
    marginBottom: '2px',
    fontWeight: '500',
  },
  gpsLink: {
    color: '#666',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 10px',
    backgroundColor: '#f0f0f0',
    borderRadius: '4px',
    fontSize: '13px',
    transition: 'background-color 0.2s',
  },
  photosExpanded: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  photoCard: {
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  photoThumbLarge: {
    display: 'block',
    width: '100%',
    height: '150px',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    background: 'none',
  },
  photoImgLarge: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  photoMeta: {
    padding: '8px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #f0f0f0',
  },
  photoType: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#333',
    textTransform: 'capitalize' as const,
  },
  photoSize: {
    fontSize: '11px',
    color: '#999',
  },
  ocrPreview: {
    padding: '12px',
    backgroundColor: '#fafafa',
  },
  ocrHeader: {
    fontSize: '12px',
    fontWeight: '600',
    color: brandColors.primary,
    marginBottom: '8px',
  },
  ocrText: {
    fontSize: '12px',
    color: '#555',
    fontFamily: "'Courier New', Consolas, monospace",
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    margin: 0,
    maxHeight: '200px',
    overflow: 'auto',
    lineHeight: '1.5',
  },
  metadata: {
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid #e0e0e0',
    fontSize: '11px',
    color: '#999',
    display: 'flex',
    gap: '16px',
  },
  showMoreContainer: {
    marginTop: '12px',
    textAlign: 'center' as const,
  },
  showMoreButton: {
    padding: '10px 20px',
    backgroundColor: 'white',
    border: `1px solid ${brandColors.primary}`,
    color: brandColors.primary,
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};
