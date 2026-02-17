/**
 * Admin Enrichments Component
 * Manages location enrichment data — clean DBA names, ownership groups, industry segments.
 * Features:
 *   - Tile view of unenriched locations sorted by revenue
 *   - AI-powered enrichment suggestions (Claude API)
 *   - Inline editing with dirty tracking
 *   - Batch commit with auto-geocoding
 *   - DuckDB sync trigger
 *   - Full-page expansion mode
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { INDUSTRY_SEGMENTS } from '@/lib/ai/enrich';

// ============================================
// Types
// ============================================

interface EnrichmentLocation {
  tabc_permit_number: string;
  location_name: string;
  location_address: string;
  location_city: string;
  location_county: string;
  location_zip: string;
  total_revenue: number;
  last_receipt_date: string;
  receipt_count: number;
  is_enriched: boolean;
  enrichment: {
    clean_dba_name: string | null;
    ownership_group: string | null;
    industry_segment: string | null;
    clean_up_notes: string | null;
    ai_suggested_dba_name: string | null;
    ai_suggested_ownership: string | null;
    ai_suggested_segment: string | null;
    ai_confidence: number | null;
    ai_enriched_at: string | null;
    source: string | null;
    synced_to_duckdb: boolean;
    geocoded: boolean;
  } | null;
}

interface EnrichmentEdit {
  clean_dba_name: string;
  ownership_group: string;
  industry_segment: string;
  clean_up_notes: string;
  dirty: boolean;
  source: 'manual' | 'ai';
}

interface AIResult {
  tabc_permit_number: string;
  suggested_dba_name: string;
  suggested_ownership_group: string;
  suggested_industry_segment: string;
  confidence: number;
  reasoning: string;
}

interface EnrichmentStats {
  totalLocations: number;
  enrichedCount: number;
  unenrichedCount: number;
  pendingSyncCount: number;
}

// ============================================
// Constants
// ============================================

const BRAND = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
  hover: '#0a5f63',
};

const AI_COLORS = {
  high: '#16a34a',     // green — confidence >= 0.8
  medium: '#ca8a04',   // yellow — confidence 0.5-0.8
  low: '#ea580c',      // orange — confidence < 0.5
};

// ============================================
// Helpers
// ============================================

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const formatNumber = (v: number) =>
  new Intl.NumberFormat('en-US').format(v);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return '#94a3b8';
  if (confidence >= 0.8) return AI_COLORS.high;
  if (confidence >= 0.5) return AI_COLORS.medium;
  return AI_COLORS.low;
}

function getConfidenceLabel(confidence: number | null): string {
  if (confidence === null) return '';
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

// ============================================
// Main Component
// ============================================

export default function AdminEnrichments() {
  // Data state
  const [locations, setLocations] = useState<EnrichmentLocation[]>([]);
  const [stats, setStats] = useState<EnrichmentStats | null>(null);
  const [edits, setEdits] = useState<Map<string, EnrichmentEdit>>(new Map());

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'unenriched' | 'enriched' | 'all'>('unenriched');
  const [fullPageMode, setFullPageMode] = useState(false);

  // AI state
  const [aiLoading, setAiLoading] = useState<Set<string>>(new Set());
  const [aiBulkLoading, setAiBulkLoading] = useState(false);

  // Commit state
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Search debounce
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 50;

  // ----------------------------------------
  // Debounced search
  // ----------------------------------------

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  // ----------------------------------------
  // Fetch locations
  // ----------------------------------------

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: statusFilter,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const response = await fetch(`/api/admin/enrichments?${params}`);
      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch enrichment data');
      }
      const data = await response.json();
      setLocations(data.locations || []);
      setTotalCount(data.totalCount || 0);
      setStats(data.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // ----------------------------------------
  // Edit tracking
  // ----------------------------------------

  const getEdit = (permit: string): EnrichmentEdit => {
    if (edits.has(permit)) return edits.get(permit)!;
    // Initialize from existing enrichment or AI suggestions
    const loc = locations.find(l => l.tabc_permit_number === permit);
    const e = loc?.enrichment;
    return {
      clean_dba_name: e?.clean_dba_name || e?.ai_suggested_dba_name || '',
      ownership_group: e?.ownership_group || e?.ai_suggested_ownership || '',
      industry_segment: e?.industry_segment || e?.ai_suggested_segment || '',
      clean_up_notes: e?.clean_up_notes || '',
      dirty: false,
      source: e?.source === 'ai' ? 'ai' : 'manual',
    };
  };

  const updateEdit = (permit: string, field: keyof EnrichmentEdit, value: string) => {
    const current = getEdit(permit);
    const updated = { ...current, [field]: value, dirty: true, source: 'manual' as const };
    setEdits(prev => new Map(prev).set(permit, updated));
  };

  const dirtyCount = Array.from(edits.values()).filter(e => e.dirty).length;

  // ----------------------------------------
  // AI Enrichment (single)
  // ----------------------------------------

  const enrichWithAI = async (loc: EnrichmentLocation) => {
    const permit = loc.tabc_permit_number;
    setAiLoading(prev => new Set(prev).add(permit));

    try {
      const response = await fetch('/api/admin/enrichments/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [{
            tabc_permit_number: loc.tabc_permit_number,
            location_name: loc.location_name,
            location_address: loc.location_address,
            location_city: loc.location_city,
            location_county: loc.location_county,
            location_zip: loc.location_zip,
            total_revenue: loc.total_revenue,
          }],
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'AI enrichment failed');
      }

      const data = await response.json();
      const result: AIResult | undefined = data.results?.[0];

      if (result) {
        // Pre-populate edit fields with AI suggestions
        const edit: EnrichmentEdit = {
          clean_dba_name: result.suggested_dba_name,
          ownership_group: result.suggested_ownership_group,
          industry_segment: result.suggested_industry_segment,
          clean_up_notes: '',
          dirty: true,
          source: 'ai',
        };
        setEdits(prev => new Map(prev).set(permit, edit));

        // Update the location's enrichment data locally
        setLocations(prev => prev.map(l =>
          l.tabc_permit_number === permit ? {
            ...l,
            enrichment: {
              ...l.enrichment,
              ai_suggested_dba_name: result.suggested_dba_name,
              ai_suggested_ownership: result.suggested_ownership_group,
              ai_suggested_segment: result.suggested_industry_segment,
              ai_confidence: result.confidence,
              ai_enriched_at: new Date().toISOString(),
              source: 'ai',
              clean_dba_name: l.enrichment?.clean_dba_name || null,
              ownership_group: l.enrichment?.ownership_group || null,
              industry_segment: l.enrichment?.industry_segment || null,
              clean_up_notes: l.enrichment?.clean_up_notes || null,
              synced_to_duckdb: l.enrichment?.synced_to_duckdb || false,
              geocoded: l.enrichment?.geocoded || false,
            },
          } : l
        ));
      }
    } catch (err: any) {
      setCommitResult({ message: err?.message || 'AI enrichment failed', type: 'error' });
    } finally {
      setAiLoading(prev => {
        const next = new Set(prev);
        next.delete(permit);
        return next;
      });
    }
  };

  // ----------------------------------------
  // AI Enrichment (bulk — top N unenriched)
  // ----------------------------------------

  const enrichAllWithAI = async () => {
    const unenriched = locations.filter(l => !l.is_enriched && !edits.has(l.tabc_permit_number));
    const batch = unenriched.slice(0, 20);
    if (batch.length === 0) {
      setCommitResult({ message: 'No unenriched locations to process', type: 'error' });
      return;
    }

    setAiBulkLoading(true);
    try {
      const response = await fetch('/api/admin/enrichments/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: batch.map(loc => ({
            tabc_permit_number: loc.tabc_permit_number,
            location_name: loc.location_name,
            location_address: loc.location_address,
            location_city: loc.location_city,
            location_county: loc.location_county,
            location_zip: loc.location_zip,
            total_revenue: loc.total_revenue,
          })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Bulk AI enrichment failed');
      }

      const data = await response.json();
      const results: AIResult[] = data.results || [];

      // Apply results to edit state
      const newEdits = new Map(edits);
      for (const result of results) {
        newEdits.set(result.tabc_permit_number, {
          clean_dba_name: result.suggested_dba_name,
          ownership_group: result.suggested_ownership_group,
          industry_segment: result.suggested_industry_segment,
          clean_up_notes: '',
          dirty: true,
          source: 'ai',
        });
      }
      setEdits(newEdits);

      // Update locations locally with AI data
      setLocations(prev => prev.map(l => {
        const aiResult = results.find(r => r.tabc_permit_number === l.tabc_permit_number);
        if (!aiResult) return l;
        return {
          ...l,
          enrichment: {
            ...l.enrichment,
            ai_suggested_dba_name: aiResult.suggested_dba_name,
            ai_suggested_ownership: aiResult.suggested_ownership_group,
            ai_suggested_segment: aiResult.suggested_industry_segment,
            ai_confidence: aiResult.confidence,
            ai_enriched_at: new Date().toISOString(),
            source: 'ai',
            clean_dba_name: l.enrichment?.clean_dba_name || null,
            ownership_group: l.enrichment?.ownership_group || null,
            industry_segment: l.enrichment?.industry_segment || null,
            clean_up_notes: l.enrichment?.clean_up_notes || null,
            synced_to_duckdb: l.enrichment?.synced_to_duckdb || false,
            geocoded: l.enrichment?.geocoded || false,
          },
        };
      }));

      setCommitResult({
        message: `AI enriched ${results.length} location(s). Review and commit when ready.`,
        type: 'success',
      });
    } catch (err: any) {
      setCommitResult({ message: err?.message || 'Bulk AI enrichment failed', type: 'error' });
    } finally {
      setAiBulkLoading(false);
    }
  };

  // ----------------------------------------
  // Commit (single or batch)
  // ----------------------------------------

  const commitSingle = async (permit: string) => {
    const edit = edits.get(permit);
    if (!edit || !edit.dirty) return;

    setCommitLoading(true);
    try {
      const response = await fetch('/api/admin/enrichments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrichments: [{
            tabc_permit_number: permit,
            clean_dba_name: edit.clean_dba_name || null,
            ownership_group: edit.ownership_group || null,
            industry_segment: edit.industry_segment || null,
            clean_up_notes: edit.clean_up_notes || null,
            source: edit.source,
          }],
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Commit failed');
      }

      const data = await response.json();

      // Mark as no longer dirty
      setEdits(prev => {
        const next = new Map(prev);
        const e = next.get(permit);
        if (e) next.set(permit, { ...e, dirty: false });
        return next;
      });

      // Mark as enriched in locations list
      setLocations(prev => prev.map(l =>
        l.tabc_permit_number === permit ? { ...l, is_enriched: true } : l
      ));

      setCommitResult({ message: data.message || 'Committed successfully', type: 'success' });
    } catch (err: any) {
      setCommitResult({ message: err?.message || 'Commit failed', type: 'error' });
    } finally {
      setCommitLoading(false);
    }
  };

  const commitAllDirty = async () => {
    const dirtyEdits = Array.from(edits.entries()).filter(([, e]) => e.dirty);
    if (dirtyEdits.length === 0) return;

    setCommitLoading(true);
    try {
      const response = await fetch('/api/admin/enrichments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrichments: dirtyEdits.map(([permit, edit]) => ({
            tabc_permit_number: permit,
            clean_dba_name: edit.clean_dba_name || null,
            ownership_group: edit.ownership_group || null,
            industry_segment: edit.industry_segment || null,
            clean_up_notes: edit.clean_up_notes || null,
            source: edit.source,
          })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Batch commit failed');
      }

      const data = await response.json();

      // Mark all as committed
      setEdits(prev => {
        const next = new Map(prev);
        for (const [permit] of dirtyEdits) {
          const e = next.get(permit);
          if (e) next.set(permit, { ...e, dirty: false });
        }
        return next;
      });

      // Mark as enriched
      const dirtyPermits = new Set(dirtyEdits.map(([p]) => p));
      setLocations(prev => prev.map(l =>
        dirtyPermits.has(l.tabc_permit_number) ? { ...l, is_enriched: true } : l
      ));

      setCommitResult({ message: data.message || `Committed ${dirtyEdits.length} enrichment(s)`, type: 'success' });

      // Refresh stats
      fetchLocations();
    } catch (err: any) {
      setCommitResult({ message: err?.message || 'Batch commit failed', type: 'error' });
    } finally {
      setCommitLoading(false);
    }
  };

  // ----------------------------------------
  // Skip (clear edit for a location)
  // ----------------------------------------

  const skipLocation = (permit: string) => {
    setEdits(prev => {
      const next = new Map(prev);
      next.delete(permit);
      return next;
    });
  };

  // ----------------------------------------
  // Sync to DuckDB
  // ----------------------------------------

  const triggerSync = async () => {
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/admin/enrichments/sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      setSyncResult(data.message || 'Sync started');
    } catch (err: any) {
      setSyncResult(`Error: ${err?.message || 'Sync failed'}`);
    } finally {
      setSyncLoading(false);
    }
  };

  // ----------------------------------------
  // Pagination
  // ----------------------------------------

  const totalPages = Math.ceil(totalCount / limit);

  // ============================================
  // Render
  // ============================================

  const containerStyle: React.CSSProperties = fullPageMode
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: '#f8fafc',
        overflow: 'auto',
        padding: '24px',
      }
    : {};

  return (
    <div style={containerStyle}>
      {/* Full-page header */}
      {fullPageMode && (
        <div style={es.fullPageHeader}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: BRAND.primaryDark }}>
            Location Enrichments
          </h2>
          <button onClick={() => setFullPageMode(false)} style={es.exitFullPageBtn}>
            Exit Full Page
          </button>
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div style={es.statsBar}>
          <div style={es.statsGroup}>
            <span style={es.statItem}>
              <strong style={{ color: BRAND.primary }}>{formatNumber(stats.unenrichedCount)}</strong>
              {' '}unenriched
            </span>
            <span style={es.statDivider}>|</span>
            <span style={es.statItem}>
              <strong>{formatNumber(stats.enrichedCount)}</strong>
              {' '}enriched
            </span>
            <span style={es.statDivider}>|</span>
            <span style={es.statItem}>
              <strong>{formatNumber(stats.totalLocations)}</strong>
              {' '}total
            </span>
            {stats.pendingSyncCount > 0 && (
              <>
                <span style={es.statDivider}>|</span>
                <span style={{ ...es.statItem, color: '#ca8a04' }}>
                  <strong>{stats.pendingSyncCount}</strong> pending sync
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Controls Row */}
      <div style={es.controlsRow}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name, address, or permit..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={es.searchInput}
        />

        {/* Status Filter */}
        <div style={es.filterGroup}>
          {(['unenriched', 'enriched', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{
                ...es.filterBtn,
                ...(statusFilter === s ? es.filterBtnActive : {}),
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={es.actionGroup}>
          <button
            onClick={enrichAllWithAI}
            disabled={aiBulkLoading || loading}
            style={{
              ...es.aiBtn,
              opacity: aiBulkLoading ? 0.6 : 1,
            }}
          >
            {aiBulkLoading ? 'AI Processing...' : 'Enrich All with AI'}
          </button>

          {dirtyCount > 0 && (
            <button
              onClick={commitAllDirty}
              disabled={commitLoading}
              style={es.commitAllBtn}
            >
              {commitLoading ? 'Committing...' : `Commit All (${dirtyCount})`}
            </button>
          )}

          <button
            onClick={triggerSync}
            disabled={syncLoading || (stats?.pendingSyncCount === 0)}
            style={{
              ...es.syncBtn,
              opacity: syncLoading || (stats?.pendingSyncCount === 0) ? 0.5 : 1,
            }}
          >
            {syncLoading ? 'Syncing...' : 'Sync to DuckDB'}
            {stats && stats.pendingSyncCount > 0 && (
              <span style={es.syncBadge}>{stats.pendingSyncCount}</span>
            )}
          </button>

          <button
            onClick={() => setFullPageMode(!fullPageMode)}
            style={es.expandBtn}
          >
            {fullPageMode ? 'Exit Full Page' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Result Banners */}
      {commitResult && (
        <div style={{
          ...es.resultBanner,
          background: commitResult.type === 'success' ? '#f0fdf4' : '#fef2f2',
          borderColor: commitResult.type === 'success' ? '#86efac' : '#fecaca',
          color: commitResult.type === 'success' ? '#166534' : '#991b1b',
        }}>
          {commitResult.message}
          <button onClick={() => setCommitResult(null)} style={es.dismissBtn}>x</button>
        </div>
      )}

      {syncResult && (
        <div style={{
          ...es.resultBanner,
          background: syncResult.startsWith('Error') ? '#fef2f2' : '#f0f9ff',
          borderColor: syncResult.startsWith('Error') ? '#fecaca' : '#bae6fd',
          color: syncResult.startsWith('Error') ? '#991b1b' : '#075985',
        }}>
          {syncResult}
          <button onClick={() => setSyncResult(null)} style={es.dismissBtn}>x</button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={es.errorBanner}>
          {error}
          <button onClick={() => { setError(null); fetchLocations(); }} style={es.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={es.loadingContainer}>
          <div style={es.spinner} />
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Loading locations...</p>
        </div>
      )}

      {/* Tile List */}
      {!loading && locations.length === 0 && (
        <div style={es.emptyState}>
          <p style={{ fontSize: '18px', fontWeight: 600, color: BRAND.primaryDark }}>
            {statusFilter === 'unenriched' ? 'All locations are enriched!' : 'No locations found'}
          </p>
          <p style={{ color: '#64748b' }}>
            {statusFilter === 'unenriched'
              ? 'Switch to "Enriched" or "All" to view existing enrichments.'
              : 'Try adjusting your search or filter.'}
          </p>
        </div>
      )}

      {!loading && locations.length > 0 && (
        <div style={es.tileGrid}>
          {locations.map(loc => {
            const edit = getEdit(loc.tabc_permit_number);
            const isAiLoading = aiLoading.has(loc.tabc_permit_number);
            const isDirty = edits.get(loc.tabc_permit_number)?.dirty || false;
            const confidence = loc.enrichment?.ai_confidence ?? null;

            return (
              <div key={loc.tabc_permit_number} style={{
                ...es.tile,
                ...(isDirty ? es.tileDirty : {}),
              }}>
                {/* Tile Header */}
                <div style={es.tileHeader}>
                  <span style={es.revenueBadge}>{formatCurrency(loc.total_revenue)}</span>
                  <span style={es.permitLabel}>{loc.tabc_permit_number}</span>
                  {loc.is_enriched && !isDirty && (
                    <span style={es.enrichedBadge}>Enriched</span>
                  )}
                  {isDirty && (
                    <span style={es.dirtyBadge}>Unsaved</span>
                  )}
                </div>

                {/* Raw Info */}
                <div style={es.rawInfo}>
                  <div style={es.rawName}>{loc.location_name || 'Unknown'}</div>
                  <div style={es.rawAddress}>
                    {loc.location_address}, {loc.location_city}, TX {loc.location_zip}
                    {loc.location_county ? ` \u00b7 ${loc.location_county} County` : ''}
                  </div>
                  <div style={es.rawMeta}>
                    Last receipt: {loc.last_receipt_date ? formatDate(loc.last_receipt_date) : 'N/A'}
                    {' \u00b7 '}{formatNumber(loc.receipt_count)} records
                  </div>
                </div>

                {/* Editable Fields */}
                <div style={es.fieldsContainer}>
                  {/* Clean DBA Name */}
                  <div style={es.fieldRow}>
                    <label style={es.fieldLabel}>Clean DBA Name</label>
                    <div style={es.fieldInputGroup}>
                      <input
                        type="text"
                        value={edit.clean_dba_name}
                        onChange={e => updateEdit(loc.tabc_permit_number, 'clean_dba_name', e.target.value)}
                        placeholder="Clean business name..."
                        style={es.fieldInput}
                      />
                      {confidence !== null && edit.source === 'ai' && (
                        <span style={{
                          ...es.aiBadge,
                          background: getConfidenceColor(confidence) + '18',
                          color: getConfidenceColor(confidence),
                          borderColor: getConfidenceColor(confidence) + '40',
                        }}>
                          AI {getConfidenceLabel(confidence)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ownership Group */}
                  <div style={es.fieldRow}>
                    <label style={es.fieldLabel}>Ownership Group</label>
                    <div style={es.fieldInputGroup}>
                      <input
                        type="text"
                        value={edit.ownership_group}
                        onChange={e => updateEdit(loc.tabc_permit_number, 'ownership_group', e.target.value)}
                        placeholder="Parent company or chain..."
                        style={es.fieldInput}
                      />
                      {confidence !== null && edit.source === 'ai' && (
                        <span style={{
                          ...es.aiBadge,
                          background: getConfidenceColor(confidence) + '18',
                          color: getConfidenceColor(confidence),
                          borderColor: getConfidenceColor(confidence) + '40',
                        }}>
                          AI
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Industry Segment */}
                  <div style={es.fieldRow}>
                    <label style={es.fieldLabel}>Industry Segment</label>
                    <div style={es.fieldInputGroup}>
                      <select
                        value={edit.industry_segment}
                        onChange={e => updateEdit(loc.tabc_permit_number, 'industry_segment', e.target.value)}
                        style={es.fieldSelect}
                      >
                        <option value="">Select segment...</option>
                        {INDUSTRY_SEGMENTS.map(seg => (
                          <option key={seg} value={seg}>{seg}</option>
                        ))}
                      </select>
                      {confidence !== null && edit.source === 'ai' && (
                        <span style={{
                          ...es.aiBadge,
                          background: getConfidenceColor(confidence) + '18',
                          color: getConfidenceColor(confidence),
                          borderColor: getConfidenceColor(confidence) + '40',
                        }}>
                          AI
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  <div style={es.fieldRow}>
                    <label style={es.fieldLabel}>Notes</label>
                    <input
                      type="text"
                      value={edit.clean_up_notes}
                      onChange={e => updateEdit(loc.tabc_permit_number, 'clean_up_notes', e.target.value)}
                      placeholder="Optional notes..."
                      style={es.fieldInput}
                    />
                  </div>
                </div>

                {/* AI Reasoning */}
                {loc.enrichment?.ai_confidence !== null && loc.enrichment?.ai_confidence !== undefined && (
                  <div style={es.aiReasoningBox}>
                    <span style={{ fontWeight: 600, fontSize: '11px', color: '#64748b' }}>AI Confidence: </span>
                    <span style={{ fontWeight: 700, color: getConfidenceColor(loc.enrichment.ai_confidence) }}>
                      {Math.round(loc.enrichment.ai_confidence * 100)}%
                    </span>
                  </div>
                )}

                {/* Tile Actions */}
                <div style={es.tileActions}>
                  <button
                    onClick={() => enrichWithAI(loc)}
                    disabled={isAiLoading}
                    style={{
                      ...es.tileBtn,
                      ...es.tileBtnAI,
                      opacity: isAiLoading ? 0.6 : 1,
                    }}
                  >
                    {isAiLoading ? 'Processing...' : 'Enrich with AI'}
                  </button>

                  <button
                    onClick={() => commitSingle(loc.tabc_permit_number)}
                    disabled={!isDirty || commitLoading}
                    style={{
                      ...es.tileBtn,
                      ...es.tileBtnCommit,
                      opacity: !isDirty || commitLoading ? 0.4 : 1,
                    }}
                  >
                    Commit
                  </button>

                  <button
                    onClick={() => skipLocation(loc.tabc_permit_number)}
                    disabled={!isDirty}
                    style={{
                      ...es.tileBtn,
                      ...es.tileBtnSkip,
                      opacity: !isDirty ? 0.4 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={es.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{ ...es.pageBtn, opacity: page <= 1 ? 0.4 : 1 }}
          >
            Previous
          </button>
          <span style={es.pageInfo}>
            Page {page} of {totalPages} ({formatNumber(totalCount)} locations)
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{ ...es.pageBtn, opacity: page >= totalPages ? 0.4 : 1 }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Styles
// ============================================

const es: Record<string, React.CSSProperties> = {
  // Full-page mode
  fullPageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    paddingBottom: '16px',
    borderBottom: '2px solid #e2e8f0',
  },
  exitFullPageBtn: {
    padding: '8px 16px',
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
  },

  // Stats bar
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    background: BRAND.primaryLight,
    borderRadius: '8px',
    marginBottom: '16px',
  },
  statsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#475569',
    flexWrap: 'wrap' as const,
  },
  statItem: {},
  statDivider: { color: '#cbd5e1' },

  // Controls row
  controlsRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  searchInput: {
    flex: '1 1 240px',
    padding: '10px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    minWidth: '200px',
  },
  filterGroup: {
    display: 'flex',
    gap: '4px',
  },
  filterBtn: {
    padding: '8px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    background: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#64748b',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    background: BRAND.primary,
    color: 'white',
    borderColor: BRAND.primary,
  },
  actionGroup: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },

  // Buttons
  aiBtn: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  commitAllBtn: {
    padding: '8px 16px',
    background: BRAND.primary,
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },
  syncBtn: {
    padding: '8px 16px',
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    whiteSpace: 'nowrap' as const,
  },
  syncBadge: {
    background: '#ca8a04',
    color: 'white',
    borderRadius: '10px',
    padding: '1px 7px',
    fontSize: '11px',
    fontWeight: 700,
  },
  expandBtn: {
    padding: '8px 14px',
    background: 'white',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },

  // Banners
  resultBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid',
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: 500,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 700,
    color: 'inherit',
    opacity: 0.6,
    padding: '0 4px',
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    marginBottom: '12px',
    color: '#991b1b',
    fontSize: '14px',
  },
  retryBtn: {
    padding: '6px 14px',
    background: 'white',
    color: '#991b1b',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },

  // Loading
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '4px solid #f3f3f3',
    borderTop: `4px solid ${BRAND.primary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '12px',
  },

  // Empty state
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 20px',
  },

  // Tile grid
  tileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
    gap: '16px',
  },

  // Tile
  tile: {
    background: 'white',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    padding: '16px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  tileDirty: {
    borderColor: BRAND.primary,
    boxShadow: `0 0 0 2px ${BRAND.primary}20`,
  },

  // Tile header
  tileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
    flexWrap: 'wrap' as const,
  },
  revenueBadge: {
    background: BRAND.primaryLight,
    color: BRAND.primary,
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: 700,
  },
  permitLabel: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  enrichedBadge: {
    background: '#f0fdf4',
    color: '#16a34a',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    marginLeft: 'auto',
  },
  dirtyBadge: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    marginLeft: 'auto',
  },

  // Raw info
  rawInfo: {
    marginBottom: '14px',
    paddingBottom: '12px',
    borderBottom: '1px solid #f1f5f9',
  },
  rawName: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '3px',
  },
  rawAddress: {
    fontSize: '13px',
    color: '#64748b',
    lineHeight: 1.4,
  },
  rawMeta: {
    fontSize: '12px',
    color: '#94a3b8',
    marginTop: '4px',
  },

  // Fields
  fieldsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginBottom: '12px',
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '3px',
  },
  fieldLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  fieldInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  fieldInput: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    background: '#fafafa',
  },
  fieldSelect: {
    flex: 1,
    padding: '7px 10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    background: '#fafafa',
    cursor: 'pointer',
  },

  // AI badge
  aiBadge: {
    padding: '2px 7px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
    border: '1px solid',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },

  // AI reasoning
  aiReasoningBox: {
    padding: '6px 10px',
    background: '#f8fafc',
    borderRadius: '6px',
    marginBottom: '12px',
    fontSize: '12px',
  },

  // Tile actions
  tileActions: {
    display: 'flex',
    gap: '8px',
  },
  tileBtn: {
    padding: '7px 14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'opacity 0.15s',
  },
  tileBtnAI: {
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: 'white',
  },
  tileBtnCommit: {
    background: BRAND.primary,
    color: 'white',
  },
  tileBtnSkip: {
    background: '#f1f5f9',
    color: '#64748b',
    border: '1px solid #e2e8f0',
  },

  // Pagination
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 0',
    marginTop: '8px',
  },
  pageBtn: {
    padding: '8px 18px',
    background: 'white',
    color: BRAND.primary,
    border: `1px solid ${BRAND.primary}`,
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  pageInfo: {
    fontSize: '13px',
    color: '#64748b',
  },
};
