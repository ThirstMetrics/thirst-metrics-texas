/**
 * Activities Client Component
 * Displays filterable, expandable activity cards with pagination
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useIsMobile } from '@/lib/hooks/use-media-query';

// ============================================
// Types
// ============================================

interface ActivityPhoto {
  id: string;
  photo_url: string;
  photo_type: string | null;
  ocr_text: string | null;
}

interface SalesActivity {
  id: string;
  user_id: string;
  tabc_permit_number: string;
  activity_type: 'visit' | 'call' | 'email' | 'note';
  activity_date: string;
  notes: string | null;
  outcome: 'positive' | 'neutral' | 'negative' | 'no_contact' | null;
  contact_name: string | null;
  contact_cell_phone: string | null;
  contact_email: string | null;
  next_followup_date: string | null;
  conversation_summary: string | null;
  product_interest: string[] | null;
  current_products_carried: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  created_at: string;
  activity_photos: ActivityPhoto[];
}

type ActivityTypeFilter = 'all' | 'visit' | 'call' | 'email' | 'note';
type OutcomeFilter = 'all' | 'positive' | 'neutral' | 'negative' | 'no_contact';
type DateRangeFilter = '7' | '30' | '90' | 'all';

// ============================================
// Constants
// ============================================

const ITEMS_PER_PAGE = 20;

const BRAND = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
  hover: '#0a5f63',
};

const OUTCOME_COLORS: Record<string, string> = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#ef4444',
  no_contact: '#f59e0b',
};

const ACTIVITY_ICONS: Record<string, string> = {
  visit: '\u{1F3E2}',   // office building
  call: '\u{1F4DE}',    // telephone
  email: '\u{1F4E7}',   // email
  note: '\u{1F4DD}',    // memo
};

const ACTIVITY_LABELS: Record<string, string> = {
  visit: 'Visit',
  call: 'Call',
  email: 'Email',
  note: 'Note',
};

const OUTCOME_LABELS: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  no_contact: 'No Contact',
};

// ============================================
// Helpers
// ============================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isWithinDays(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return date >= cutoff;
}

// ============================================
// Component
// ============================================

export default function ActivitiesClient() {
  const isMobile = useIsMobile();

  // Data state
  const [activities, setActivities] = useState<SalesActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [typeFilter, setTypeFilter] = useState<ActivityTypeFilter>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Pagination state
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  // Expanded card state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ----------------------------------------
  // Data fetching
  // ----------------------------------------

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/activities');
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch activities');
      }
      const result = await response.json();
      setActivities(result.activities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // ----------------------------------------
  // Filtering
  // ----------------------------------------

  const filteredActivities = useMemo(() => {
    let result = activities;

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((a) => a.activity_type === typeFilter);
    }

    // Outcome filter
    if (outcomeFilter !== 'all') {
      result = result.filter((a) => a.outcome === outcomeFilter);
    }

    // Date range filter
    if (dateRange !== 'all') {
      const days = parseInt(dateRange, 10);
      result = result.filter((a) => isWithinDays(a.activity_date, days));
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.tabc_permit_number.toLowerCase().includes(q) ||
          (a.contact_name && a.contact_name.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q)) ||
          (a.conversation_summary && a.conversation_summary.toLowerCase().includes(q))
      );
    }

    return result;
  }, [activities, typeFilter, outcomeFilter, dateRange, searchQuery]);

  const visibleActivities = useMemo(
    () => filteredActivities.slice(0, visibleCount),
    [filteredActivities, visibleCount]
  );

  const hasMore = visibleCount < filteredActivities.length;

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [typeFilter, outcomeFilter, dateRange, searchQuery]);

  // ----------------------------------------
  // Render: Loading
  // ----------------------------------------

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.skeletonBar} />
        <div style={styles.skeletonFilters}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={styles.skeletonPill} />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={styles.skeletonCard}>
            <div style={styles.skeletonLine} />
            <div style={{ ...styles.skeletonLine, width: '60%' }} />
            <div style={{ ...styles.skeletonLine, width: '80%' }} />
          </div>
        ))}
      </div>
    );
  }

  // ----------------------------------------
  // Render: Error
  // ----------------------------------------

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>Error: {error}</p>
        <button onClick={fetchActivities} style={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  // ----------------------------------------
  // Render: Filters
  // ----------------------------------------

  const filtersContent = (
    <div style={styles.filtersInner}>
      {/* Activity Type Pills */}
      <div style={styles.filterGroup}>
        <div style={styles.filterLabel}>Type</div>
        <div style={styles.pillRow}>
          {(['all', 'visit', 'call', 'email', 'note'] as ActivityTypeFilter[]).map(
            (type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                style={{
                  ...styles.pill,
                  ...(typeFilter === type ? styles.pillActive : {}),
                }}
              >
                {type === 'all' ? 'All' : `${ACTIVITY_ICONS[type]} ${ACTIVITY_LABELS[type]}`}
              </button>
            )
          )}
        </div>
      </div>

      {/* Outcome Filter */}
      <div style={styles.filterGroup}>
        <div style={styles.filterLabel}>Outcome</div>
        <div style={styles.pillRow}>
          {(['all', 'positive', 'neutral', 'negative', 'no_contact'] as OutcomeFilter[]).map(
            (outcome) => (
              <button
                key={outcome}
                onClick={() => setOutcomeFilter(outcome)}
                style={{
                  ...styles.pill,
                  ...(outcomeFilter === outcome ? styles.pillActive : {}),
                  ...(outcomeFilter === outcome && outcome !== 'all'
                    ? { backgroundColor: OUTCOME_COLORS[outcome], borderColor: OUTCOME_COLORS[outcome], color: 'white' }
                    : {}),
                }}
              >
                {outcome === 'all' ? 'All' : OUTCOME_LABELS[outcome]}
              </button>
            )
          )}
        </div>
      </div>

      {/* Date Range */}
      <div style={styles.filterGroup}>
        <div style={styles.filterLabel}>Date Range</div>
        <div style={styles.pillRow}>
          {([
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: 'all', label: 'All' },
          ] as { value: DateRangeFilter; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              style={{
                ...styles.pill,
                ...(dateRange === opt.value ? styles.pillActive : {}),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={styles.filterGroup}>
        <div style={styles.filterLabel}>Search</div>
        <input
          type="text"
          placeholder="Permit number, contact, notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>
    </div>
  );

  // ----------------------------------------
  // Render: Main
  // ----------------------------------------

  return (
    <div style={styles.container}>
      {/* Count banner */}
      <div style={styles.countBanner}>
        <span style={styles.countText}>
          {filteredActivities.length}{' '}
          {filteredActivities.length === 1 ? 'activity' : 'activities'}
          {filteredActivities.length !== activities.length && (
            <span style={styles.countMuted}>
              {' '}
              of {activities.length} total
            </span>
          )}
        </span>
      </div>

      {/* Filters */}
      {isMobile ? (
        <div style={styles.filtersSection}>
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            style={styles.filtersToggle}
          >
            <span>{filtersExpanded ? 'Hide Filters' : 'Show Filters'}</span>
            <span style={{ transform: filtersExpanded ? 'rotate(180deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform 0.2s' }}>
              &#9662;
            </span>
          </button>
          {filtersExpanded && filtersContent}
        </div>
      ) : (
        <div style={styles.filtersSectionDesktop}>{filtersContent}</div>
      )}

      {/* Activity Cards */}
      {visibleActivities.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>{'\u{1F4CB}'}</div>
          <p style={styles.emptyTitle}>No activities found</p>
          <p style={styles.emptySubtext}>
            {activities.length === 0
              ? 'You haven\'t logged any activities yet. Visit a customer page to create your first one.'
              : 'Try adjusting your filters to see more results.'}
          </p>
          {activities.length > 0 && (
            <button
              onClick={() => {
                setTypeFilter('all');
                setOutcomeFilter('all');
                setDateRange('all');
                setSearchQuery('');
              }}
              style={styles.clearFiltersButton}
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div style={styles.cardList}>
          {visibleActivities.map((activity) => {
            const isExpanded = expandedId === activity.id;
            const photoCount = activity.activity_photos?.length || 0;

            return (
              <div key={activity.id} style={styles.card}>
                {/* Card Header - always visible, clickable to expand */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                  style={styles.cardHeader}
                >
                  <div style={styles.cardHeaderLeft}>
                    <span style={styles.typeIcon}>
                      {ACTIVITY_ICONS[activity.activity_type] || '\u{1F4CB}'}
                    </span>
                    <div style={styles.cardHeaderInfo}>
                      <div style={styles.cardTopRow}>
                        <span style={styles.typeLabel}>
                          {ACTIVITY_LABELS[activity.activity_type] || activity.activity_type}
                        </span>
                        {activity.outcome && (
                          <span
                            style={{
                              ...styles.outcomeBadge,
                              backgroundColor: OUTCOME_COLORS[activity.outcome] || '#9ca3af',
                            }}
                          >
                            {OUTCOME_LABELS[activity.outcome] || activity.outcome}
                          </span>
                        )}
                        {photoCount > 0 && (
                          <span style={styles.photoBadge}>
                            {'\u{1F4F7}'} {photoCount}
                          </span>
                        )}
                      </div>
                      <div style={styles.cardDate}>{formatDate(activity.activity_date)}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      ...styles.expandArrow,
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                  >
                    &#9662;
                  </span>
                </div>

                {/* Card Summary - always visible */}
                <div style={styles.cardBody}>
                  <Link
                    href={`/customers/${activity.tabc_permit_number}`}
                    style={styles.permitLink}
                  >
                    Permit: {activity.tabc_permit_number}
                  </Link>
                  {activity.contact_name && (
                    <div style={styles.contactName}>
                      Contact: {activity.contact_name}
                    </div>
                  )}
                  {activity.notes && !isExpanded && (
                    <div style={styles.notesPreview}>
                      {activity.notes.length > 120
                        ? activity.notes.substring(0, 120) + '...'
                        : activity.notes}
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={styles.expandedSection}>
                    {/* Full Notes */}
                    {activity.notes && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>Notes</div>
                        <div style={styles.detailValue}>{activity.notes}</div>
                      </div>
                    )}

                    {/* Conversation Summary */}
                    {activity.conversation_summary && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>Conversation Summary</div>
                        <div style={styles.detailValue}>{activity.conversation_summary}</div>
                      </div>
                    )}

                    {/* Product Interest */}
                    {activity.product_interest && activity.product_interest.length > 0 && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>Product Interest</div>
                        <div style={styles.tagsRow}>
                          {activity.product_interest.map((tag) => (
                            <span key={tag} style={styles.productTag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Current Products */}
                    {activity.current_products_carried && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>Current Products Carried</div>
                        <div style={styles.detailValue}>
                          {activity.current_products_carried}
                        </div>
                      </div>
                    )}

                    {/* Contact Details */}
                    {(activity.contact_name || activity.contact_cell_phone || activity.contact_email) && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>Contact Details</div>
                        <div style={styles.detailValue}>
                          {activity.contact_name && <div>{activity.contact_name}</div>}
                          {activity.contact_cell_phone && <div>{activity.contact_cell_phone}</div>}
                          {activity.contact_email && <div>{activity.contact_email}</div>}
                        </div>
                      </div>
                    )}

                    {/* Follow-up Date */}
                    {activity.next_followup_date && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>Next Follow-up</div>
                        <div style={styles.detailValue}>
                          {formatDate(activity.next_followup_date)}
                        </div>
                      </div>
                    )}

                    {/* GPS Location */}
                    {activity.gps_latitude != null && activity.gps_longitude != null && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>GPS Location</div>
                        <div style={styles.detailValue}>
                          {activity.gps_latitude.toFixed(6)}, {activity.gps_longitude.toFixed(6)}
                        </div>
                      </div>
                    )}

                    {/* Photos */}
                    {photoCount > 0 && (
                      <div style={styles.detailBlock}>
                        <div style={styles.detailLabel}>
                          Photos ({photoCount})
                        </div>
                        <div style={styles.photoGrid}>
                          {activity.activity_photos.map((photo) => (
                            <div key={photo.id} style={styles.photoThumb}>
                              <img
                                src={photo.photo_url}
                                alt={photo.photo_type || 'Activity photo'}
                                style={styles.photoImg}
                              />
                              {photo.photo_type && (
                                <div style={styles.photoType}>{photo.photo_type.replace('_', ' ')}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div style={styles.detailMeta}>
                      Created: {formatDateTime(activity.created_at)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {hasMore && (
        <div style={styles.loadMoreContainer}>
          <button
            onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
            style={styles.loadMoreButton}
          >
            Load more ({filteredActivities.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Styles
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  // Loading skeleton
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  skeletonBar: {
    height: '36px',
    borderRadius: '8px',
    background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  },
  skeletonFilters: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  skeletonPill: {
    width: '72px',
    height: '32px',
    borderRadius: '16px',
    background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
  },
  skeletonCard: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  skeletonLine: {
    height: '14px',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    width: '100%',
  },

  // Error
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
    fontWeight: '600',
  },

  // Count banner
  countBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countText: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#334155',
  },
  countMuted: {
    fontWeight: '400',
    color: '#94a3b8',
  },

  // Filters - mobile
  filtersSection: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  filtersToggle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    color: '#0d7377',
  },
  filtersInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '0 16px 16px 16px',
  },

  // Filters - desktop
  filtersSectionDesktop: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    padding: '16px',
    position: 'sticky',
    top: '0',
    zIndex: 10,
  },

  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  pill: {
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  pillActive: {
    background: '#0d7377',
    borderColor: '#0d7377',
    color: 'white',
  },
  searchInput: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },

  // Empty state
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#334155',
    margin: '0 0 8px 0',
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: '0 0 20px 0',
    lineHeight: '1.5',
  },
  clearFiltersButton: {
    padding: '10px 20px',
    background: '#e6f5f5',
    color: '#0d7377',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },

  // Card list
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // Card
  card: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    transition: 'box-shadow 0.15s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0,
  },
  typeIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  cardHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  typeLabel: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#1e293b',
  },
  outcomeBadge: {
    fontSize: '11px',
    padding: '2px 10px',
    borderRadius: '12px',
    color: 'white',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  photoBadge: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#f1f5f9',
    color: '#64748b',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  cardDate: {
    fontSize: '13px',
    color: '#94a3b8',
    marginTop: '2px',
  },
  expandArrow: {
    fontSize: '14px',
    color: '#94a3b8',
    transition: 'transform 0.2s',
    flexShrink: 0,
    marginLeft: '8px',
  },

  // Card body (always visible)
  cardBody: {
    padding: '0 16px 14px 52px',
  },
  permitLink: {
    fontSize: '13px',
    color: '#0d7377',
    textDecoration: 'none',
    fontWeight: '500',
  },
  contactName: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '4px',
  },
  notesPreview: {
    fontSize: '13px',
    color: '#94a3b8',
    marginTop: '6px',
    lineHeight: '1.4',
  },

  // Expanded section
  expandedSection: {
    borderTop: '1px solid #f1f5f9',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    background: '#fafbfc',
  },
  detailBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  detailLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  detailValue: {
    fontSize: '14px',
    color: '#334155',
    lineHeight: '1.5',
  },
  tagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  productTag: {
    fontSize: '12px',
    padding: '4px 10px',
    borderRadius: '6px',
    background: '#e6f5f5',
    color: '#0d7377',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '8px',
    marginTop: '4px',
  },
  photoThumb: {
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#f1f5f9',
    position: 'relative',
  },
  photoImg: {
    width: '100%',
    height: '80px',
    objectFit: 'cover',
    display: 'block',
  },
  photoType: {
    fontSize: '10px',
    color: '#64748b',
    textAlign: 'center',
    padding: '2px 4px',
    textTransform: 'capitalize',
  },
  detailMeta: {
    fontSize: '12px',
    color: '#94a3b8',
    paddingTop: '8px',
    borderTop: '1px solid #e2e8f0',
  },

  // Load more
  loadMoreContainer: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '8px',
  },
  loadMoreButton: {
    padding: '12px 32px',
    background: 'white',
    color: '#0d7377',
    border: '2px solid #0d7377',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'all 0.15s',
  },
};
