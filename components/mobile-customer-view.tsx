/**
 * Mobile Customer View Component
 * Map-first experience for mobile devices with floating search, category filters,
 * revenue-tiered pins, rich action sheet, and inline activity capture.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MapSkeleton } from './skeleton';
import ErrorFallback from './error-fallback';
import type { MapCustomer } from './customer-map';

// Dynamically import heavy components to avoid SSR issues
const CustomerMap = dynamic(() => import('./customer-map'), {
  ssr: false,
  loading: () => <MapSkeleton height={600} />,
});

const MapActivitySheet = dynamic(() => import('./map-activity-sheet'), {
  ssr: false,
});

// Category type
type Category = 'all' | 'beer' | 'wine' | 'spirits';

// Customer without coordinates (for list display)
interface CustomerWithoutCoords {
  id: string;
  name: string;
  permit_number: string;
  address: string;
}

// Last activity data (lazy-loaded from API)
interface LastActivity {
  id: string;
  activity_type: string;
  activity_date: string;
  notes: string | null;
  outcome: string | null;
  contact_name: string | null;
  contact_cell_phone: string | null;
}

interface MobileCustomerViewProps {
  initialSearch?: string;
  initialCounty?: string;
  initialCity?: string;
  initialMetroplex?: string;
  userId?: string;
}

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

// Tier color hex for badges
const TIER_COLORS: Record<string, string> = {
  green: '#22c55e',
  lightgreen: '#86efac',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'beer', label: 'Beer' },
  { value: 'wine', label: 'Wine' },
  { value: 'spirits', label: 'Spirits' },
];

// Format currency
function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${Math.round(amount).toLocaleString()}`;
}

export default function MobileCustomerView({
  initialSearch = '',
  initialCounty = '',
  initialCity = '',
  initialMetroplex = '',
  userId,
}: MobileCustomerViewProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [search, setSearch] = useState(initialSearch);
  const [county, setCounty] = useState(initialCounty);
  const [city, setCity] = useState(initialCity);
  const [metroplex, setMetroplex] = useState(initialMetroplex);
  const [category, setCategory] = useState<Category>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Data
  const [mapCustomers, setMapCustomers] = useState<MapCustomer[]>([]);
  const [nonGeocodedCustomers, setNonGeocodedCustomers] = useState<CustomerWithoutCoords[]>([]);
  const [nonGeocodedCount, setNonGeocodedCount] = useState(0);
  const [showNonGeocoded, setShowNonGeocoded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter options
  const [counties, setCounties] = useState<{ county_code: string; county_name: string }[]>([]);
  const [metroplexes, setMetroplexes] = useState<{ metroplex: string }[]>([]);

  // Action sheet state
  const [selectedCustomer, setSelectedCustomer] = useState<MapCustomer | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [lastActivity, setLastActivity] = useState<LastActivity | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Activity capture sheet
  const [showActivitySheet, setShowActivitySheet] = useState(false);
  const [activityPermit, setActivityPermit] = useState<string>('');
  const [activityCustomerName, setActivityCustomerName] = useState<string>('');

  // Saved accounts
  const [savedAccounts, setSavedAccounts] = useState<Set<string>>(new Set());
  const [savingPermit, setSavingPermit] = useState<string | null>(null);

  // Viewport height tracking for full-screen map
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 700
  );

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch saved accounts on mount
  useEffect(() => {
    const fetchSavedAccounts = async () => {
      try {
        const response = await fetch('/api/accounts/saved');
        if (response.ok) {
          const data = await response.json();
          setSavedAccounts(new Set(data.savedAccounts || []));
        }
      } catch (err) {
        console.error('Error fetching saved accounts:', err);
      }
    };
    fetchSavedAccounts();
  }, []);

  // Toggle saved account with optimistic update
  const toggleSavedAccount = useCallback(async (permitNumber: string) => {
    if (savingPermit) return;
    setSavingPermit(permitNumber);

    const wasSaved = savedAccounts.has(permitNumber);

    // Optimistic update
    setSavedAccounts(prev => {
      const next = new Set(prev);
      if (wasSaved) {
        next.delete(permitNumber);
      } else {
        next.add(permitNumber);
      }
      return next;
    });

    try {
      const response = await fetch('/api/accounts/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permitNumber }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle saved account');
      }
    } catch (err) {
      console.error('Error toggling saved account:', err);
      // Revert optimistic update on failure
      setSavedAccounts(prev => {
        const next = new Set(prev);
        if (wasSaved) {
          next.add(permitNumber);
        } else {
          next.delete(permitNumber);
        }
        return next;
      });
    } finally {
      setSavingPermit(null);
    }
  }, [savedAccounts, savingPermit]);

  // Load filter options
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [countiesRes, metroplexesRes] = await Promise.all([
          fetch('/api/counties'),
          fetch('/api/metroplexes'),
        ]);
        if (countiesRes.ok) {
          const data = await countiesRes.json();
          setCounties(data.counties || []);
        }
        if (metroplexesRes.ok) {
          const data = await metroplexesRes.json();
          setMetroplexes(data.metroplexes || []);
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };
    fetchFilters();
  }, []);

  // Load customers with coordinates + revenue + tier colors
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (county) params.set('county', county);
      if (city) params.set('city', city);
      if (metroplex) params.set('metroplex', metroplex);
      params.set('category', category);
      params.set('limit', '500');

      const response = await fetch(`/api/customers/coordinates?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to load customers (${response.status})`);
      }
      const data = await response.json();
      setMapCustomers(data.customers || []);
      setNonGeocodedCustomers(data.nonGeocodedCustomers || []);
      setNonGeocodedCount(data.nonGeocodedCount || 0);
    } catch (err) {
      console.error('Error loading customers:', err);
      setError(err instanceof Error ? err.message : 'Failed to load customers');
      setMapCustomers([]);
      setNonGeocodedCustomers([]);
      setNonGeocodedCount(0);
    } finally {
      setLoading(false);
    }
  }, [search, county, city, metroplex, category]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Handle pin tap - show rich action sheet
  const handlePinTap = useCallback(async (customer: MapCustomer) => {
    setSelectedCustomer(customer);
    setShowActionSheet(true);
    setLastActivity(null);
    setLoadingActivity(true);

    // Lazy-fetch last activity
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customer.permit_number)}/last-activity`);
      if (res.ok) {
        const data = await res.json();
        setLastActivity(data.activity || null);
      }
    } catch (err) {
      console.error('Error fetching last activity:', err);
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  // Open activity capture sheet
  const openActivitySheet = () => {
    if (selectedCustomer) {
      setActivityPermit(selectedCustomer.permit_number);
      setActivityCustomerName(selectedCustomer.name);
      setShowActionSheet(false);
      setShowActivitySheet(true);
    }
  };

  // Navigate to customer detail
  const goToCustomerDetail = () => {
    if (selectedCustomer) {
      router.push(`/customers/${selectedCustomer.permit_number}`);
    }
  };

  // Close action sheet
  const closeActionSheet = () => {
    setShowActionSheet(false);
    setSelectedCustomer(null);
    setLastActivity(null);
  };

  // Handle activity success
  const handleActivitySuccess = () => {
    setShowActivitySheet(false);
    // Could show a toast here, for now just reload map data
    loadCustomers();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchInputRef.current?.blur();
  };

  const clearFilters = () => {
    setSearch('');
    setCounty('');
    setCity('');
    setMetroplex('');
  };

  const hasActiveFilters = search || county || city || metroplex;

  return (
    <div style={{ ...styles.container, height: viewportHeight }}>
      {/* Floating Search Bar */}
      <div style={styles.searchOverlay}>
        <form onSubmit={handleSearchSubmit} style={styles.searchForm}>
          <div style={styles.searchInputWrapper}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={styles.clearSearchButton}
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            style={{
              ...styles.filterToggleButton,
              ...(hasActiveFilters ? styles.filterToggleButtonActive : {}),
            }}
          >
            ⚙️
            {hasActiveFilters && <span style={styles.filterBadge}>•</span>}
          </button>
        </form>

        {/* Category Filter Buttons */}
        <div style={styles.categoryRow}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              style={{
                ...styles.categoryPill,
                ...(category === cat.value ? styles.categoryPillActive : {}),
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Expandable Filters */}
        {showFilters && (
          <div style={styles.filtersPanel}>
            <select
              value={metroplex}
              onChange={(e) => setMetroplex(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Metroplexes</option>
              {metroplexes.map((m) => (
                <option key={m.metroplex} value={m.metroplex}>
                  {m.metroplex}
                </option>
              ))}
            </select>
            <select
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Counties</option>
              {counties.map((c) => (
                <option key={c.county_code} value={c.county_code}>
                  {c.county_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="City..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={styles.filterInput}
            />
            {hasActiveFilters && (
              <button onClick={clearFilters} style={styles.clearFiltersButton}>
                Clear All
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results Count Badge */}
      {!loading && (mapCustomers.length > 0 || nonGeocodedCount > 0) && (
        <div style={styles.resultsBadge}>
          {mapCustomers.length} on map
          {nonGeocodedCount > 0 && ` · ${nonGeocodedCount} without location`}
        </div>
      )}

      {/* Full Screen Map */}
      <div style={{
        ...styles.mapWrapper,
        height: showNonGeocoded ? `${viewportHeight - 260}px` : '100%',
      }}>
        {loading ? (
          <MapSkeleton height={showNonGeocoded ? viewportHeight - 260 : viewportHeight - 60} />
        ) : error ? (
          <div style={styles.errorWrapper}>
            <ErrorFallback
              title="Map Loading Error"
              message={error}
              onRetry={loadCustomers}
            />
          </div>
        ) : mapCustomers.length === 0 && nonGeocodedCount === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📍</div>
            <h3 style={styles.emptyTitle}>No Customers Found</h3>
            <p style={styles.emptyText}>
              {hasActiveFilters
                ? 'Try adjusting your search or filters'
                : 'No customers available'}
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} style={styles.emptyButton}>
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <CustomerMap
            customers={mapCustomers}
            height={`${showNonGeocoded ? viewportHeight - 260 : viewportHeight - 60}px`}
            showPopups={false}
            onPinTap={handlePinTap}
          />
        )}
      </div>

      {/* Non-Geocoded Customers Panel */}
      {!loading && nonGeocodedCount > 0 && (
        <div style={styles.nonGeocodedPanel}>
          <button
            onClick={() => setShowNonGeocoded(!showNonGeocoded)}
            style={styles.nonGeocodedToggle}
          >
            <span>{showNonGeocoded ? '▼' : '▲'}</span>
            <span style={styles.nonGeocodedToggleText}>
              {nonGeocodedCount} customers without map location
            </span>
          </button>
          {showNonGeocoded && (
            <div style={styles.nonGeocodedList}>
              {nonGeocodedCustomers.map((customer) => (
                <div
                  key={customer.id}
                  style={{ ...styles.nonGeocodedItem, display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSavedAccount(customer.permit_number);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '18px',
                      padding: '0',
                      lineHeight: 1,
                      color: savedAccounts.has(customer.permit_number) ? '#f59e0b' : '#cbd5e1',
                      flexShrink: 0,
                    }}
                  >
                    {savedAccounts.has(customer.permit_number) ? '\u2B50' : '\u2606'}
                  </button>
                  <button
                    onClick={() => router.push(`/customers/${customer.permit_number}`)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, flex: 1, padding: 0 }}
                  >
                    <div style={styles.nonGeocodedName}>{customer.name}</div>
                    <div style={styles.nonGeocodedAddress}>{customer.address}</div>
                  </button>
                </div>
              ))}
              {nonGeocodedCount > nonGeocodedCustomers.length && (
                <div style={styles.nonGeocodedMore}>
                  + {nonGeocodedCount - nonGeocodedCustomers.length} more (use search to find)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Enhanced Action Sheet (Rich Popup on Pin Tap) */}
      {showActionSheet && selectedCustomer && (
        <>
          <div style={styles.actionSheetOverlay} onClick={closeActionSheet} />
          <div style={styles.actionSheet}>
            <div style={styles.actionSheetHandle} />
            <div style={styles.actionSheetContent}>
              {/* Customer name + star + tier badge */}
              <div style={styles.actionSheetHeader}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSavedAccount(selectedCustomer.permit_number);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '24px',
                    padding: '0 6px 0 0',
                    lineHeight: 1,
                    color: savedAccounts.has(selectedCustomer.permit_number) ? '#f59e0b' : '#cbd5e1',
                    opacity: savingPermit === selectedCustomer.permit_number ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                  title={savedAccounts.has(selectedCustomer.permit_number) ? 'Remove from My Accounts' : 'Add to My Accounts'}
                  disabled={savingPermit === selectedCustomer.permit_number}
                >
                  {savedAccounts.has(selectedCustomer.permit_number) ? '\u2B50' : '\u2606'}
                </button>
                <h3 style={styles.actionSheetTitle}>
                  {selectedCustomer.name || selectedCustomer.trade_name || 'Unknown'}
                </h3>
                {selectedCustomer.tier_color && (
                  <span style={{
                    ...styles.tierBadge,
                    backgroundColor: TIER_COLORS[selectedCustomer.tier_color] || '#94a3b8',
                  }}>
                    {selectedCustomer.tier_label || selectedCustomer.tier_color}
                  </span>
                )}
              </div>
              {selectedCustomer.address && (
                <p style={styles.actionSheetAddress}>{selectedCustomer.address}</p>
              )}
              <p style={styles.actionSheetPermit}>
                Permit: {selectedCustomer.permit_number}
              </p>

              {/* Revenue breakdown */}
              <div style={styles.revenueRow}>
                <div style={styles.revenueItem}>
                  <span style={styles.revenueLabel}>Wine</span>
                  <span style={styles.revenueValue}>
                    {formatCurrency(selectedCustomer.wine_revenue || 0)}
                  </span>
                </div>
                <div style={styles.revenueItem}>
                  <span style={styles.revenueLabel}>Beer</span>
                  <span style={styles.revenueValue}>
                    {formatCurrency(selectedCustomer.beer_revenue || 0)}
                  </span>
                </div>
                <div style={styles.revenueItem}>
                  <span style={styles.revenueLabel}>Spirits</span>
                  <span style={styles.revenueValue}>
                    {formatCurrency(selectedCustomer.liquor_revenue || 0)}
                  </span>
                </div>
              </div>

              {/* Last activity (lazy-loaded) */}
              <div style={styles.activitySection}>
                {loadingActivity ? (
                  <p style={styles.activityLoading}>Loading activity...</p>
                ) : lastActivity ? (
                  <>
                    <div style={styles.activityHeader}>
                      <span style={styles.activityType}>
                        {lastActivity.activity_type === 'visit' ? '🏢' :
                         lastActivity.activity_type === 'call' ? '📞' :
                         lastActivity.activity_type === 'email' ? '✉️' : '📝'}
                        {' '}Last {lastActivity.activity_type}
                      </span>
                      <span style={styles.activityDate}>{lastActivity.activity_date}</span>
                    </div>
                    {lastActivity.contact_name && (
                      <div style={styles.contactInfo}>
                        <span>👤 {lastActivity.contact_name}</span>
                        {lastActivity.contact_cell_phone && (
                          <a
                            href={`tel:${lastActivity.contact_cell_phone}`}
                            style={styles.phoneLink}
                          >
                            📱 {lastActivity.contact_cell_phone}
                          </a>
                        )}
                      </div>
                    )}
                    {lastActivity.notes && (
                      <p style={styles.activityNotes}>
                        "{lastActivity.notes.length > 120
                          ? lastActivity.notes.substring(0, 120) + '...'
                          : lastActivity.notes}"
                      </p>
                    )}
                  </>
                ) : (
                  <p style={styles.noActivity}>No previous activities recorded</p>
                )}
              </div>

              {/* Action buttons */}
              <div style={styles.actionSheetButtons}>
                <button
                  onClick={openActivitySheet}
                  style={styles.actionButtonPrimary}
                >
                  📝 Record Activity
                </button>
                <button
                  onClick={goToCustomerDetail}
                  style={styles.actionButtonSecondary}
                >
                  📋 View Details
                </button>
              </div>
              <button onClick={closeActionSheet} style={styles.actionButtonCancel}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Activity Capture Sheet */}
      {showActivitySheet && userId && activityPermit && (
        <MapActivitySheet
          permitNumber={activityPermit}
          customerName={activityCustomerName}
          userId={userId}
          onSuccess={handleActivitySuccess}
          onCancel={() => setShowActivitySheet(false)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    padding: '12px 12px 0',
    background: 'linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 100%)',
  },
  searchForm: {
    display: 'flex',
    gap: '8px',
  },
  searchInputWrapper: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    fontSize: '16px',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '14px 40px 14px 40px',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    backgroundColor: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    outline: 'none',
  },
  clearSearchButton: {
    position: 'absolute',
    right: '12px',
    width: '24px',
    height: '24px',
    border: 'none',
    background: '#e2e8f0',
    borderRadius: '50%',
    fontSize: '16px',
    color: '#64748b',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterToggleButton: {
    width: '48px',
    height: '48px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    fontSize: '18px',
    cursor: 'pointer',
    position: 'relative',
  },
  filterToggleButtonActive: {
    backgroundColor: brandColors.primaryLight,
  },
  filterBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '8px',
    height: '8px',
    backgroundColor: brandColors.primary,
    borderRadius: '50%',
  },
  // Category filter pills
  categoryRow: {
    display: 'flex',
    gap: '6px',
    marginTop: '10px',
    paddingBottom: '10px',
  },
  categoryPill: {
    flex: 1,
    padding: '8px 4px',
    border: 'none',
    borderRadius: '20px',
    backgroundColor: 'white',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  categoryPillActive: {
    backgroundColor: brandColors.primary,
    color: 'white',
    fontWeight: '600',
    boxShadow: '0 2px 6px rgba(13, 115, 119, 0.3)',
  },
  filtersPanel: {
    marginTop: '8px',
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  filterSelect: {
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '15px',
    backgroundColor: 'white',
  },
  filterInput: {
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '15px',
  },
  clearFiltersButton: {
    padding: '12px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  resultsBadge: {
    position: 'absolute',
    top: '116px',
    left: '12px',
    zIndex: 99,
    padding: '6px 12px',
    backgroundColor: 'white',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  },
  mapWrapper: {
    width: '100%',
    height: '100%',
  },
  errorWrapper: {
    padding: '20px',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    textAlign: 'center',
  },
  emptyIcon: { fontSize: '48px', marginBottom: '16px' },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#334155',
    margin: '0 0 8px 0',
  },
  emptyText: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 16px 0',
  },
  emptyButton: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: brandColors.primary,
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  // Enhanced Action Sheet
  actionSheetOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 200,
  },
  actionSheet: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70vh',
    overflowY: 'auto' as const,
    backgroundColor: 'white',
    borderTopLeftRadius: '20px',
    borderTopRightRadius: '20px',
    zIndex: 201,
    paddingBottom: 'env(safe-area-inset-bottom, 20px)',
  },
  actionSheetHandle: {
    width: '40px',
    height: '4px',
    backgroundColor: '#e2e8f0',
    borderRadius: '2px',
    margin: '12px auto',
  },
  actionSheetContent: {
    padding: '0 20px 20px',
  },
  actionSheetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
  },
  actionSheetTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px 0',
    flex: 1,
  },
  tierBadge: {
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '700',
    color: 'white',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  actionSheetAddress: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 2px 0',
  },
  actionSheetPermit: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '0 0 12px 0',
  },
  // Revenue row
  revenueRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  revenueItem: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '10px',
    textAlign: 'center' as const,
  },
  revenueLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: '2px',
    textTransform: 'uppercase' as const,
  },
  revenueValue: {
    display: 'block',
    fontSize: '15px',
    fontWeight: '700',
    color: brandColors.primaryDark,
  },
  // Activity section
  activitySection: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '14px',
  },
  activityLoading: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
    textAlign: 'center' as const,
  },
  activityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  activityType: {
    fontSize: '13px',
    fontWeight: '600',
    color: brandColors.primaryDark,
  },
  activityDate: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  contactInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: '#475569',
    marginBottom: '6px',
    flexWrap: 'wrap' as const,
  },
  phoneLink: {
    color: brandColors.primary,
    textDecoration: 'none',
    fontWeight: '500',
  },
  activityNotes: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
    fontStyle: 'italic' as const,
    lineHeight: 1.4,
  },
  noActivity: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: 0,
    textAlign: 'center' as const,
  },
  // Action buttons
  actionSheetButtons: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
  },
  actionButtonPrimary: {
    flex: 1,
    padding: '14px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: brandColors.primary,
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  actionButtonSecondary: {
    flex: 1,
    padding: '14px',
    border: `2px solid ${brandColors.primary}`,
    borderRadius: '12px',
    backgroundColor: 'white',
    color: brandColors.primary,
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  actionButtonCancel: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  // Non-geocoded customers panel
  nonGeocodedPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: '16px',
    borderTopRightRadius: '16px',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
    zIndex: 150,
    maxHeight: '200px',
    overflow: 'hidden',
  },
  nonGeocodedToggle: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    borderBottom: '1px solid #e2e8f0',
  },
  nonGeocodedToggleText: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#64748b',
  },
  nonGeocodedList: {
    maxHeight: '150px',
    overflowY: 'auto' as const,
  },
  nonGeocodedItem: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    borderBottom: '1px solid #f1f5f9',
    backgroundColor: 'white',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  nonGeocodedName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: '2px',
  },
  nonGeocodedAddress: {
    fontSize: '12px',
    color: '#64748b',
  },
  nonGeocodedMore: {
    padding: '12px 16px',
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center' as const,
    fontStyle: 'italic' as const,
  },
};
