/**
 * Analytics Client Component
 * Comprehensive analytics dashboard with three tabs:
 *   1. Overview - KPIs, revenue trends, category mix, movers, geographic breakdowns
 *   2. Ownership - Ownership group analysis with expandable rows
 *   3. OCR Search - Full-text search across photo OCR text
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useIsMobile } from '@/lib/hooks/use-media-query';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ============================================
// Types
// ============================================

interface AnalyticsKPIs {
  totalRevenue: number;
  totalCustomers: number;
  avgRevenuePerCustomer: number;
  activeCustomers: number;
}

interface RevenueTrendItem {
  month: string;
  total: number;
  liquor: number;
  wine: number;
  beer: number;
  locationCount: number;
}

interface CategoryMix {
  liquor: number;
  wine: number;
  beer: number;
  coverCharge: number;
}

interface MoverItem {
  permit: string;
  name: string;
  currentRevenue: number;
  previousRevenue: number;
  change: number;
  changePercent: number;
}

interface MetroplexItem {
  metroplex: string;
  revenue: number;
  customerCount: number;
}

interface CountyItem {
  county: string;
  revenue: number;
  customerCount: number;
}

interface IndustrySegmentItem {
  segment: string;
  revenue: number;
  customerCount: number;
}

interface OwnershipGroupItem {
  group: string;
  locationCount: number;
  totalRevenue: number;
  avgRevenuePerLocation: number;
}

interface MonthlyGrowthItem {
  month: string;
  revenue: number;
  growthPercent: number | null;
}

interface AnalyticsData {
  kpis: AnalyticsKPIs;
  revenueTrend: RevenueTrendItem[];
  categoryMix: CategoryMix;
  topMovers: MoverItem[];
  bottomMovers: MoverItem[];
  metroplexBreakdown: MetroplexItem[];
  countyBreakdown: CountyItem[];
  industrySegmentMix: IndustrySegmentItem[];
  ownershipGroups: OwnershipGroupItem[];
  monthlyGrowth: MonthlyGrowthItem[];
  comparisonMode: string | null;
}

interface OcrSearchResult {
  id: string;
  photo_url: string;
  photo_type: string | null;
  ocr_text: string | null;
  uploaded_at: string;
  file_size_bytes: number | null;
  activity: {
    id: string;
    tabc_permit_number: string;
    activity_type: string;
    activity_date: string;
    contact_name: string | null;
  };
}

interface OcrSearchResponse {
  results: OcrSearchResult[];
  total: number;
  stats: {
    totalPhotos: number;
    photosWithOcr: number;
  };
}

type TabKey = 'overview' | 'ownership' | 'ocr';
type PeriodKey = '12' | '24' | '36' | 'all';
type CategoryKey = 'total' | 'beer' | 'wine' | 'liquor' | 'cover_charge';
type ComparisonMode = 'yoy' | 'mom' | '90over90' | '3yr' | '5yr';
type SortField = 'group' | 'locationCount' | 'totalRevenue' | 'avgRevenuePerLocation';
type SortDir = 'asc' | 'desc';

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

const CHART_COLORS = {
  total: '#0d7377',
  liquor: '#ec4899',
  wine: '#6366f1',
  beer: '#22c55e',
};

const PIE_COLORS = ['#ec4899', '#6366f1', '#22c55e', '#f59e0b'];
const SEGMENT_PIE_COLORS = ['#0d7377', '#22d3e6', '#ec4899', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ownership', label: 'Ownership' },
  { key: 'ocr', label: 'OCR Search' },
];

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: '12', label: '12 mo' },
  { key: '24', label: '24 mo' },
  { key: '36', label: '36 mo' },
  { key: 'all', label: 'All' },
];

const CATEGORIES: { key: CategoryKey; label: string; color: string }[] = [
  { key: 'total', label: 'Total', color: '#0d7377' },
  { key: 'beer', label: 'Beer', color: '#22c55e' },
  { key: 'wine', label: 'Wine', color: '#6366f1' },
  { key: 'liquor', label: 'Spirits', color: '#ec4899' },
  { key: 'cover_charge', label: 'Cover Charge', color: '#f59e0b' },
];

const COMPARISONS: { key: ComparisonMode; label: string }[] = [
  { key: 'yoy', label: 'YoY' },
  { key: 'mom', label: 'MoM' },
  { key: '90over90', label: '90/90' },
  { key: '3yr', label: '3yr Trend' },
  { key: '5yr', label: '5yr Trend' },
];

const ACTIVITY_ICONS: Record<string, string> = {
  visit: '\u{1F3E2}',
  call: '\u{1F4DE}',
  email: '\u{1F4E7}',
  note: '\u{1F4DD}',
};

const PHOTO_TYPE_LABELS: Record<string, string> = {
  receipt: 'Receipt',
  menu: 'Menu',
  product_display: 'Product Display',
  shelf: 'Shelf',
  other: 'Other',
};

const OCR_PAGE_SIZE = 50;

// ============================================
// Helpers
// ============================================

function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000_000) {
    return '$' + (value / 1_000_000_000).toFixed(1) + 'B';
  }
  if (value >= 1_000_000) {
    return '$' + (value / 1_000_000).toFixed(1) + 'M';
  }
  if (value >= 1_000) {
    return '$' + (value / 1_000).toFixed(0) + 'K';
  }
  return '$' + value.toFixed(0);
}

function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function highlightText(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let lastIdx = 0;
  let idx = lower.indexOf(q);
  let keyCounter = 0;
  while (idx !== -1) {
    if (idx > lastIdx) {
      parts.push(text.slice(lastIdx, idx));
    }
    parts.push(
      <mark
        key={keyCounter++}
        style={{ background: '#fef08a', padding: '0 1px', borderRadius: '2px' }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    lastIdx = idx + q.length;
    idx = lower.indexOf(q, lastIdx);
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts;
}

// Custom tooltip formatter for recharts currency axes
function currencyTickFormatter(value: number): string {
  return formatCurrencyCompact(value);
}

// Month short names for overlay x-axis
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Colors for multi-year overlays
const YEAR_COLORS = ['#0d7377', '#ec4899', '#6366f1', '#22c55e', '#f59e0b', '#ef4444'];

/**
 * Transform flat revenueTrend data into overlaid year-by-year rows.
 * Each row has { monthLabel: "Jan", "2023": 1234, "2024": 5678, ... }
 * This lets us overlay years on a shared Jan-Dec x-axis.
 */
function buildYearOverlayData(revenueTrend: RevenueTrendItem[]): { data: Record<string, unknown>[]; years: string[] } {
  // Group by year → month
  const yearMap: Record<string, Record<number, number>> = {};
  for (const row of revenueTrend) {
    const [yearStr, monthStr] = row.month.split('-');
    const monthIdx = parseInt(monthStr, 10); // 1-12
    if (!yearMap[yearStr]) yearMap[yearStr] = {};
    yearMap[yearStr][monthIdx] = row.total;
  }

  const years = Object.keys(yearMap).sort();

  // Build rows for months 1-12
  const data: Record<string, unknown>[] = [];
  for (let m = 1; m <= 12; m++) {
    const row: Record<string, unknown> = { monthLabel: MONTH_SHORT[m - 1], monthNum: m };
    let hasAny = false;
    for (const y of years) {
      if (yearMap[y][m] !== undefined) {
        row[y] = yearMap[y][m];
        hasAny = true;
      }
    }
    if (hasAny) data.push(row);
  }

  return { data, years };
}

/**
 * Build MoM comparison data — bar chart with current vs prior month.
 */
function buildMomData(revenueTrend: RevenueTrendItem[]): { data: { label: string; revenue: number }[]; labels: string[] } {
  if (revenueTrend.length < 2) {
    return { data: [], labels: [] };
  }
  // Take the last two complete months
  const sorted = [...revenueTrend].sort((a, b) => a.month.localeCompare(b.month));
  const prev = sorted[sorted.length - 2];
  const curr = sorted[sorted.length - 1];

  const formatLabel = (m: string) => {
    const [y, mo] = m.split('-');
    return `${MONTH_SHORT[parseInt(mo, 10) - 1]} ${y}`;
  };

  return {
    data: [
      { label: formatLabel(prev.month), revenue: prev.total },
      { label: formatLabel(curr.month), revenue: curr.total },
    ],
    labels: [formatLabel(prev.month), formatLabel(curr.month)],
  };
}

/**
 * Build 90/90 comparison data — overlay current 3-month period vs same period last year.
 */
function build90over90Data(revenueTrend: RevenueTrendItem[]): { data: Record<string, unknown>[]; periods: string[]; currentTotal: number; priorTotal: number; changePercent: number; changeDollar: number } {
  const sorted = [...revenueTrend].sort((a, b) => a.month.localeCompare(b.month));
  if (sorted.length < 3) return { data: [], periods: [], currentTotal: 0, priorTotal: 0, changePercent: 0, changeDollar: 0 };

  // Find the last 3 complete months
  const recent3 = sorted.slice(-3);
  const currentLabel = `${MONTH_SHORT[parseInt(recent3[0].month.split('-')[1], 10) - 1]}–${MONTH_SHORT[parseInt(recent3[2].month.split('-')[1], 10) - 1]} ${recent3[2].month.split('-')[0]}`;

  // Find matching months from prior year (zero-pad month for matching)
  const prior3: RevenueTrendItem[] = [];
  for (const r of recent3) {
    const [y, m] = r.month.split('-');
    const priorMonth = `${parseInt(y, 10) - 1}-${m}`; // m is already zero-padded from the data
    const match = sorted.find(s => s.month === priorMonth);
    if (match) prior3.push(match);
  }

  if (prior3.length < 1) return { data: [], periods: [], currentTotal: 0, priorTotal: 0, changePercent: 0, changeDollar: 0 };
  const priorLabel = `${MONTH_SHORT[parseInt(prior3[0].month.split('-')[1], 10) - 1]}–${MONTH_SHORT[parseInt(prior3[prior3.length - 1].month.split('-')[1], 10) - 1]} ${prior3[prior3.length - 1].month.split('-')[0]}`;

  // Build data for individual months + a TOTAL bar
  const data: Record<string, unknown>[] = [];
  let currentTotal = 0;
  let priorTotal = 0;
  for (let i = 0; i < recent3.length; i++) {
    const monthNum = parseInt(recent3[i].month.split('-')[1], 10);
    const row: Record<string, unknown> = {
      monthLabel: MONTH_SHORT[monthNum - 1],
      [currentLabel]: recent3[i].total,
    };
    currentTotal += recent3[i].total;
    if (prior3[i]) {
      row[priorLabel] = prior3[i].total;
      priorTotal += prior3[i].total;
    }
    data.push(row);
  }

  // Append total bar
  data.push({
    monthLabel: 'TOTAL',
    [currentLabel]: currentTotal,
    [priorLabel]: priorTotal,
  });

  // Compute change for summary
  const changePercent = priorTotal > 0 ? ((currentTotal - priorTotal) / priorTotal) * 100 : 0;
  const changeDollar = currentTotal - priorTotal;

  return { data, periods: [currentLabel, priorLabel], currentTotal, priorTotal, changePercent, changeDollar };
}

/**
 * Compute a zoomed Y-axis domain from overlay data.
 * Finds min/max across all year values, adds 5% padding on each side.
 */
function computeZoomedDomain(data: Record<string, unknown>[], keys: string[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const row of data) {
    for (const k of keys) {
      const v = row[k] as number | undefined;
      if (v !== undefined && v !== null) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (min === Infinity || max === -Infinity) return [0, 1];
  const padding = (max - min) * 0.08;
  return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
}

// ============================================
// Sub-components
// ============================================

/** Skeleton block for loading states */
function SkeletonBlock({ height = 200, style: extraStyle }: { height?: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        height,
        borderRadius: '12px',
        background: 'linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        ...extraStyle,
      }}
    />
  );
}

/** Skeleton layout for Overview tab */
function OverviewSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} height={32} style={{ width: '64px', borderRadius: '16px' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonBlock key={i} height={100} />
        ))}
      </div>
      <SkeletonBlock height={300} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <SkeletonBlock height={260} />
        <SkeletonBlock height={260} />
      </div>
      <SkeletonBlock height={260} />
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function AnalyticsClient() {
  const isMobile = useIsMobile();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Overview state
  const [period, setPeriod] = useState<PeriodKey>('12');
  const [categoryFilter, setCategoryFilter] = useState<CategoryKey>('total');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Industry segment Top N state
  const [segmentTopN, setSegmentTopN] = useState(10);
  const [showSegmentOther, setShowSegmentOther] = useState(false);

  // Ownership state — search & compare
  const [ownershipSort, setOwnershipSort] = useState<SortField>('totalRevenue');
  const [ownershipDir, setOwnershipDir] = useState<SortDir>('desc');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [ownershipSearch, setOwnershipSearch] = useState('');
  const [ownershipSearchResults, setOwnershipSearchResults] = useState<{ group: string; locationCount: number; totalRevenue: number }[]>([]);
  const [ownershipSearchLoading, setOwnershipSearchLoading] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [comparedGroups, setComparedGroups] = useState<any[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [expandedCompareGroup, setExpandedCompareGroup] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState<string | null>(null);
  const ownershipSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // OCR Search state
  const [ocrQuery, setOcrQuery] = useState('');
  const [ocrDebouncedQuery, setOcrDebouncedQuery] = useState('');
  const [ocrResults, setOcrResults] = useState<OcrSearchResult[]>([]);
  const [ocrTotal, setOcrTotal] = useState(0);
  const [ocrStats, setOcrStats] = useState<{ totalPhotos: number; photosWithOcr: number } | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrOffset, setOcrOffset] = useState(0);
  const [ocrLoadingMore, setOcrLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cache analytics data per period to avoid refetching on tab switch
  const cacheRef = useRef<Record<string, AnalyticsData>>({});

  // ----------------------------------------
  // Fetch analytics data
  // ----------------------------------------

  const fetchAnalytics = useCallback(async (
    periodKey: PeriodKey,
    cat: CategoryKey,
    comparison: ComparisonMode | null,
  ) => {
    // Build cache key from all parameters
    const cacheKey = `${periodKey}_${cat}_${comparison || 'none'}`;

    // Check cache first
    if (cacheRef.current[cacheKey]) {
      setAnalyticsData(cacheRef.current[cacheKey]);
      setAnalyticsLoading(false);
      setAnalyticsError(null);
      return;
    }

    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      const params = new URLSearchParams();
      if (periodKey !== 'all') {
        params.set('monthsBack', periodKey);
      }
      if (cat !== 'total') {
        params.set('category', cat);
      }
      if (comparison) {
        params.set('comparisonMode', comparison);
      }
      const qs = params.toString();
      const url = `/api/analytics${qs ? `?${qs}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Failed to fetch analytics data');
      }

      const result: AnalyticsData = await response.json();
      cacheRef.current[cacheKey] = result;
      setAnalyticsData(result);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period, categoryFilter, comparisonMode);
  }, [period, categoryFilter, comparisonMode, fetchAnalytics]);

  // ----------------------------------------
  // OCR Search: debounced fetch
  // ----------------------------------------

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOcrDebouncedQuery(ocrQuery);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [ocrQuery]);

  const fetchOcrResults = useCallback(async (query: string, offset: number, append: boolean) => {
    if (!query.trim()) {
      if (!append) {
        setOcrResults([]);
        setOcrTotal(0);
      }
      return;
    }

    if (append) {
      setOcrLoadingMore(true);
    } else {
      setOcrLoading(true);
    }
    setOcrError(null);

    try {
      const url = `/api/photos/search?q=${encodeURIComponent(query)}&limit=${OCR_PAGE_SIZE}&offset=${offset}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        throw new Error('Search failed');
      }

      const data: OcrSearchResponse = await response.json();

      if (append) {
        setOcrResults((prev) => [...prev, ...data.results]);
      } else {
        setOcrResults(data.results);
      }
      setOcrTotal(data.total);
      setOcrStats(data.stats);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setOcrLoading(false);
      setOcrLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setOcrOffset(0);
    fetchOcrResults(ocrDebouncedQuery, 0, false);
  }, [ocrDebouncedQuery, fetchOcrResults]);

  const handleLoadMore = useCallback(() => {
    const newOffset = ocrOffset + OCR_PAGE_SIZE;
    setOcrOffset(newOffset);
    fetchOcrResults(ocrDebouncedQuery, newOffset, true);
  }, [ocrOffset, ocrDebouncedQuery, fetchOcrResults]);

  // ----------------------------------------
  // Ownership: sorting
  // ----------------------------------------

  const sortedOwnershipGroups = useMemo(() => {
    if (!analyticsData) return [];
    const groups = [...analyticsData.ownershipGroups];
    groups.sort((a, b) => {
      let cmp = 0;
      switch (ownershipSort) {
        case 'group':
          cmp = a.group.localeCompare(b.group);
          break;
        case 'locationCount':
          cmp = a.locationCount - b.locationCount;
          break;
        case 'totalRevenue':
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case 'avgRevenuePerLocation':
          cmp = a.avgRevenuePerLocation - b.avgRevenuePerLocation;
          break;
      }
      return ownershipDir === 'asc' ? cmp : -cmp;
    });
    return groups;
  }, [analyticsData, ownershipSort, ownershipDir]);

  const handleOwnershipSort = (field: SortField) => {
    if (ownershipSort === field) {
      setOwnershipDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOwnershipSort(field);
      setOwnershipDir('desc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (ownershipSort !== field) return '';
    return ownershipDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  // ----------------------------------------
  // Ownership: summary stats
  // ----------------------------------------

  const ownershipSummary = useMemo(() => {
    if (!analyticsData) return { totalGroups: 0, totalLocations: 0, totalRevenue: 0, avgRevPerGroup: 0 };
    const groups = analyticsData.ownershipGroups;
    const totalGroups = groups.length;
    const totalLocations = groups.reduce((s, g) => s + g.locationCount, 0);
    const totalRevenue = groups.reduce((s, g) => s + g.totalRevenue, 0);
    const avgRevPerGroup = totalGroups > 0 ? totalRevenue / totalGroups : 0;
    return { totalGroups, totalLocations, totalRevenue, avgRevPerGroup };
  }, [analyticsData]);

  // ----------------------------------------
  // Ownership: search groups (debounced)
  // ----------------------------------------

  useEffect(() => {
    if (ownershipSearchRef.current) clearTimeout(ownershipSearchRef.current);
    if (!ownershipSearch.trim()) {
      setOwnershipSearchResults([]);
      return;
    }
    ownershipSearchRef.current = setTimeout(async () => {
      setOwnershipSearchLoading(true);
      try {
        const monthsBack = period === 'all' ? '120' : period;
        const res = await fetch(`/api/analytics/ownership?search=${encodeURIComponent(ownershipSearch)}&monthsBack=${monthsBack}`);
        if (res.ok) {
          const data = await res.json();
          setOwnershipSearchResults(data.results || []);
        }
      } catch {}
      setOwnershipSearchLoading(false);
    }, 350);
    return () => { if (ownershipSearchRef.current) clearTimeout(ownershipSearchRef.current); };
  }, [ownershipSearch, period]);

  // ----------------------------------------
  // Ownership: fetch comparison details
  // ----------------------------------------

  const fetchCompareGroups = useCallback(async (groups: string[]) => {
    if (groups.length === 0) { setComparedGroups([]); return; }
    setCompareLoading(true);
    try {
      const monthsBack = period === 'all' ? '120' : period;
      const res = await fetch(`/api/analytics/ownership?groups=${encodeURIComponent(groups.join(','))}&monthsBack=${monthsBack}`);
      if (res.ok) {
        const data = await res.json();
        const newGroups = data.groups || [];
        // Merge with existing rather than replacing
        setComparedGroups(prev => {
          const merged = [...prev];
          for (const ng of newGroups) {
            const idx = merged.findIndex((g: any) => g.group === ng.group);
            if (idx >= 0) merged[idx] = ng;
            else merged.push(ng);
          }
          return merged;
        });
      }
    } catch {}
    setCompareLoading(false);
  }, [period]);

  const addGroupToCompare = (groupName: string) => {
    if (selectedGroups.includes(groupName)) return;
    const next = [...selectedGroups, groupName];
    setSelectedGroups(next);
    // Auto-fetch detail for the newly added group
    fetchCompareGroups([groupName]);
  };

  const removeGroupFromCompare = (groupName: string) => {
    const next = selectedGroups.filter(g => g !== groupName);
    setSelectedGroups(next);
    setComparedGroups(prev => prev.filter((g: any) => g.group !== groupName));
    if (next.length === 0) setSegmentFilter(null);
    if (expandedCompareGroup === groupName) setExpandedCompareGroup(null);
  };

  // All segments across compared groups
  const allCompareSegments = useMemo(() => {
    const segs = new Set<string>();
    for (const g of comparedGroups) {
      for (const s of (g.segments || [])) {
        if (s.segment && s.segment !== 'Unknown') segs.add(s.segment);
      }
    }
    return Array.from(segs).sort();
  }, [comparedGroups]);

  // ============================================
  // Render: Tabs
  // ============================================

  const renderTabs = () => (
    <div style={s.tabBar}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          style={{
            ...s.tabButton,
            ...(activeTab === tab.key ? s.tabButtonActive : {}),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  // ============================================
  // Render: Overview Tab
  // ============================================

  const renderOverview = () => {
    if (analyticsLoading) return <OverviewSkeleton />;

    if (analyticsError) {
      return (
        <div style={s.errorContainer}>
          <p style={s.errorText}>Error: {analyticsError}</p>
          <button onClick={() => { cacheRef.current = {}; fetchAnalytics(period, categoryFilter, comparisonMode); }} style={s.retryButton}>
            Retry
          </button>
        </div>
      );
    }

    if (!analyticsData) return null;

    const { kpis, revenueTrend, categoryMix, topMovers, bottomMovers, metroplexBreakdown, countyBreakdown, industrySegmentMix, monthlyGrowth } = analyticsData;

    // Category mix data for pie chart
    const categoryPieData = [
      { name: 'Liquor', value: categoryMix.liquor },
      { name: 'Wine', value: categoryMix.wine },
      { name: 'Beer', value: categoryMix.beer },
      { name: 'Cover Charge', value: categoryMix.coverCharge },
    ].filter((d) => d.value > 0);

    // Industry segment data for pie chart — Top N with optional "Other"
    const sortedSegments = [...industrySegmentMix]
      .filter((seg) => seg.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const topSegments = sortedSegments.slice(0, segmentTopN);
    const remainingSegments = sortedSegments.slice(segmentTopN);
    const segmentPieData = topSegments.map((seg) => ({ name: seg.segment || 'Unknown', value: seg.revenue }));
    if (showSegmentOther && remainingSegments.length > 0) {
      const otherRevenue = remainingSegments.reduce((sum, seg) => sum + seg.revenue, 0);
      segmentPieData.push({ name: 'Other', value: otherRevenue });
    }

    // Metroplex top 10 for bar chart
    const metroBarData = [...metroplexBreakdown]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // County top 10 for bar chart
    const countyBarData = [...countyBreakdown]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Handlers for period vs comparison mode mutual exclusion
    const handlePeriodClick = (key: PeriodKey) => {
      setPeriod(key);
      setComparisonMode(null);
    };

    const handleComparisonClick = (key: ComparisonMode) => {
      setComparisonMode(key);
    };

    const handleCategoryClick = (key: CategoryKey) => {
      setCategoryFilter(key);
      cacheRef.current = {};
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Period Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={s.periodRow}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePeriodClick(p.key)}
                style={{
                  ...s.periodPill,
                  ...(period === p.key && comparisonMode === null ? s.periodPillActive : {}),
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Comparison Mode Pills */}
          <div style={s.periodRow}>
            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, alignSelf: 'center', marginRight: '4px' }}>Compare:</span>
            {COMPARISONS.map((c) => (
              <button
                key={c.key}
                onClick={() => handleComparisonClick(c.key)}
                style={{
                  ...s.periodPill,
                  ...(comparisonMode === c.key ? s.periodPillActive : {}),
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div style={s.kpiGrid}>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F4B0}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatCurrencyCompact(kpis.totalRevenue)}</div>
              <div style={s.kpiLabel}>Total Revenue</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F3EA}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(kpis.totalCustomers)}</div>
              <div style={s.kpiLabel}>Customers</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F4CA}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatCurrencyCompact(kpis.avgRevenuePerCustomer)}</div>
              <div style={s.kpiLabel}>Avg Rev / Customer</div>
            </div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiIcon}>{'\u{1F7E2}'}</div>
            <div style={s.kpiContent}>
              <div style={s.kpiValue}>{formatNumber(kpis.activeCustomers)}</div>
              <div style={s.kpiLabel}>Active</div>
            </div>
          </div>
        </div>

        {/* Revenue Trend / Comparison Chart */}
        <div style={s.chartSection}>
          <h3 style={s.chartTitle}>
            {comparisonMode === 'yoy' ? 'Year over Year Comparison'
              : comparisonMode === 'mom' ? 'Month over Month Comparison'
              : comparisonMode === '90over90' ? '90-Day vs Prior Year 90-Day'
              : comparisonMode === '3yr' ? '3-Year Trend (Year over Year)'
              : comparisonMode === '5yr' ? '5-Year Trend (Year over Year)'
              : 'Revenue Trend'}
          </h3>
          <div style={{ width: '100%', height: isMobile ? 280 : 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              {/* MoM: Side-by-side bar chart */}
              {comparisonMode === 'mom' ? (() => {
                const mom = buildMomData(revenueTrend);
                if (mom.data.length === 0) return <LineChart data={[]}><XAxis /><YAxis /></LineChart>;
                const prevVal = mom.data[0].revenue;
                const currVal = mom.data[1].revenue;
                const change = prevVal > 0 ? ((currVal - prevVal) / prevVal) * 100 : 0;
                return (
                  <BarChart data={mom.data} margin={{ top: 20, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#334155', fontWeight: 600 }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={currencyTickFormatter} width={isMobile ? 48 : 60} />
                    <Tooltip formatter={(value: number) => formatCurrencyFull(value)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                      <Cell fill="#94a3b8" />
                      <Cell fill={change >= 0 ? '#22c55e' : '#ef4444'} />
                    </Bar>
                    {/* Change annotation */}
                    <Legend content={() => (
                      <div style={{ textAlign: 'center', fontSize: '15px', fontWeight: 700, color: change >= 0 ? '#16a34a' : '#dc2626', marginTop: '8px' }}>
                        {change >= 0 ? '\u25B2' : '\u25BC'} {change >= 0 ? '+' : ''}{change.toFixed(1)}% ({formatCurrencyCompact(currVal - prevVal)})
                      </div>
                    )} />
                  </BarChart>
                );
              })()

              /* 90/90: Paired bar chart with individual months + TOTAL + summary */
              : comparisonMode === '90over90' ? (() => {
                const d90 = build90over90Data(revenueTrend);
                if (d90.data.length === 0 || d90.periods.length < 2) return <LineChart data={[]}><XAxis /><YAxis /></LineChart>;
                return (
                  <BarChart data={d90.data} margin={{ top: 5, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={currencyTickFormatter} width={isMobile ? 48 : 60} />
                    <Tooltip formatter={(value: number) => formatCurrencyFull(value)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                    <Legend content={() => {
                      const cp = d90.changePercent ?? 0;
                      const cd = d90.changeDollar ?? 0;
                      return (
                        <div style={{ textAlign: 'center', marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                            <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#94a3b8', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />{d90.periods[1]}</span>
                            <span><span style={{ display: 'inline-block', width: 12, height: 12, background: BRAND.primary, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />{d90.periods[0]}</span>
                          </div>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: cp >= 0 ? '#16a34a' : '#dc2626' }}>
                            {cp >= 0 ? '\u25B2' : '\u25BC'} {cp >= 0 ? '+' : ''}{cp.toFixed(1)}% ({cp >= 0 ? '+' : ''}{formatCurrencyCompact(cd)})
                          </div>
                        </div>
                      );
                    }} />
                    <Bar dataKey={d90.periods[1]} fill="#94a3b8" radius={[4, 4, 0, 0]} name={d90.periods[1]} />
                    <Bar dataKey={d90.periods[0]} fill={BRAND.primary} radius={[4, 4, 0, 0]} name={d90.periods[0]} />
                  </BarChart>
                );
              })()

              /* YoY / 3yr / 5yr: Overlaid year lines on Jan-Dec x-axis with zoomed Y */
              : (comparisonMode === 'yoy' || comparisonMode === '3yr' || comparisonMode === '5yr') ? (() => {
                const overlay = buildYearOverlayData(revenueTrend);
                if (overlay.data.length === 0) return <LineChart data={[]}><XAxis /><YAxis /></LineChart>;
                const yDomain = computeZoomedDomain(overlay.data, overlay.years);
                // Build lines array to avoid .map() inside JSX (Recharts stability)
                const lines = overlay.years.map((year, i) => (
                  <Line
                    key={year}
                    type="monotone"
                    dataKey={year}
                    stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                    strokeWidth={i === overlay.years.length - 1 ? 3 : 1.5}
                    strokeDasharray={i === overlay.years.length - 1 ? undefined : '6 3'}
                    dot={i === overlay.years.length - 1 ? { r: 3 } : false}
                    name={year}
                    connectNulls
                  />
                ));
                return (
                  <LineChart data={overlay.data} margin={{ top: 5, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#64748b' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={currencyTickFormatter}
                      width={isMobile ? 48 : 60}
                      domain={yDomain}
                    />
                    <Tooltip formatter={(value: number, name: string) => [formatCurrencyFull(value), name]} labelStyle={{ fontWeight: 600 }} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    {lines}
                  </LineChart>
                );
              })()

              /* Default: Standard revenue trend line chart */
              : (
                <LineChart data={revenueTrend} margin={{ top: 5, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={isMobile ? Math.max(Math.floor(revenueTrend.length / 4), 1) : 'preserveStartEnd'}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={currencyTickFormatter} width={isMobile ? 48 : 60} />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrencyFull(value), name.charAt(0).toUpperCase() + name.slice(1)]}
                    labelStyle={{ fontWeight: 600 }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="total" stroke={CHART_COLORS.total} strokeWidth={2.5} dot={false} name="Total" />
                  <Line type="monotone" dataKey="liquor" stroke={CHART_COLORS.liquor} strokeWidth={1.5} dot={false} name="Liquor" />
                  <Line type="monotone" dataKey="wine" stroke={CHART_COLORS.wine} strokeWidth={1.5} dot={false} name="Wine" />
                  <Line type="monotone" dataKey="beer" stroke={CHART_COLORS.beer} strokeWidth={1.5} dot={false} name="Beer" />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Mix + Industry Segment Pie Charts */}
        <div style={isMobile ? s.singleCol : s.twoCol}>
          <div style={s.chartSection}>
            <h3 style={s.chartTitle}>Category Mix</h3>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 50 : 60}
                    outerRadius={isMobile ? 85 : 100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {categoryPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={s.chartSection}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ ...s.chartTitle, marginBottom: 0 }}>Industry Segments</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => setSegmentTopN(Math.max(5, segmentTopN - 1))}
                    style={s.segmentNButton}
                    title="Show fewer segments"
                  >
                    -
                  </button>
                  <span style={{ fontSize: '12px', color: '#64748b', minWidth: '32px', textAlign: 'center' }}>
                    Top {segmentTopN}
                  </span>
                  <button
                    onClick={() => setSegmentTopN(Math.min(20, segmentTopN + 1))}
                    style={s.segmentNButton}
                    title="Show more segments"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => setShowSegmentOther(!showSegmentOther)}
                  style={{
                    ...s.segmentOtherToggle,
                    ...(showSegmentOther ? s.segmentOtherToggleActive : {}),
                  }}
                >
                  {showSegmentOther ? 'Hide Other' : 'Show Other'}
                </button>
              </div>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={segmentPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 50 : 60}
                    outerRadius={isMobile ? 85 : 100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name.length > 12 ? name.slice(0, 12) + '..' : name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {segmentPieData.map((_, i) => (
                      <Cell key={i} fill={SEGMENT_PIE_COLORS[i % SEGMENT_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrencyFull(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Monthly Growth Bar Chart */}
        <div style={s.chartSection}>
          <h3 style={s.chartTitle}>Monthly Growth</h3>
          <div style={{ width: '100%', height: isMobile ? 240 : 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyGrowth} margin={{ top: 5, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  interval={isMobile ? Math.max(Math.floor(monthlyGrowth.length / 4), 1) : 'preserveStartEnd'}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => v.toFixed(0) + '%'} width={isMobile ? 40 : 50} />
                <Tooltip
                  formatter={(value: unknown) => {
                    const num = value as number | null;
                    return num != null ? formatPercent(num) : 'N/A';
                  }}
                  labelStyle={{ fontWeight: 600 }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="growthPercent" name="Growth %" radius={[4, 4, 0, 0]}>
                  {monthlyGrowth.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.growthPercent != null && entry.growthPercent >= 0 ? '#22c55e' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Filter Pills — applies to metroplex, county, and movers */}
        <div style={s.categoryFilterRow}>
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500, marginRight: '4px' }}>Category:</span>
          {CATEGORIES.map((cat) => {
            const isActive = categoryFilter === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => handleCategoryClick(cat.key)}
                style={{
                  ...s.periodPill,
                  ...(isActive
                    ? { background: cat.color, borderColor: cat.color, color: 'white' }
                    : {}),
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Metroplex + County Bar Charts */}
        <div style={isMobile ? s.singleCol : s.twoCol}>
          <div style={s.chartSection}>
            <h3 style={s.chartTitle}>Top Metroplexes</h3>
            <div style={{ width: '100%', height: isMobile ? 260 : 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metroBarData}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: isMobile ? 80 : 120, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={currencyTickFormatter} />
                  <YAxis
                    type="category"
                    dataKey="metroplex"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    width={isMobile ? 75 : 115}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrencyFull(value)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="revenue" fill={BRAND.primary} radius={[0, 4, 4, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={s.chartSection}>
            <h3 style={s.chartTitle}>Top Counties</h3>
            <div style={{ width: '100%', height: isMobile ? 260 : 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={countyBarData}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: isMobile ? 80 : 120, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={currencyTickFormatter} />
                  <YAxis
                    type="category"
                    dataKey="county"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    width={isMobile ? 75 : 115}
                  />
                  <Tooltip
                    formatter={(value: number) => formatCurrencyFull(value)}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="revenue" fill={BRAND.accent} radius={[0, 4, 4, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top Movers + Bottom Movers Tables */}
        <div style={isMobile ? s.singleCol : s.twoCol}>
          {/* Top Movers */}
          <div style={s.chartSection}>
            <h3 style={s.chartTitle}>
              <span style={{ color: '#22c55e' }}>{'\u25B2'}</span> Top Movers
            </h3>
            {topMovers.length === 0 ? (
              <div style={s.emptyMini}>No data available</div>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Name</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Revenue</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMovers.slice(0, 10).map((m) => (
                      <tr key={m.permit} style={s.tr}>
                        <td style={s.td}>
                          <Link href={`/customers/${m.permit}`} style={s.tableLink}>
                            {m.name || m.permit}
                          </Link>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          {formatCurrencyCompact(m.currentRevenue)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>
                          {'\u25B2'} {formatPercent(m.changePercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Bottom Movers */}
          <div style={s.chartSection}>
            <h3 style={s.chartTitle}>
              <span style={{ color: '#ef4444' }}>{'\u25BC'}</span> Bottom Movers
            </h3>
            {bottomMovers.length === 0 ? (
              <div style={s.emptyMini}>No data available</div>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Name</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Revenue</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottomMovers.slice(0, 10).map((m) => (
                      <tr key={m.permit} style={s.tr}>
                        <td style={s.td}>
                          <Link href={`/customers/${m.permit}`} style={s.tableLink}>
                            {m.name || m.permit}
                          </Link>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          {formatCurrencyCompact(m.currentRevenue)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>
                          {'\u25BC'} {formatPercent(m.changePercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // Render: Ownership Tab
  // ============================================

  const renderOwnership = () => {
    // Client-side filter of ownership groups table by search text
    const searchLower = ownershipSearch.trim().toLowerCase();
    const filteredGroups = searchLower
      ? sortedOwnershipGroups.filter(g => g.group.toLowerCase().includes(searchLower))
      : sortedOwnershipGroups;

    // Helpers for expanded group detail (segments + locations)
    const getFilteredLocations = (group: any) => {
      if (!segmentFilter) return group.locations || [];
      return (group.locations || []).filter((l: any) => l.segment === segmentFilter);
    };

    const getFilteredRevenue = (group: any) => {
      if (!segmentFilter) return group.totalRevenue;
      return (group.locations || [])
        .filter((l: any) => l.segment === segmentFilter)
        .reduce((sum: number, l: any) => sum + l.revenue, 0);
    };

    // Build comparison bar chart data (only when comparing)
    const compareBarData = comparedGroups.map((g, i) => ({
      group: g.group,
      revenue: segmentFilter
        ? (g.locations || []).filter((l: any) => l.segment === segmentFilter).reduce((sum: number, l: any) => sum + l.revenue, 0)
        : g.totalRevenue,
      fill: YEAR_COLORS[i % YEAR_COLORS.length],
    }));

    // Check if we're in compare mode
    const isCompareMode = selectedGroups.length > 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Period selector */}
        <div style={s.periodRow}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); if (selectedGroups.length > 0) fetchCompareGroups(selectedGroups); }}
              style={{
                ...s.periodPill,
                ...(period === p.key ? s.periodPillActive : {}),
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Summary Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '12px' }}>
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}>Ownership Groups</div>
            <div style={s.kpiValue}>{formatNumber(ownershipSummary.totalGroups)}</div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}>Total Locations</div>
            <div style={s.kpiValue}>{formatNumber(ownershipSummary.totalLocations)}</div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}>Total Revenue</div>
            <div style={s.kpiValue}>{formatCurrencyCompact(ownershipSummary.totalRevenue)}</div>
          </div>
          <div style={s.kpiCard}>
            <div style={s.kpiLabel}>Avg Rev/Group</div>
            <div style={s.kpiValue}>{formatCurrencyCompact(ownershipSummary.avgRevPerGroup)}</div>
          </div>
        </div>

        {/* Search + Compare Controls */}
        <div style={s.chartSection}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search input */}
            <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
              <input
                type="text"
                placeholder="Filter ownership groups..."
                value={ownershipSearch}
                onChange={(e) => setOwnershipSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 14px', paddingRight: ownershipSearch ? '32px' : '14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', background: 'white' }}
              />
              {ownershipSearch && (
                <button
                  onClick={() => setOwnershipSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#94a3b8', padding: '2px 4px' }}
                >
                  {'\u2715'}
                </button>
              )}
            </div>

            {/* Compare button / indicator */}
            {selectedGroups.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => fetchCompareGroups(selectedGroups)}
                  style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'white', background: BRAND.primary, border: 'none', cursor: 'pointer' }}
                >
                  Compare ({selectedGroups.length})
                </button>
                <button
                  onClick={() => { setSelectedGroups([]); setComparedGroups([]); setSegmentFilter(null); setExpandedCompareGroup(null); }}
                  style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Result count */}
            <span style={{ fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
              {filteredGroups.length} group{filteredGroups.length !== 1 ? 's' : ''}
              {searchLower ? ' found' : ''}
            </span>
          </div>

          {/* Selected groups chips */}
          {selectedGroups.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
              {selectedGroups.map((g, i) => (
                <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, color: 'white', background: YEAR_COLORS[i % YEAR_COLORS.length] }}>
                  {g}
                  <button
                    onClick={() => removeGroupFromCompare(g)}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: '0 2px', lineHeight: 1, opacity: 0.8 }}
                  >
                    {'\u00D7'}
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ownership Groups Table */}
        <div style={s.chartSection}>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: '36px', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }} title="Select to compare">+/-</span>
                  </th>
                  <th style={{ ...s.th, cursor: 'pointer' }} onClick={() => handleOwnershipSort('group')}>
                    Ownership Group{sortIndicator('group')}
                  </th>
                  <th style={{ ...s.th, cursor: 'pointer', textAlign: 'right' }} onClick={() => handleOwnershipSort('locationCount')}>
                    Locations{sortIndicator('locationCount')}
                  </th>
                  <th style={{ ...s.th, cursor: 'pointer', textAlign: 'right' }} onClick={() => handleOwnershipSort('totalRevenue')}>
                    Total Revenue{sortIndicator('totalRevenue')}
                  </th>
                  <th style={{ ...s.th, cursor: 'pointer', textAlign: 'right' }} onClick={() => handleOwnershipSort('avgRevenuePerLocation')}>
                    Avg/Location{sortIndicator('avgRevenuePerLocation')}
                  </th>
                  <th style={{ ...s.th, width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((g) => {
                  const isSelected = selectedGroups.includes(g.group);
                  const isExpanded = expandedCompareGroup === g.group;
                  const detail = comparedGroups.find((cg: any) => cg.group === g.group);

                  return (
                    <React.Fragment key={g.group}>
                      <tr
                        style={{ ...s.tr, background: isSelected ? '#f0fdf4' : isExpanded ? '#f8fafc' : undefined, cursor: 'pointer' }}
                        onClick={(e) => {
                          // Don't toggle expand if clicking the checkbox
                          if ((e.target as HTMLElement).tagName === 'INPUT') return;
                          if (isExpanded) {
                            setExpandedCompareGroup(null);
                          } else {
                            setExpandedCompareGroup(g.group);
                            if (!detail) fetchCompareGroups([g.group]);
                          }
                        }}
                      >
                        {/* Checkbox */}
                        <td style={{ ...s.td, textAlign: 'center', padding: '6px 4px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (isSelected) {
                                removeGroupFromCompare(g.group);
                              } else {
                                addGroupToCompare(g.group);
                              }
                            }}
                            style={{ cursor: 'pointer', accentColor: BRAND.primary }}
                          />
                        </td>
                        {/* Group name */}
                        <td style={{ ...s.td, fontWeight: 600, color: '#1e293b' }}>
                          {g.group}
                        </td>
                        {/* Location count */}
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          {formatNumber(g.locationCount)}
                        </td>
                        {/* Total revenue */}
                        <td style={{ ...s.td, textAlign: 'right', fontWeight: 600, color: BRAND.primary }}>
                          {formatCurrencyCompact(g.totalRevenue)}
                        </td>
                        {/* Avg per location */}
                        <td style={{ ...s.td, textAlign: 'right', color: '#64748b' }}>
                          {formatCurrencyCompact(g.avgRevenuePerLocation)}
                        </td>
                        {/* Expand arrow */}
                        <td style={{ ...s.td, textAlign: 'center', padding: '6px 4px' }}>
                          <span style={{ fontSize: '12px', color: '#64748b', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                            {'\u25B6'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded row detail: segments + locations */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0, background: '#f8fafc' }}>
                            <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>
                              {compareLoading && !detail && (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: '13px' }}>Loading details...</div>
                              )}

                              {detail && (
                                <>
                                  {/* Segments */}
                                  {detail.segments && detail.segments.length > 0 && (
                                    <div style={{ marginBottom: '14px' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Segments</div>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {detail.segments.map((seg: any) => (
                                          <span
                                            key={seg.segment}
                                            onClick={() => setSegmentFilter(segmentFilter === seg.segment ? null : (seg.segment === 'Unknown' ? null : seg.segment))}
                                            style={{
                                              padding: '4px 12px',
                                              borderRadius: '14px',
                                              fontSize: '12px',
                                              fontWeight: 600,
                                              background: segmentFilter === seg.segment ? BRAND.primary : '#e2e8f0',
                                              color: segmentFilter === seg.segment ? 'white' : '#475569',
                                              cursor: seg.segment === 'Unknown' ? 'default' : 'pointer',
                                              border: '1px solid transparent',
                                            }}
                                          >
                                            {seg.segment} ({seg.locationCount}) &mdash; {formatCurrencyCompact(seg.revenue)}
                                          </span>
                                        ))}
                                        {segmentFilter && (
                                          <button
                                            onClick={() => setSegmentFilter(null)}
                                            style={{ padding: '4px 10px', borderRadius: '14px', fontSize: '11px', fontWeight: 500, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', cursor: 'pointer' }}
                                          >
                                            Clear filter
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Locations dropdown sorted by name */}
                                  {(() => {
                                    const locs = getFilteredLocations(detail)
                                      .slice()
                                      .sort((a: any, b: any) => (a.name || a.permit).localeCompare(b.name || b.permit));
                                    return locs.length > 0 ? (
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                          Locations{segmentFilter ? ` — ${segmentFilter}` : ''} ({locs.length})
                                        </div>
                                        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', background: 'white' }}>
                                          {locs.map((loc: any, li: number) => (
                                            <Link
                                              key={loc.permit}
                                              href={`/customers/${loc.permit}`}
                                              style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '8px 14px',
                                                borderBottom: li < locs.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                textDecoration: 'none',
                                                color: '#1e293b',
                                                fontSize: '13px',
                                              }}
                                            >
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                  {loc.name || loc.permit}
                                                </span>
                                                <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{loc.city}</span>
                                                {!segmentFilter && loc.segment && loc.segment !== 'Unknown' && (
                                                  <span style={{ fontSize: '10px', color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>{loc.segment}</span>
                                                )}
                                              </div>
                                              <span style={{ fontSize: '12px', fontWeight: 600, color: BRAND.primary, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                                                {formatCurrencyCompact(loc.revenue)}
                                              </span>
                                            </Link>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null;
                                  })()}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredGroups.length === 0 && searchLower && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: '14px' }}>
              No ownership groups match &ldquo;{ownershipSearch}&rdquo;
            </div>
          )}
        </div>

        {/* Comparison Section — shown when 2+ groups are selected and compared */}
        {!compareLoading && comparedGroups.length >= 2 && isCompareMode && (
          <div style={s.chartSection}>
            <h3 style={s.chartTitle}>
              Revenue Comparison{segmentFilter ? ` — ${segmentFilter}` : ''}
            </h3>

            {/* Segment Filter Pills for comparison */}
            {allCompareSegments.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>Segment:</span>
                <button
                  onClick={() => setSegmentFilter(null)}
                  style={{ ...s.periodPill, ...(segmentFilter === null ? s.periodPillActive : {}) }}
                >
                  All
                </button>
                {allCompareSegments.map((seg) => (
                  <button
                    key={seg}
                    onClick={() => setSegmentFilter(seg === segmentFilter ? null : seg)}
                    style={{ ...s.periodPill, ...(segmentFilter === seg ? s.periodPillActive : {}) }}
                  >
                    {seg}
                  </button>
                ))}
              </div>
            )}

            <div style={{ width: '100%', height: isMobile ? 200 : 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compareBarData} margin={{ top: 5, right: 10, left: isMobile ? 0 : 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="group" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={currencyTickFormatter} width={isMobile ? 48 : 60} />
                  <Tooltip formatter={(value: number) => formatCurrencyFull(value)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                    {compareBarData.map((entry, i) => (
                      <Cell key={entry.group} fill={YEAR_COLORS[i % YEAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // Render: OCR Search Tab
  // ============================================

  const renderOcrSearch = () => {
    const hasQuery = ocrDebouncedQuery.trim().length > 0;
    const hasMore = ocrResults.length < ocrTotal;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Search Bar */}
        <div style={s.ocrSearchBar}>
          <div style={s.ocrSearchInputWrap}>
            <span style={s.ocrSearchIcon}>{'\u{1F50D}'}</span>
            <input
              type="text"
              placeholder="Search OCR text across all photos..."
              value={ocrQuery}
              onChange={(e) => setOcrQuery(e.target.value)}
              style={s.ocrSearchInput}
            />
            {ocrQuery && (
              <button
                onClick={() => setOcrQuery('')}
                style={s.ocrClearButton}
                aria-label="Clear search"
              >
                {'\u2715'}
              </button>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        {ocrStats && (
          <div style={s.ocrStatsBar}>
            <span style={s.ocrStatItem}>
              {'\u{1F4F7}'} {formatNumber(ocrStats.totalPhotos)} total photos
            </span>
            <span style={s.ocrStatDivider}>{'\u00B7'}</span>
            <span style={s.ocrStatItem}>
              {'\u{1F4DD}'} {formatNumber(ocrStats.photosWithOcr)} with OCR text
            </span>
            {hasQuery && (
              <>
                <span style={s.ocrStatDivider}>{'\u00B7'}</span>
                <span style={s.ocrStatItem}>
                  {'\u{1F50E}'} {formatNumber(ocrTotal)} matches
                </span>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {ocrError && (
          <div style={s.errorContainer}>
            <p style={s.errorText}>Error: {ocrError}</p>
            <button onClick={() => fetchOcrResults(ocrDebouncedQuery, 0, false)} style={s.retryButton}>
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {ocrLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} height={180} />
            ))}
          </div>
        )}

        {/* Empty state: no query */}
        {!hasQuery && !ocrLoading && !ocrError && (
          <div style={s.ocrEmptyState}>
            <div style={s.ocrEmptyIcon}>{'\u{1F50D}'}</div>
            <p style={s.ocrEmptyTitle}>Search Photo OCR Text</p>
            <p style={s.ocrEmptySubtext}>
              Enter a search term above to find photos by their OCR-extracted text content.
              Search for product names, prices, menu items, and more.
            </p>
          </div>
        )}

        {/* Empty state: no results */}
        {hasQuery && !ocrLoading && !ocrError && ocrResults.length === 0 && (
          <div style={s.ocrEmptyState}>
            <div style={s.ocrEmptyIcon}>{'\u{1F4ED}'}</div>
            <p style={s.ocrEmptyTitle}>No Results Found</p>
            <p style={s.ocrEmptySubtext}>
              No photos matched &ldquo;{ocrDebouncedQuery}&rdquo;. Try a different search term or shorter keyword.
            </p>
          </div>
        )}

        {/* Results Grid */}
        {!ocrLoading && ocrResults.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            {ocrResults.map((result) => (
              <div key={result.id} style={s.ocrResultCard}>
                {/* Photo Thumbnail */}
                <div style={s.ocrPhotoWrap}>
                  <img
                    src={result.photo_url}
                    alt={result.photo_type || 'Photo'}
                    style={s.ocrPhotoImg}
                    loading="lazy"
                  />
                  {/* Photo type badge */}
                  {result.photo_type && (
                    <span style={s.ocrPhotoBadge}>
                      {PHOTO_TYPE_LABELS[result.photo_type] || result.photo_type}
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div style={s.ocrCardBody}>
                  {/* OCR Text Snippet */}
                  {result.ocr_text && (
                    <div style={s.ocrSnippet}>
                      {highlightText(
                        result.ocr_text.length > 150
                          ? result.ocr_text.slice(0, 150) + '...'
                          : result.ocr_text,
                        ocrDebouncedQuery
                      )}
                    </div>
                  )}

                  {/* Meta row */}
                  <div style={s.ocrMetaRow}>
                    <Link
                      href={`/customers/${result.activity.tabc_permit_number}`}
                      style={s.ocrPermitLink}
                    >
                      {result.activity.tabc_permit_number}
                    </Link>
                    <span style={s.ocrMetaDivider}>{'\u00B7'}</span>
                    <span style={s.ocrMetaText}>{formatDate(result.activity.activity_date)}</span>
                  </div>

                  {/* Tags row */}
                  <div style={s.ocrTagsRow}>
                    <span style={s.ocrActivityBadge}>
                      {ACTIVITY_ICONS[result.activity.activity_type] || ''}{' '}
                      {result.activity.activity_type}
                    </span>
                    {result.activity.contact_name && (
                      <span style={s.ocrContactBadge}>
                        {result.activity.contact_name}
                      </span>
                    )}
                    {result.file_size_bytes != null && (
                      <span style={s.ocrSizeBadge}>
                        {(result.file_size_bytes / 1024).toFixed(0)} KB
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && !ocrLoading && ocrResults.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
            <button
              onClick={handleLoadMore}
              disabled={ocrLoadingMore}
              style={{
                ...s.loadMoreButton,
                opacity: ocrLoadingMore ? 0.6 : 1,
              }}
            >
              {ocrLoadingMore
                ? 'Loading...'
                : `Load more (${ocrTotal - ocrResults.length} remaining)`}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // Main Render
  // ============================================

  return (
    <div style={s.container}>
      {renderTabs()}
      <div style={s.tabContent}>
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'ownership' && renderOwnership()}
        {activeTab === 'ocr' && renderOcrSearch()}
      </div>
    </div>
  );
}

// ============================================
// Styles
// ============================================

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },

  // Tab bar
  tabBar: {
    display: 'flex',
    gap: '0',
    borderBottom: '2px solid #e2e8f0',
    marginBottom: '24px',
    overflowX: 'auto',
  },
  tabButton: {
    padding: '12px 20px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: '#64748b',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabButtonActive: {
    color: '#0d7377',
    borderBottomColor: '#0d7377',
  },
  tabContent: {
    minHeight: '400px',
  },

  // Period pills
  periodRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  periodPill: {
    padding: '6px 16px',
    borderRadius: '20px',
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#475569',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  periodPillActive: {
    background: '#0d7377',
    borderColor: '#0d7377',
    color: 'white',
  },

  // Category filter row
  categoryFilterRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  // Segment Top N controls
  segmentNButton: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#475569',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
    transition: 'all 0.15s',
  },
  segmentOtherToggle: {
    padding: '4px 10px',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#64748b',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  segmentOtherToggleActive: {
    background: '#0d7377',
    borderColor: '#0d7377',
    color: 'white',
  },

  // KPI cards
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  kpiCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  kpiIcon: {
    fontSize: '28px',
    flexShrink: 0,
  },
  kpiContent: {
    flex: 1,
    minWidth: 0,
  },
  kpiValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1e293b',
    lineHeight: 1.2,
  },
  kpiLabel: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '2px',
  },

  // Chart sections
  chartSection: {
    background: 'white',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  chartTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
    marginTop: 0,
    marginBottom: '16px',
  },

  // Layout helpers
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  singleCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },

  // Tables
  tableWrap: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontWeight: 600,
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background 0.1s',
  },
  td: {
    padding: '10px 12px',
    color: '#334155',
    fontSize: '13px',
  },
  tableLink: {
    color: '#0d7377',
    textDecoration: 'none',
    fontWeight: 500,
  },

  // Expanded group info
  expandedGroupInfo: {
    marginTop: '10px',
    padding: '12px',
    background: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  expandedGroupLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '4px',
  },
  expandedGroupRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#334155',
  },
  expandedGroupKey: {
    color: '#94a3b8',
    fontWeight: 500,
    minWidth: '110px',
  },
  miniBarTrack: {
    flex: 1,
    height: '6px',
    background: '#e6f5f5',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    background: '#0d7377',
    borderRadius: '3px',
    transition: 'width 0.3s',
  },

  // Empty states
  emptyMini: {
    textAlign: 'center',
    padding: '24px',
    color: '#94a3b8',
    fontSize: '14px',
  },

  // Error / Retry
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
    fontWeight: 600,
  },

  // Load more
  loadMoreButton: {
    padding: '12px 32px',
    background: 'white',
    color: '#0d7377',
    border: '2px solid #0d7377',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },

  // ---- OCR Search ----
  ocrSearchBar: {
    background: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  ocrSearchInputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    padding: '0 12px',
    transition: 'border-color 0.15s',
  },
  ocrSearchIcon: {
    fontSize: '18px',
    flexShrink: 0,
    color: '#94a3b8',
  },
  ocrSearchInput: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    padding: '12px 0',
    fontSize: '15px',
    outline: 'none',
    color: '#1e293b',
    minWidth: 0,
  },
  ocrClearButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#94a3b8',
    padding: '4px',
    lineHeight: 1,
    flexShrink: 0,
  },

  // OCR stats bar
  ocrStatsBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#64748b',
    padding: '0 4px',
  },
  ocrStatItem: {
    whiteSpace: 'nowrap',
  },
  ocrStatDivider: {
    color: '#cbd5e1',
    fontWeight: 700,
  },

  // OCR empty states
  ocrEmptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  ocrEmptyIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  ocrEmptyTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#334155',
    margin: '0 0 8px 0',
  },
  ocrEmptySubtext: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: 0,
    lineHeight: 1.5,
    maxWidth: '420px',
    marginLeft: 'auto',
    marginRight: 'auto',
  },

  // OCR result card
  ocrResultCard: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'box-shadow 0.15s',
  },
  ocrPhotoWrap: {
    position: 'relative',
    width: '100%',
    height: '160px',
    background: '#f1f5f9',
    overflow: 'hidden',
  },
  ocrPhotoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  ocrPhotoBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'rgba(0,0,0,0.6)',
    color: 'white',
    fontSize: '11px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '6px',
    textTransform: 'capitalize',
  },
  ocrCardBody: {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  ocrSnippet: {
    fontSize: '13px',
    color: '#475569',
    lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  ocrMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    flexWrap: 'wrap',
  },
  ocrPermitLink: {
    color: '#0d7377',
    textDecoration: 'none',
    fontWeight: 600,
  },
  ocrMetaDivider: {
    color: '#cbd5e1',
    fontWeight: 700,
  },
  ocrMetaText: {
    color: '#94a3b8',
  },
  ocrTagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  ocrActivityBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#e6f5f5',
    color: '#0d7377',
    fontWeight: 500,
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  },
  ocrContactBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#f1f5f9',
    color: '#64748b',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  ocrSizeBadge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    background: '#f1f5f9',
    color: '#94a3b8',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
};
