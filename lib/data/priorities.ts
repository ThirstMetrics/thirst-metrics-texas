/**
 * Priority Scoring Data Access Layer
 * Queries customer_priorities from Supabase with mode-based composite weighting
 */

import { createServiceClient } from '../supabase/server';
import { query } from '../duckdb/connection';

// Scoring mode weights
export const SCORING_MODES = {
  revenue: { revenue: 0.70, growth: 0.15, recency: 0.15, label: 'Revenue-Dominant' },
  balanced: { revenue: 0.35, growth: 0.40, recency: 0.25, label: 'Opportunity-Balanced' },
  coverage: { revenue: 0.20, growth: 0.20, recency: 0.60, label: 'Coverage-Focused' },
} as const;

export type ScoringMode = keyof typeof SCORING_MODES;

export interface PriorityCustomer {
  tabc_permit_number: string;
  location_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_county: string | null;
  priority_score: number;
  revenue_score: number;
  growth_score: number;
  recency_score: number;
  tier: 'top25' | 'top50' | 'top60' | 'top80' | 'bottom20';
  total_revenue: number;
  growth_rate: number;
  last_activity_date: string | null;
  activity_count: number;
  is_stale: boolean;
}

export interface PriorityResult {
  customers: PriorityCustomer[];
  totalCount: number;
  mode: ScoringMode;
  stale_days: number;
}

/**
 * Map composite score to tier
 */
export function scoreToTier(score: number): PriorityCustomer['tier'] {
  if (score >= 80) return 'top25';
  if (score >= 60) return 'top50';
  if (score >= 45) return 'top60';
  if (score >= 25) return 'top80';
  return 'bottom20';
}

/**
 * Compute weighted composite score from component scores
 */
export function computeComposite(
  revenueScore: number,
  growthScore: number,
  recencyScore: number,
  mode: ScoringMode
): number {
  const weights = SCORING_MODES[mode];
  return revenueScore * weights.revenue + growthScore * weights.growth + recencyScore * weights.recency;
}

/**
 * Get priority-scored customer list
 */
export async function getPriorityCustomers(filters?: {
  mode?: ScoringMode;
  stale_days?: number;
  page?: number;
  limit?: number;
  search?: string;
  county?: string;
  metroplex?: string;
}): Promise<PriorityResult> {
  const mode = filters?.mode || 'balanced';
  const staleDays = filters?.stale_days ?? 30;
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;
  const weights = SCORING_MODES[mode];

  const supabase = createServiceClient();

  // Build query for customer_priorities joined with location data from DuckDB
  // Step 1: Get scored permits from Supabase with pagination
  let supabaseQuery = supabase
    .from('customer_priorities')
    .select('*', { count: 'exact' });

  // We can't do text search on Supabase alone (location names are in DuckDB),
  // so we fetch all priorities and join with DuckDB data
  const { data: priorities, error: prioritiesError, count } = await supabaseQuery;

  if (prioritiesError) {
    throw new Error(`Failed to fetch priorities: ${prioritiesError.message}`);
  }

  if (!priorities || priorities.length === 0) {
    return { customers: [], totalCount: 0, mode, stale_days: staleDays };
  }

  // Step 2: Compute composite scores and sort in memory
  const scored = priorities.map(p => {
    const revenueScore = Number(p.revenue_score) || 0;
    const growthScore = Number(p.growth_score) || 0;
    const recencyScore = Number(p.recency_score) || 0;
    const composite = computeComposite(revenueScore, growthScore, recencyScore, mode);

    const lastActivity = p.last_activity_date ? new Date(p.last_activity_date) : null;
    const daysSinceActivity = lastActivity
      ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;

    return {
      tabc_permit_number: p.tabc_permit_number,
      priority_score: Math.round(composite * 100) / 100,
      revenue_score: revenueScore,
      growth_score: growthScore,
      recency_score: recencyScore,
      tier: scoreToTier(composite),
      total_revenue: Number(p.total_revenue) || 0,
      growth_rate: Number(p.growth_rate) || 0,
      last_activity_date: p.last_activity_date || null,
      activity_count: Number(p.activity_count) || 0,
      is_stale: daysSinceActivity > staleDays,
    };
  });

  // Sort by composite score descending
  scored.sort((a, b) => b.priority_score - a.priority_score);

  // Step 3: Get permit numbers for this page (after search/filter)
  // First, get location data from DuckDB for all scored permits
  const permitList = scored.map(s => s.tabc_permit_number);

  // Build DuckDB query for location info
  let locationSql = `
    SELECT
      m.tabc_permit_number,
      COALESCE(e.clean_dba_name, MAX(m.location_name)) as location_name,
      MAX(m.location_address) as location_address,
      MAX(m.location_city) as location_city,
      COALESCE(MAX(c.county_name), MAX(m.location_county)) as location_county,
      MAX(m.location_county_code) as location_county_code,
      MAX(m.location_zip) as location_zip
    FROM mixed_beverage_receipts m
    LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
    LEFT JOIN counties c ON m.location_county_code = c.county_code
    WHERE m.tabc_permit_number IN (${permitList.map(() => '?').join(',')})
    GROUP BY m.tabc_permit_number, e.clean_dba_name
  `;

  const locationData = await query<{
    tabc_permit_number: string;
    location_name: string | null;
    location_address: string | null;
    location_city: string | null;
    location_county: string | null;
    location_county_code: string | null;
    location_zip: string | null;
  }>(locationSql, permitList);

  // Build location lookup
  const locationMap = new Map(locationData.map(l => [l.tabc_permit_number, l]));

  // Step 4: Merge and filter
  let merged: PriorityCustomer[] = scored.map(s => {
    const loc = locationMap.get(s.tabc_permit_number);
    return {
      ...s,
      location_name: loc?.location_name || null,
      location_address: loc?.location_address || null,
      location_city: loc?.location_city || null,
      location_county: loc?.location_county || null,
    };
  });

  // Apply search filter
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    const searchUpper = filters.search.toUpperCase();
    merged = merged.filter(c =>
      c.tabc_permit_number.toUpperCase().includes(searchUpper) ||
      (c.location_name && c.location_name.toLowerCase().includes(searchLower)) ||
      (c.location_address && c.location_address.toLowerCase().includes(searchLower))
    );
  }

  // Apply county filter
  if (filters?.county) {
    const countyPermits = new Set(
      locationData
        .filter(l => l.location_county_code === filters.county)
        .map(l => l.tabc_permit_number)
    );
    merged = merged.filter(c => countyPermits.has(c.tabc_permit_number));
  }

  // Apply metroplex filter
  if (filters?.metroplex) {
    const metroplexZips = await query<{ zip: string }>(
      'SELECT zip FROM metroplexes WHERE metroplex = ?',
      [filters.metroplex]
    );
    const zipSet = new Set(metroplexZips.map(z => z.zip));
    const metroplexPermits = new Set(
      locationData
        .filter(l => l.location_zip && zipSet.has(l.location_zip.substring(0, 5)))
        .map(l => l.tabc_permit_number)
    );
    merged = merged.filter(c => metroplexPermits.has(c.tabc_permit_number));
  }

  const totalCount = merged.length;

  // Paginate
  const paginated = merged.slice(offset, offset + limit);

  return {
    customers: paginated,
    totalCount,
    mode,
    stale_days: staleDays,
  };
}

/**
 * Get priority scores for a single customer (for detail page)
 */
export async function getCustomerPriority(permitNumber: string): Promise<{
  revenue_score: number;
  growth_score: number;
  recency_score: number;
  priority_score: number;
  tier: PriorityCustomer['tier'];
  total_revenue: number;
  growth_rate: number;
  last_activity_date: string | null;
  activity_count: number;
} | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('customer_priorities')
    .select('*')
    .eq('tabc_permit_number', permitNumber)
    .single();

  if (error || !data) return null;

  const revenueScore = Number(data.revenue_score) || 0;
  const growthScore = Number(data.growth_score) || 0;
  const recencyScore = Number(data.recency_score) || 0;
  const composite = computeComposite(revenueScore, growthScore, recencyScore, 'balanced');

  return {
    revenue_score: revenueScore,
    growth_score: growthScore,
    recency_score: recencyScore,
    priority_score: Math.round(composite * 100) / 100,
    tier: scoreToTier(composite),
    total_revenue: Number(data.total_revenue) || 0,
    growth_rate: Number(data.growth_rate) || 0,
    last_activity_date: data.last_activity_date || null,
    activity_count: Number(data.activity_count) || 0,
  };
}
