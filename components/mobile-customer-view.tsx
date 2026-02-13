/**
 * Mobile Customer View Component
 * Map-first experience for mobile devices with floating search and quick actions.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MapSkeleton } from './skeleton';
import ErrorFallback from './error-fallback';

// Dynamically import CustomerMap to avoid SSR issues with Mapbox
const CustomerMap = dynamic(() => import('./customer-map'), {
  ssr: false,
  loading: () => <MapSkeleton height={600} />,
});

// Customer with coordinates for map
interface CustomerWithCoords {
  id: string;
  name: string;
  permit_number: string;
  trade_name?: string;
  lat: number;
  lng: number;
  address?: string;
}

// Customer without coordinates (for list display)
interface CustomerWithoutCoords {
  id: string;
  name: string;
  permit_number: string;
  address: string;
}

interface MobileCustomerViewProps {
  initialSearch?: string;
  initialCounty?: string;
  initialCity?: string;
  initialMetroplex?: string;
}

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

export default function MobileCustomerView({
  initialSearch = '',
  initialCounty = '',
  initialCity = '',
  initialMetroplex = '',
}: MobileCustomerViewProps) {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState(initialSearch);
  const [county, setCounty] = useState(initialCounty);
  const [city, setCity] = useState(initialCity);
  const [metroplex, setMetroplex] = useState(initialMetroplex);
  const [showFilters, setShowFilters] = useState(false);

  const [mapCustomers, setMapCustomers] = useState<CustomerWithCoords[]>([]);
  const [nonGeocodedCustomers, setNonGeocodedCustomers] = useState<CustomerWithoutCoords[]>([]);
  const [nonGeocodedCount, setNonGeocodedCount] = useState(0);
  const [showNonGeocoded, setShowNonGeocoded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [counties, setCounties] = useState<{ county_code: string; county_name: string }[]>([]);
  const [metroplexes, setMetroplexes] = useState<{ metroplex: string }[]>([]);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithCoords | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);

  // Viewport height tracking for full-screen map
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 700
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Load customers with coordinates
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (county) params.set('county', county);
      if (city) params.set('city', city);
      if (metroplex) params.set('metroplex', metroplex);
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
  }, [search, county, city, metroplex]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Handle customer marker click - show action sheet
  const handleCustomerClick = (customerId: string) => {
    const customer = mapCustomers.find((c) => c.id === customerId);
    if (customer) {
      setSelectedCustomer(customer);
      setShowActionSheet(true);
    }
  };

  // Navigate to customer detail
  const goToCustomerDetail = () => {
    if (selectedCustomer) {
      router.push(`/customers/${selectedCustomer.permit_number}`);
    }
  };

  // Navigate to log activity
  const goToLogActivity = () => {
    if (selectedCustomer) {
      router.push(`/customers/${selectedCustomer.permit_number}?action=log`);
    }
  };

  // Close action sheet
  const closeActionSheet = () => {
    setShowActionSheet(false);
    setSelectedCustomer(null);
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
          {nonGeocodedCount > 0 && ` • ${nonGeocodedCount} without location`}
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
            showPopups={true}
            onCustomerClick={handleCustomerClick}
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
                <button
                  key={customer.id}
                  onClick={() => router.push(`/customers/${customer.permit_number}`)}
                  style={styles.nonGeocodedItem}
                >
                  <div style={styles.nonGeocodedName}>{customer.name}</div>
                  <div style={styles.nonGeocodedAddress}>{customer.address}</div>
                </button>
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

      {/* Action Sheet Overlay */}
      {showActionSheet && selectedCustomer && (
        <>
          <div style={styles.actionSheetOverlay} onClick={closeActionSheet} />
          <div style={styles.actionSheet}>
            <div style={styles.actionSheetHandle} />
            <div style={styles.actionSheetContent}>
              <h3 style={styles.actionSheetTitle}>
                {selectedCustomer.name || selectedCustomer.trade_name || 'Unknown'}
              </h3>
              {selectedCustomer.address && (
                <p style={styles.actionSheetAddress}>{selectedCustomer.address}</p>
              )}
              <p style={styles.actionSheetPermit}>
                Permit: {selectedCustomer.permit_number}
              </p>
              <div style={styles.actionSheetButtons}>
                <button
                  onClick={goToLogActivity}
                  style={styles.actionButtonPrimary}
                >
                  📝 Log Activity
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
    padding: '12px',
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
    top: '80px',
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
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
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
  // Action Sheet styles
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
    backgroundColor: 'white',
    borderTopLeftRadius: '20px',
    borderTopRightRadius: '20px',
    zIndex: 201,
    paddingBottom: 'env(safe-area-inset-bottom, 20px)',
    animation: 'slideUp 0.3s ease-out',
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
  actionSheetTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    margin: '0 0 4px 0',
  },
  actionSheetAddress: {
    fontSize: '14px',
    color: '#64748b',
    margin: '0 0 4px 0',
  },
  actionSheetPermit: {
    fontSize: '13px',
    color: '#94a3b8',
    margin: '0 0 16px 0',
  },
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
  // Non-geocoded customers panel styles
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
