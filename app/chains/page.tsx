/**
 * Chain / Ownership Analysis Page
 * Displays ownership groups with aggregated revenue, growth, and location data.
 * Allows search, sort, segment filtering, and drill-down into individual chains.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/lib/hooks/use-media-query';
import type { ChainSummary, ChainsResponse } from '@/app/api/chains/route';
import type { ChainDetailResponse } from '@/app/api/chains/[ownershipGroup]/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 1_000_000) + 'M';
  }
  if (value >= 1_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value / 1_000) + 'K';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function growthColor(pct: number): string {
  if (pct > 5) return '#10b981';
  if (pct > 0) return '#34d399';
  if (pct > -5) return '#f59e0b';
  return '#ef4444';
}

function growthLabel(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function ChainDetailPanel({
  ownershipGroup,
  onClose,
  isMobile,
}: {
  ownershipGroup: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  const [detail, setDetail] = useState<ChainDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/chains/${encodeURIComponent(ownershipGroup)}`)
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load chain detail');
        }
        return res.json() as Promise<ChainDetailResponse>;
      })
      .then(data => {
        setDetail(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [ownershipGroup]);

  return (
    <div style={detailStyles.overlay} onClick={onClose}>
      <div
        style={{
          ...detailStyles.panel,
          width: isMobile ? '100%' : '680px',
          maxHeight: isMobile ? '90vh' : '85vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={detailStyles.header}>
          <div>
            <div style={detailStyles.headerTitle}>{ownershipGroup}</div>
            {detail && (
              <div style={detailStyles.headerMeta}>
                {detail.location_count} location{detail.location_count !== 1 ? 's' : ''} &middot; {detail.industry_segments.join(', ') || 'No segment'}
              </div>
            )}
          </div>
          <button style={detailStyles.closeBtn} onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={detailStyles.body}>
          {loading && (
            <div style={detailStyles.centered}>
              <div style={detailStyles.spinner} />
              <p style={{ color: '#666', marginTop: '12px' }}>Loading chain data...</p>
            </div>
          )}

          {error && (
            <div style={detailStyles.error}>{error}</div>
          )}

          {!loading && !error && detail && (
            <>
              {/* Summary cards */}
              <div style={{
                ...detailStyles.summaryGrid,
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
              }}>
                <div style={detailStyles.summaryCard}>
                  <div style={detailStyles.summaryLabel}>Total Revenue</div>
                  <div style={detailStyles.summaryValue}>{formatCurrency(detail.total_revenue)}</div>
                </div>
                <div style={detailStyles.summaryCard}>
                  <div style={detailStyles.summaryLabel}>Avg / Location</div>
                  <div style={detailStyles.summaryValue}>{formatCurrency(detail.avg_revenue_per_location)}</div>
                </div>
                <div style={detailStyles.summaryCard}>
                  <div style={detailStyles.summaryLabel}>3-Mo Growth</div>
                  <div style={{ ...detailStyles.summaryValue, color: growthColor(detail.growth_pct) }}>
                    {growthLabel(detail.growth_pct)}
                  </div>
                </div>
                <div style={detailStyles.summaryCard}>
                  <div style={detailStyles.summaryLabel}>Locations</div>
                  <div style={detailStyles.summaryValue}>{detail.location_count}</div>
                </div>
              </div>

              {/* Monthly trend (simple bar chart) */}
              {detail.monthly_trends.length > 0 && (
                <div style={detailStyles.section}>
                  <div style={detailStyles.sectionTitle}>Monthly Revenue Trend</div>
                  <MiniBarChart data={detail.monthly_trends} />
                </div>
              )}

              {/* Locations table */}
              <div style={detailStyles.section}>
                <div style={detailStyles.sectionTitle}>Locations ({detail.location_count})</div>
                <div style={detailStyles.tableWrap}>
                  <table style={detailStyles.table}>
                    <thead>
                      <tr>
                        <th style={detailStyles.th}>Location</th>
                        <th style={{ ...detailStyles.th, textAlign: 'right' }}>Revenue</th>
                        <th style={{ ...detailStyles.th, textAlign: 'right' }}>3-Mo Growth</th>
                        <th style={detailStyles.th}>Segment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.locations.map(loc => (
                        <tr key={loc.tabc_permit_number} style={detailStyles.tr}>
                          <td style={detailStyles.td}>
                            <div style={detailStyles.locName}>
                              {loc.location_name || loc.tabc_permit_number}
                            </div>
                            <div style={detailStyles.locMeta}>
                              {[loc.location_city, loc.location_county].filter(Boolean).join(', ')}
                            </div>
                          </td>
                          <td style={{ ...detailStyles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrencyFull(loc.total_revenue)}
                          </td>
                          <td style={{ ...detailStyles.td, textAlign: 'right' }}>
                            <span style={{ color: growthColor(loc.growth_pct), fontWeight: '600' }}>
                              {growthLabel(loc.growth_pct)}
                            </span>
                          </td>
                          <td style={detailStyles.td}>
                            {loc.industry_segment ? (
                              <span style={detailStyles.segBadge}>{loc.industry_segment}</span>
                            ) : (
                              <span style={{ color: '#bbb', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBarChart({ data }: {
  data: { month: string; total_revenue: number }[];
}) {
  const max = Math.max(...data.map(d => d.total_revenue), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '60px', padding: '4px 0' }}>
      {data.map(d => {
        const heightPct = (d.total_revenue / max) * 100;
        return (
          <div
            key={d.month}
            title={`${d.month}: ${formatCurrencyFull(d.total_revenue)}`}
            style={{
              flex: 1,
              height: `${Math.max(heightPct, 4)}%`,
              background: 'linear-gradient(180deg, #0d7377 0%, #042829 100%)',
              borderRadius: '2px 2px 0 0',
              minWidth: '4px',
              cursor: 'default',
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortKey = 'revenue' | 'locations' | 'growth';

export default function ChainsPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [data, setData] = useState<ChainsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('revenue');
  const [segmentFilter, setSegmentFilter] = useState('');

  // Available segments derived from loaded data
  const [availableSegments, setAvailableSegments] = useState<string[]>([]);

  // Detail panel state
  const [selectedChain, setSelectedChain] = useState<string | null>(null);

  // Debounce search input
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search]);

  const fetchChains = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('sort', sort);
      if (segmentFilter) params.set('segment', segmentFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/chains?${params.toString()}`);
      if (res.status === 401) {
        router.push('/login?redirect=/chains');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch chains');
      }
      const json: ChainsResponse = await res.json();
      setData(json);

      // Collect distinct segments for the filter dropdown
      if (!segmentFilter && !debouncedSearch) {
        const segs = new Set<string>();
        json.chains.forEach(c => c.industry_segments.forEach(s => s && segs.add(s)));
        setAvailableSegments(Array.from(segs).sort());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sort, segmentFilter, debouncedSearch, router]);

  useEffect(() => {
    fetchChains();
  }, [fetchChains]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'locations', label: 'Locations' },
    { key: 'growth', label: 'Growth' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7' }}>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.headerTitle}>Chain / Ownership Analysis</h1>
          <p style={styles.headerSubtitle}>Analyze revenue and growth across multi-location ownership groups</p>
        </div>
      </div>

      {/* Content */}
      <div style={{
        ...styles.content,
        padding: isMobile ? '12px' : '24px',
      }}>

        {/* Summary Stats */}
        {!loading && data && (
          <div style={{
            ...styles.statsGrid,
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            marginBottom: isMobile ? '12px' : '20px',
          }}>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Total Chains</div>
              <div style={styles.statValue}>{data.total_chains.toLocaleString()}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Chain Locations</div>
              <div style={styles.statValue}>{data.total_chain_locations.toLocaleString()}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Chain Revenue</div>
              <div style={styles.statValue}>{formatCurrency(data.total_revenue)}</div>
            </div>
            <div style={styles.statCard}>
              <div style={styles.statLabel}>% of Total Revenue</div>
              <div style={{ ...styles.statValue, color: '#0d7377' }}>{data.chain_revenue_pct.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div style={{
          ...styles.toolbar,
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '10px' : '12px',
          marginBottom: '16px',
        }}>
          {/* Search */}
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="#999" strokeWidth="1.5"/>
              <path d="M13.5 13.5L17 17" stroke="#999" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search ownership groups..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                ...styles.searchInput,
                width: isMobile ? '100%' : '280px',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {/* Sort tabs */}
            <div style={styles.tabs}>
              {sortOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  style={{ ...styles.tab, ...(sort === opt.key ? styles.tabActive : {}) }}
                >
                  Sort: {opt.label}
                </button>
              ))}
            </div>

            {/* Segment filter */}
            {availableSegments.length > 0 && (
              <select
                value={segmentFilter}
                onChange={e => setSegmentFilter(e.target.value)}
                style={styles.select}
              >
                <option value="">All Segments</option>
                {availableSegments.map(seg => (
                  <option key={seg} value={seg}>{seg}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Error */}
        {error && <div style={styles.error}>{error}</div>}

        {/* Loading */}
        {loading && (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <p style={{ color: '#666', marginTop: '12px' }}>Loading chain data...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && data && data.chains.length === 0 && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>&#128279;</div>
            <p style={styles.emptyTitle}>No chain data found</p>
            <p style={styles.emptySubtext}>
              {debouncedSearch || segmentFilter
                ? 'Try adjusting your search or filters.'
                : 'Ownership group enrichment data has not been loaded yet. Run the enrichments ingestion script to populate chain analysis.'}
            </p>
          </div>
        )}

        {/* Chain Table */}
        {!loading && !error && data && data.chains.length > 0 && (
          isMobile
            ? <ChainCardList chains={data.chains} onSelect={setSelectedChain} />
            : <ChainTable chains={data.chains} onSelect={setSelectedChain} />
        )}
      </div>

      {/* Detail Panel */}
      {selectedChain && (
        <ChainDetailPanel
          ownershipGroup={selectedChain}
          onClose={() => setSelectedChain(null)}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

// ─── Desktop Table ────────────────────────────────────────────────────────────

function ChainTable({
  chains,
  onSelect,
}: {
  chains: ChainSummary[];
  onSelect: (group: string) => void;
}) {
  return (
    <div style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Ownership Group</th>
            <th style={{ ...styles.th, textAlign: 'center' }}>Locations</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Total Revenue</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Avg / Location</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>3-Mo Growth</th>
            <th style={styles.th}>Top Locations</th>
            <th style={styles.th}>Segments</th>
          </tr>
        </thead>
        <tbody>
          {chains.map(chain => (
            <tr
              key={chain.ownership_group}
              style={styles.tr}
              onClick={() => onSelect(chain.ownership_group)}
            >
              <td style={styles.td}>
                <div style={styles.chainName}>{chain.ownership_group}</div>
              </td>
              <td style={{ ...styles.td, textAlign: 'center' }}>
                <span style={styles.locationBadge}>{chain.location_count}</span>
              </td>
              <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: '600' }}>
                {formatCurrencyFull(chain.total_revenue)}
              </td>
              <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {formatCurrency(chain.avg_revenue_per_location)}
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>
                <span style={{ color: growthColor(chain.growth_pct), fontWeight: '600' }}>
                  {growthLabel(chain.growth_pct)}
                </span>
              </td>
              <td style={styles.td}>
                <div style={{ fontSize: '12px', color: '#555' }}>
                  {chain.top_locations.slice(0, 2).map(loc => (
                    <div key={loc.tabc_permit_number}>
                      {loc.location_name || loc.tabc_permit_number}
                      {loc.location_city ? ` (${loc.location_city})` : ''}
                    </div>
                  ))}
                  {chain.top_locations.length > 2 && (
                    <div style={{ color: '#999' }}>+{chain.top_locations.length - 2} more</div>
                  )}
                </div>
              </td>
              <td style={styles.td}>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {chain.industry_segments.slice(0, 3).map(seg => (
                    <span key={seg} style={styles.segBadge}>{seg}</span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Mobile Card List ─────────────────────────────────────────────────────────

function ChainCardList({
  chains,
  onSelect,
}: {
  chains: ChainSummary[];
  onSelect: (group: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {chains.map(chain => (
        <div
          key={chain.ownership_group}
          style={styles.card}
          onClick={() => onSelect(chain.ownership_group)}
        >
          <div style={styles.cardHeader}>
            <div style={styles.chainName}>{chain.ownership_group}</div>
            <span style={styles.locationBadge}>{chain.location_count} loc</span>
          </div>
          <div style={styles.cardRow}>
            <div style={styles.cardStat}>
              <div style={styles.cardStatLabel}>Revenue</div>
              <div style={styles.cardStatValue}>{formatCurrency(chain.total_revenue)}</div>
            </div>
            <div style={styles.cardStat}>
              <div style={styles.cardStatLabel}>Avg/Loc</div>
              <div style={styles.cardStatValue}>{formatCurrency(chain.avg_revenue_per_location)}</div>
            </div>
            <div style={styles.cardStat}>
              <div style={styles.cardStatLabel}>Growth</div>
              <div style={{ ...styles.cardStatValue, color: growthColor(chain.growth_pct) }}>
                {growthLabel(chain.growth_pct)}
              </div>
            </div>
          </div>
          {chain.industry_segments.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
              {chain.industry_segments.slice(0, 3).map(seg => (
                <span key={seg} style={styles.segBadge}>{seg}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '24px',
  },
  pageHeaderContent: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  headerTitle: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '4px',
    marginBottom: 0,
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
  },
  statsGrid: {
    display: 'grid',
    gap: '12px',
  },
  statCard: {
    background: 'white',
    borderRadius: '10px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  statLabel: {
    fontSize: '12px',
    color: '#888',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  },
  statValue: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    width: '16px',
    height: '16px',
    pointerEvents: 'none',
  },
  searchInput: {
    padding: '9px 12px 9px 34px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    background: 'white',
    outline: 'none',
  },
  tabs: {
    display: 'flex',
    gap: '4px',
    background: '#e5e7eb',
    borderRadius: '8px',
    padding: '3px',
  },
  tab: {
    padding: '7px 14px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: '#666',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    background: 'white',
    color: '#0d7377',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '13px',
    background: 'white',
    color: '#333',
    cursor: 'pointer',
  },
  error: {
    padding: '12px',
    background: '#fee2e2',
    color: '#c33',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#666',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #0d7377',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  emptyIcon: {
    fontSize: '40px',
    marginBottom: '12px',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    margin: '0 0 8px 0',
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#888',
    maxWidth: '440px',
    margin: '0 auto',
    lineHeight: '1.5',
  },
  tableContainer: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
    background: '#fafafa',
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  td: {
    padding: '12px 16px',
    verticalAlign: 'middle',
  },
  chainName: {
    fontWeight: '600',
    color: '#0d7377',
    fontSize: '14px',
  },
  locationBadge: {
    display: 'inline-block',
    background: '#e6f5f5',
    color: '#0d7377',
    borderRadius: '12px',
    padding: '2px 10px',
    fontSize: '12px',
    fontWeight: '600',
  },
  segBadge: {
    display: 'inline-block',
    background: '#f1f5f9',
    color: '#475569',
    borderRadius: '10px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '500',
  },
  // Mobile card styles
  card: {
    background: 'white',
    borderRadius: '10px',
    padding: '14px 16px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
    cursor: 'pointer',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10px',
  },
  cardRow: {
    display: 'flex',
    gap: '12px',
  },
  cardStat: {
    flex: 1,
  },
  cardStatLabel: {
    fontSize: '11px',
    color: '#999',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '3px',
  },
  cardStatValue: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
};

// ─── Detail Panel Styles ──────────────────────────────────────────────────────

const detailStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2000,
  },
  panel: {
    background: 'white',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'hidden',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  headerMeta: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '4px',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '20px',
    lineHeight: 1,
    cursor: 'pointer',
    padding: '4px 8px',
    flexShrink: 0,
    marginLeft: '12px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 0',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #0d7377',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  error: {
    padding: '12px',
    background: '#fee2e2',
    color: '#c33',
    borderRadius: '8px',
    fontSize: '14px',
  },
  summaryGrid: {
    display: 'grid',
    gap: '10px',
    marginBottom: '20px',
  },
  summaryCard: {
    background: '#f8fafc',
    borderRadius: '8px',
    padding: '12px 14px',
    border: '1px solid #e5e7eb',
  },
  summaryLabel: {
    fontSize: '11px',
    color: '#888',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '4px',
  },
  summaryValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '10px',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '1px solid #e5e7eb',
    background: '#fafafa',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
  },
  td: {
    padding: '10px 12px',
    verticalAlign: 'middle',
  },
  locName: {
    fontWeight: '600',
    color: '#1a1a1a',
    fontSize: '13px',
  },
  locMeta: {
    fontSize: '11px',
    color: '#999',
    marginTop: '2px',
  },
  segBadge: {
    display: 'inline-block',
    background: '#f1f5f9',
    color: '#475569',
    borderRadius: '10px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: '500',
  },
};
