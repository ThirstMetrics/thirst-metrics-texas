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
  limit: number;
  offset: number;
}

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
  const [visibleColumns, setVisibleColumns] = useState({
    wine: false,
    beer: false,
    liquor: false,
    coverCharge: false,
    ownershipGroup: false,
    industrySegment: false,
  });
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
  }, [page, search, county, city, metroplex, sortBy, sortOrder, minRevenue]);
  
  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

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

      {/* Column toggles + top pagination (same row, pagination right-justified) */}
      <div style={styles.toolbarRow}>
        <div style={styles.columnToggles}>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, wine: !v.wine }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.wine ? '#3b82f6' : '#e5e7eb',
              color: visibleColumns.wine ? 'white' : '#374151',
            }}
          >
            Wine
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, beer: !v.beer }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.beer ? '#3b82f6' : '#e5e7eb',
              color: visibleColumns.beer ? 'white' : '#374151',
            }}
          >
            Beer
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, liquor: !v.liquor }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.liquor ? '#3b82f6' : '#e5e7eb',
              color: visibleColumns.liquor ? 'white' : '#374151',
            }}
          >
            Spirits
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, coverCharge: !v.coverCharge }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.coverCharge ? '#3b82f6' : '#e5e7eb',
              color: visibleColumns.coverCharge ? 'white' : '#374151',
            }}
          >
            Cover Charge
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, ownershipGroup: !v.ownershipGroup }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.ownershipGroup ? '#3b82f6' : '#e5e7eb',
              color: visibleColumns.ownershipGroup ? 'white' : '#374151',
            }}
          >
            Ownership
          </button>
          <button
            onClick={() => setVisibleColumns(v => ({ ...v, industrySegment: !v.industrySegment }))}
            style={{
              ...styles.toggleButton,
              background: visibleColumns.industrySegment ? '#3b82f6' : '#e5e7eb',
              color: visibleColumns.industrySegment ? 'white' : '#374151',
            }}
          >
            Industry
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
              {customers.map((customer) => (
                <tr key={customer.tabc_permit_number} style={styles.tr}>
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

const styles = {
  filters: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
    backgroundColor: '#ffffff',
    paddingTop: '16px',
    paddingBottom: '16px',
    marginBottom: '24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  searchInput: {
    flex: '1',
    minWidth: '200px',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  },
  filterInput: {
    width: '120px',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  },
  searchButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  clearButton: {
    padding: '10px 20px',
    background: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
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
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  th: {
    padding: '12px',
    textAlign: 'left' as const,
    background: '#f5f5f5',
    fontWeight: '600',
    fontSize: '14px',
    borderBottom: '2px solid #ddd',
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
    color: '#667eea',
    textDecoration: 'none',
    fontWeight: '500',
    fontSize: '14px',
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
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
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
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  thName: { minWidth: 200 },
  thRevenue: { minWidth: 120, textAlign: 'right' as const },
  thOptional: { minWidth: 100, textAlign: 'right' as const },
  thLocation: { minWidth: 150 },
  thLastReceipt: { minWidth: 110 },
  thActions: { minWidth: 80, textAlign: 'center' as const },
  tdName: { minWidth: 200 },
  tdRevenue: { textAlign: 'right' as const },
  tdOptional: { textAlign: 'right' as const },
  tdLocation: {},
  tdLastReceipt: {},
  tdActions: { textAlign: 'center' as const },
};
