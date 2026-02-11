/**
 * Customer List Client Component
 * Handles client-side filtering, sorting, and pagination
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';
import { CustomerRevenue } from '@/lib/data/beverage-receipts';

interface CustomerListClientProps {
  initialPage: number;
  initialSearch: string;
  initialCounty: string;
  initialCity: string;
  initialSortBy: string;
  initialSortOrder: 'asc' | 'desc';
  initialMinRevenue?: number;
  initialMonthsBack?: number;
  limit: number;
  offset: number;
}

// Time period options for filtering
const TIME_PERIODS = [
  { label: '36 Mo', value: 36 },
  { label: '24 Mo', value: 24 },
  { label: '12 Mo', value: 12 },
  { label: '6 Mo', value: 6 },
  { label: '3 Mo', value: 3 },
  { label: '1 Mo', value: 1 },
];

// Sort by revenue type options
const SORT_OPTIONS = [
  { label: 'Total Revenue', value: 'total' },
  { label: 'Wine', value: 'wine' },
  { label: 'Beer', value: 'beer' },
  { label: 'Spirits', value: 'liquor' },
  { label: 'Cover Charges', value: 'cover_charge' },
];

export default function CustomerListClient(props: CustomerListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [customers, setCustomers] = useState<CustomerRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(props.initialPage);
  const [search, setSearch] = useState(props.initialSearch);
  const [county, setCounty] = useState(props.initialCounty);
  const [city, setCity] = useState(props.initialCity);
  const [metroplex, setMetroplex] = useState('');
  const [sortBy, setSortBy] = useState(props.initialSortBy);
  const [sortOrder, setSortOrder] = useState(props.initialSortOrder);
  const [minRevenue, setMinRevenue] = useState(props.initialMinRevenue);
  const [monthsBack, setMonthsBack] = useState(props.initialMonthsBack || 12);
  const [visibleColumns, setVisibleColumns] = useState({
    address: false,
    wine: false,
    beer: false,
    liquor: false,
    coverCharge: false,
    ownershipGroup: false,
    industrySegment: false,
  });
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [sortByRevenue, setSortByRevenue] = useState<string>('total');
  const [topN, setTopN] = useState<number | undefined>(undefined);
  const [counties, setCounties] = useState<{ county_code: string; county_name: string }[]>([]);
  const [metroplexes, setMetroplexes] = useState<{ metroplex: string }[]>([]);
  
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      if (search) params.set('search', search);
      if (county) params.set('county', county);
      if (city) params.set('city', city);
      if (metroplex) params.set('metroplex', metroplex);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      if (minRevenue) params.set('minRevenue', minRevenue.toString());
      params.set('monthsBack', monthsBack.toString());
      if (sortByRevenue) params.set('sortByRevenue', sortByRevenue);
      if (topN) params.set('topN', topN.toString());

      // Update URL without triggering navigation during render
      if (typeof window !== 'undefined') {
        const url = `/customers?${params.toString()}`;
        window.history.replaceState({}, '', url);
      }

      const response = await fetch(`/api/customers?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      setCustomers(data.customers || []);
      setTotalCount(data.totalCount || 0);
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomers([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, county, city, metroplex, sortBy, sortOrder, minRevenue, monthsBack, sortByRevenue, topN]);
  
  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Scroll detection for hiding page header
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setHeaderVisible(false); // scrolling down
      } else {
        setHeaderVisible(true);  // scrolling up
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Fetch counties and metroplexes on mount
  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [countiesRes, metroplexesRes] = await Promise.all([
          fetch('/api/counties'),
          fetch('/api/metroplexes'),
        ]);
        if (countiesRes.ok) {
          const countiesData = await countiesRes.json();
          setCounties(countiesData.counties || []);
        }
        if (metroplexesRes.ok) {
          const metroplexesData = await metroplexesRes.json();
          setMetroplexes(metroplexesData.metroplexes || []);
        }
      } catch (error) {
        console.error('Error fetching filter options:', error);
      }
    };
    fetchFilters();
  }, []);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    // loadCustomers will be called via useEffect when page changes
  };
  
  const handleSort = (newSortBy: string) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
    // loadCustomers will be called via useEffect when sortBy/sortOrder changes
  };
  
  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '$0';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'N/A';
    try {
      // Try parsing as ISO date first
      let date = parseISO(dateStr);
      if (!isValid(date)) {
        // Fallback to standard Date parsing
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return 'Invalid Date';
        }
      }
      return format(date, 'MMM yyyy');
    } catch (error) {
      console.error('Date formatting error:', error, dateStr);
      return 'Invalid Date';
    }
  };
  
  const totalPages = Math.ceil(totalCount / props.limit);
  
  return (
    <div>
      {/* Page Header - hides on scroll */}
      <div style={{
        ...styles.pageHeader,
        transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.3s ease-in-out',
      }}>
        <h1 style={styles.pageTitle}>Customers</h1>
        <p style={styles.pageSubtitle}>Browse and analyze beverage establishments across Texas</p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} style={styles.filters}>
        <input
          type="text"
          placeholder="Search by permit, name, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />
        <select
          value={county}
          onChange={(e) => setCounty(e.target.value)}
          style={styles.filterInput}
        >
          <option value="">All Counties</option>
          {counties.map((c) => (
            <option key={c.county_code} value={c.county_code}>
              {c.county_name}
            </option>
          ))}
        </select>
        <select
          value={metroplex}
          onChange={(e) => setMetroplex(e.target.value)}
          style={styles.filterInput}
        >
          <option value="">All Metroplexes</option>
          {metroplexes.map((m) => (
            <option key={m.metroplex} value={m.metroplex}>
              {m.metroplex}
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
        <input
          type="number"
          placeholder="Min revenue..."
          value={minRevenue || ''}
          onChange={(e) => setMinRevenue(e.target.value ? parseFloat(e.target.value) : undefined)}
          style={styles.filterInput}
        />
        <button type="submit" style={styles.searchButton}>
          Search
        </button>
        {(search || county || city || metroplex || minRevenue) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCounty('');
              setCity('');
              setMetroplex('');
              setMinRevenue(undefined);
              setPage(1);
            }}
            style={styles.clearButton}
          >
            Clear
          </button>
        )}
      </form>
      
      {/* Results count */}
      <div style={styles.resultsInfo}>
        Showing {customers.length} of {totalCount} customers
      </div>

      {/* Time Period Selector + Sort + Top N */}
      <div style={styles.timePeriodRow}>
        <span style={styles.timePeriodLabel}>Time Period:</span>
        <div style={styles.timePeriodButtons}>
          {TIME_PERIODS.map((period) => (
            <button
              key={period.value}
              onClick={() => {
                setMonthsBack(period.value);
                setPage(1);
              }}
              style={{
                ...styles.timePeriodButton,
                ...(monthsBack === period.value ? styles.timePeriodButtonActive : {}),
              }}
            >
              {period.label}
            </button>
          ))}
        </div>

        <div style={styles.sortSection}>
          <span style={styles.timePeriodLabel}>Sort:</span>
          <select
            value={sortByRevenue}
            onChange={(e) => {
              setSortByRevenue(e.target.value);
              setPage(1);
            }}
            style={styles.sortDropdown}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={styles.topNSection}>
          <span style={styles.timePeriodLabel}>Top N:</span>
          <input
            type="number"
            placeholder="All"
            value={topN || ''}
            onChange={(e) => {
              setTopN(e.target.value ? parseInt(e.target.value) : undefined);
              setPage(1);
            }}
            style={styles.topNInput}
            min={1}
          />
        </div>
      </div>

      {/* Column toggles + top pagination (same row, pagination right-justified) */}
      <div style={styles.toolbarRow}>
        <div style={styles.columnToggles}>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, wine: !v.wine }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.wine ? brandColors.primary : 'white',
              borderColor: visibleColumns.wine ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.wine ? 'white' : '#475569',
            }}
          >
            Wine
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, beer: !v.beer }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.beer ? brandColors.primary : 'white',
              borderColor: visibleColumns.beer ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.beer ? 'white' : '#475569',
            }}
          >
            Beer
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, liquor: !v.liquor }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.liquor ? brandColors.primary : 'white',
              borderColor: visibleColumns.liquor ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.liquor ? 'white' : '#475569',
            }}
          >
            Spirits
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, coverCharge: !v.coverCharge }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.coverCharge ? brandColors.primary : 'white',
              borderColor: visibleColumns.coverCharge ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.coverCharge ? 'white' : '#475569',
            }}
          >
            Cover Charge
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, ownershipGroup: !v.ownershipGroup }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.ownershipGroup ? brandColors.primary : 'white',
              borderColor: visibleColumns.ownershipGroup ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.ownershipGroup ? 'white' : '#475569',
            }}
          >
            Ownership
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, industrySegment: !v.industrySegment }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.industrySegment ? brandColors.primary : 'white',
              borderColor: visibleColumns.industrySegment ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.industrySegment ? 'white' : '#475569',
            }}
          >
            Industry
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, address: !v.address }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.address ? brandColors.primary : 'white',
              borderColor: visibleColumns.address ? brandColors.primary : '#e2e8f0',
              color: visibleColumns.address ? 'white' : '#475569',
            }}
          >
            Address
          </button>
        </div>
        {totalPages > 1 && !loading && customers.length > 0 && (
          <div style={styles.paginationInline}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={styles.pageButton}
            >
              Previous
            </button>
            <span style={styles.pageInfo}>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              style={styles.pageButton}
            >
              Next
            </button>
          </div>
        )}
      </div>
      
      {/* Table */}
      {loading ? (
        <div style={styles.loading}>Loading customers...</div>
      ) : customers.length === 0 ? (
        <div style={styles.empty}>No customers found</div>
      ) : (
        <>
          <table style={styles.table}>
            <thead>
              <tr>
                {topN && (
                  <th style={{ ...styles.th, ...styles.thRank }}>Rank</th>
                )}
                <th style={{ ...styles.th, ...styles.thName }}>
                  <button
                    onClick={() => handleSort('name')}
                    style={styles.sortButton}
                  >
                    Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                <th style={{ ...styles.th, ...styles.thRevenue }}>
                  <button
                    onClick={() => handleSort('revenue')}
                    style={styles.sortButton}
                  >
                    Total Revenue {sortBy === 'revenue' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                {visibleColumns.wine && (
                  <th style={{ ...styles.th, ...styles.thOptional }}>Wine</th>
                )}
                {visibleColumns.beer && (
                  <th style={{ ...styles.th, ...styles.thOptional }}>Beer</th>
                )}
                {visibleColumns.liquor && (
                  <th style={{ ...styles.th, ...styles.thOptional }}>Spirits</th>
                )}
                {visibleColumns.coverCharge && (
                  <th style={{ ...styles.th, ...styles.thOptional }}>Cover Charge</th>
                )}
                {visibleColumns.ownershipGroup && (
                  <th style={{ ...styles.th, ...styles.thEnrichment }}>Ownership</th>
                )}
                {visibleColumns.industrySegment && (
                  <th style={{ ...styles.th, ...styles.thEnrichment }}>Industry</th>
                )}
                {visibleColumns.address && (
                  <th style={{ ...styles.th, ...styles.thAddress }}>Address</th>
                )}
                <th style={{ ...styles.th, ...styles.thLocation }}>Location</th>
                <th style={{ ...styles.th, ...styles.thLastReceipt }}>
                  <button
                    onClick={() => handleSort('last_receipt')}
                    style={styles.sortButton}
                  >
                    Last Receipt {sortBy === 'last_receipt' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </button>
                </th>
                <th style={{ ...styles.th, ...styles.thActions }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer, index) => (
                <tr key={customer.tabc_permit_number} style={styles.tr}>
                  {topN && (
                    <td style={{ ...styles.td, ...styles.tdRank }}>
                      {index + 1 + ((page - 1) * props.limit)}
                    </td>
                  )}
                  <td style={{ ...styles.td, ...styles.tdName }}>
                    <div style={styles.nameCell}>
                      <strong style={styles.nameText} title={customer.location_name || undefined}>
                        {customer.location_name || 'Unknown'}
                      </strong>
                      <div style={styles.permitNumber}>
                        Permit: {customer.tabc_permit_number}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...styles.td, ...styles.tdRevenue }}>
                    <strong>{formatCurrency(customer.total_revenue)}</strong>
                    <div style={styles.receiptCount}>
                      {customer.receipt_count} months
                    </div>
                  </td>
                  {visibleColumns.wine && (
                    <td style={{ ...styles.td, ...styles.tdOptional }}>
                      {formatCurrency(customer.wine_revenue)}
                    </td>
                  )}
                  {visibleColumns.beer && (
                    <td style={{ ...styles.td, ...styles.tdOptional }}>
                      {formatCurrency(customer.beer_revenue)}
                    </td>
                  )}
                  {visibleColumns.liquor && (
                    <td style={{ ...styles.td, ...styles.tdOptional }}>
                      {formatCurrency(customer.liquor_revenue)}
                    </td>
                  )}
                  {visibleColumns.coverCharge && (
                    <td style={{ ...styles.td, ...styles.tdOptional }}>
                      {formatCurrency(customer.cover_charge_revenue)}
                    </td>
                  )}
                  {visibleColumns.ownershipGroup && (
                    <td style={{ ...styles.td, ...styles.tdEnrichment }}>
                      {customer.ownership_group ?? '—'}
                    </td>
                  )}
                  {visibleColumns.industrySegment && (
                    <td style={{ ...styles.td, ...styles.tdEnrichment }}>
                      {customer.industry_segment ?? '—'}
                    </td>
                  )}
                  {visibleColumns.address && (
                    <td style={{ ...styles.td, ...styles.tdAddress }}>
                      {customer.location_address || '—'}
                    </td>
                  )}
                  <td style={{ ...styles.td, ...styles.tdLocation }}>
                    {customer.location_city && (
                      <div>{customer.location_city}</div>
                    )}
                    {customer.location_county && (
                      <div style={styles.county}>{customer.location_county}</div>
                    )}
                    {customer.location_zip && (
                      <div style={styles.zip}>{customer.location_zip}</div>
                    )}
                  </td>
                  <td style={{ ...styles.td, ...styles.tdLastReceipt }}>
                    {formatDate(customer.last_receipt_date)}
                  </td>
                  <td style={{ ...styles.td, ...styles.tdActions }}>
                    <Link
                      href={`/customers/${customer.tabc_permit_number}`}
                      style={styles.viewButton}
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={styles.pageButton}
              >
                Previous
              </button>
              <span style={styles.pageInfo}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                style={styles.pageButton}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',      // brand-500 (teal)
  primaryDark: '#042829',  // brand-900
  primaryLight: '#e6f5f5', // brand-50
  accent: '#22d3e6',       // accent-400 (cyan)
  hover: '#0a5f63',        // brand-600
};

const styles = {
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '12px 0',
    marginBottom: '16px',
    borderRadius: '8px',
  },
  pageTitle: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  pageSubtitle: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '2px',
    marginBottom: 0,
  },
  filters: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
    backgroundColor: '#ffffff',
    paddingTop: '16px',
    paddingBottom: '16px',
    marginBottom: '16px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  searchInput: {
    flex: '1',
    minWidth: '200px',
    padding: '10px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  filterInput: {
    width: '140px',
    padding: '10px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'white',
  },
  searchButton: {
    padding: '10px 20px',
    background: brandColors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background 0.2s',
  },
  clearButton: {
    padding: '10px 20px',
    background: '#64748b',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  timePeriodRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: 'white',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  timePeriodLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#334155',
  },
  timePeriodButtons: {
    display: 'flex',
    gap: '6px',
  },
  timePeriodButton: {
    padding: '8px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  timePeriodButtonActive: {
    backgroundColor: brandColors.primary,
    borderColor: brandColors.primary,
    color: 'white',
  },
  sortSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: '16px',
    paddingLeft: '16px',
    borderLeft: '1px solid #e2e8f0',
  },
  sortDropdown: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    minWidth: '130px',
  },
  topNSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginLeft: '16px',
    paddingLeft: '16px',
    borderLeft: '1px solid #e2e8f0',
  },
  topNInput: {
    padding: '8px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#475569',
    fontSize: '13px',
    fontWeight: '500',
    width: '80px',
    textAlign: 'center' as const,
  },
  resultsInfo: {
    marginBottom: '16px',
    color: '#666',
    fontSize: '14px',
  },
  loading: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#666',
  },
  empty: {
    padding: '40px',
    textAlign: 'center' as const,
    color: '#999',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    background: 'white',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  th: {
    padding: '14px 12px',
    textAlign: 'left' as const,
    background: brandColors.primaryLight,
    fontWeight: '600',
    fontSize: '13px',
    borderBottom: `2px solid ${brandColors.primary}20`,
    color: brandColors.primaryDark,
  },
  thEnrichment: { width: 160 },
  tdEnrichment: { width: 160, verticalAlign: 'top' as const },
  sortButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
    padding: '0',
    color: '#333',
  },
  tr: {
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
  },
  nameCell: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    minWidth: 0,
    overflow: 'hidden',
  },
  nameText: {
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis' as const,
    display: 'block',
  },
  permitNumber: {
    fontSize: '12px',
    color: '#666',
  },
  receiptCount: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
  county: {
    fontSize: '12px',
    color: '#666',
  },
  zip: {
    fontSize: '12px',
    color: '#999',
  },
  viewButton: {
    color: brandColors.primary,
    textDecoration: 'none',
    fontWeight: '500',
    fontSize: '14px',
    padding: '6px 12px',
    borderRadius: '6px',
    backgroundColor: brandColors.primaryLight,
    transition: 'all 0.2s',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
  },
  pageButton: {
    padding: '8px 16px',
    background: brandColors.primary,
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background 0.2s',
  },
  pageInfo: {
    color: '#666',
    fontSize: '14px',
  },
  toolbarRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  columnToggles: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  paginationInline: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
  },
  toggleButton: {
    padding: '6px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  thName: { minWidth: 200 },
  thRevenue: { minWidth: 120, textAlign: 'right' as const },
  thOptional: { minWidth: 100, textAlign: 'right' as const },
  thAddress: { minWidth: 200 },
  thLocation: { minWidth: 150 },
  thLastReceipt: { minWidth: 110 },
  thActions: { minWidth: 80, textAlign: 'center' as const },
  tdName: { minWidth: 200 },
  tdRevenue: { textAlign: 'right' as const },
  tdOptional: { textAlign: 'right' as const },
  tdAddress: { fontSize: '13px' },
  tdLocation: {},
  tdLastReceipt: {},
  tdActions: { textAlign: 'center' as const },
  thRank: { width: 60, textAlign: 'center' as const },
  tdRank: {
    width: 60,
    textAlign: 'center' as const,
    fontWeight: '600',
    color: brandColors.primary,
  },
};
