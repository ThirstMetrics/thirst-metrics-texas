/**
 * Admin Content Suggestions API Route
 * Uses DuckDB to surface data-driven suggestions for each article type.
 * Admin role required.
 *
 * GET /api/admin/content/suggestions
 *
 * Returns:
 *   market_review    – Top 5 counties by revenue growth (latest month vs same month prior year)
 *   top_new_accounts – Permits first appearing in the latest 2 months, ranked by revenue
 *   venue_of_the_month – Single location with highest 3-month growth vs prior 3 months
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { user: null, error: 'Unauthorized', status: 401 };
  }

  const serviceClient = createServiceClient();
  const { data: userRecord, error: roleError } = await serviceClient
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (roleError || !userRecord) {
    return { user: null, error: 'User record not found', status: 403 };
  }

  if (userRecord.role !== 'admin') {
    return { user: null, error: 'Forbidden: admin role required', status: 403 };
  }

  return { user, error: null, status: 200 };
}

// ---------------------------------------------------------------------------
// DuckDB queries
// ---------------------------------------------------------------------------

interface CountyGrowthRow {
  county_code: string;
  county_name: string;
  current_revenue: number;
  prior_year_revenue: number;
  growth_pct: number;
}

/**
 * Top 5 counties by YoY revenue growth for the most recent complete month.
 */
async function getMarketReviewSuggestions(): Promise<{
  top_counties: CountyGrowthRow[];
  summary: string;
}> {
  // Find the latest month in the dataset
  const latestRows = await query<{ latest_month: string }>(
    `SELECT CAST(DATE_TRUNC('month', MAX(obligation_end_date)) AS VARCHAR) AS latest_month
     FROM mixed_beverage_receipts`
  );
  const latestMonth = latestRows[0]?.latest_month;
  if (!latestMonth) {
    return { top_counties: [], summary: 'No receipt data available.' };
  }

  // latest_month is YYYY-MM-DD (start of month from DATE_TRUNC). Derive prior-year equivalent.
  // e.g., "2026-02-01" → current period = Feb 2026, prior = Feb 2025
  const currentStart = latestMonth.substring(0, 10);
  const priorYearDate = new Date(currentStart);
  priorYearDate.setFullYear(priorYearDate.getFullYear() - 1);
  const priorStart = priorYearDate.toISOString().substring(0, 10);

  // Next month boundaries for WHERE clauses
  const currentDate = new Date(currentStart);
  currentDate.setMonth(currentDate.getMonth() + 1);
  const currentEnd = currentDate.toISOString().substring(0, 10);

  const priorDate = new Date(priorStart);
  priorDate.setMonth(priorDate.getMonth() + 1);
  const priorEnd = priorDate.toISOString().substring(0, 10);

  const rows = await query<{
    county_code: string;
    current_revenue: number;
    prior_year_revenue: number;
    growth_pct: number;
  }>(
    `WITH current_month AS (
       SELECT
         location_county_code AS county_code,
         CAST(SUM(total_receipts) AS DOUBLE) AS revenue
       FROM mixed_beverage_receipts
       WHERE obligation_end_date >= DATE '${currentStart}'
         AND obligation_end_date <  DATE '${currentEnd}'
       GROUP BY location_county_code
     ),
     prior_year AS (
       SELECT
         location_county_code AS county_code,
         CAST(SUM(total_receipts) AS DOUBLE) AS revenue
       FROM mixed_beverage_receipts
       WHERE obligation_end_date >= DATE '${priorStart}'
         AND obligation_end_date <  DATE '${priorEnd}'
       GROUP BY location_county_code
     )
     SELECT
       c.county_code,
       CAST(c.revenue AS DOUBLE)    AS current_revenue,
       CAST(COALESCE(p.revenue, 0) AS DOUBLE) AS prior_year_revenue,
       CASE
         WHEN COALESCE(p.revenue, 0) = 0 THEN NULL
         ELSE CAST(ROUND(((c.revenue - p.revenue) / p.revenue) * 100, 2) AS DOUBLE)
       END AS growth_pct
     FROM current_month c
     LEFT JOIN prior_year p ON p.county_code = c.county_code
     WHERE c.revenue > 0
       AND COALESCE(p.revenue, 0) > 0
     ORDER BY growth_pct DESC NULLS LAST
     LIMIT 5`
  );

  // Join county names from the counties reference table
  const countyRows = await query<{ county_code: string; county_name: string }>(
    `SELECT county_code, county_name FROM counties`
  );
  const countyMap = new Map(countyRows.map((r) => [r.county_code, r.county_name]));

  const top_counties: CountyGrowthRow[] = rows.map((r) => ({
    county_code: r.county_code,
    county_name: countyMap.get(r.county_code) ?? r.county_code,
    current_revenue: r.current_revenue,
    prior_year_revenue: r.prior_year_revenue,
    growth_pct: r.growth_pct,
  }));

  const displayMonth = new Date(currentStart).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const summary =
    top_counties.length > 0
      ? `For ${displayMonth}, ${top_counties[0].county_name} County led with ` +
        `${top_counties[0].growth_pct?.toFixed(1)}% YoY growth ` +
        `($${top_counties[0].current_revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} in receipts).`
      : `No county growth data available for ${displayMonth}.`;

  return { top_counties, summary };
}

interface NewAccountRow {
  tabc_permit_number: string;
  location_name: string;
  location_city: string;
  location_county: string;
  total_receipts: number;
  first_seen_month: string;
}

/**
 * New accounts: permits appearing in the latest 2 months that had NO prior records.
 * Ranked by total revenue in those 2 months, limit 10.
 */
async function getTopNewAccounts(): Promise<NewAccountRow[]> {
  const rows = await query<{
    tabc_permit_number: string;
    location_name: string;
    location_city: string;
    location_county: string;
    total_receipts: number;
    first_seen_month: string;
  }>(
    `WITH latest_cutoff AS (
       SELECT DATE_TRUNC('month', MAX(obligation_end_date)) - INTERVAL '2 months' AS cutoff
       FROM mixed_beverage_receipts
     ),
     recent_permits AS (
       SELECT DISTINCT tabc_permit_number
       FROM mixed_beverage_receipts, latest_cutoff
       WHERE obligation_end_date >= latest_cutoff.cutoff
     ),
     old_permits AS (
       SELECT DISTINCT tabc_permit_number
       FROM mixed_beverage_receipts, latest_cutoff
       WHERE obligation_end_date < latest_cutoff.cutoff
     ),
     new_only AS (
       SELECT tabc_permit_number
       FROM recent_permits
       WHERE tabc_permit_number NOT IN (SELECT tabc_permit_number FROM old_permits)
     ),
     aggregated AS (
       SELECT
         r.tabc_permit_number,
         MAX(r.location_name)    AS location_name,
         MAX(r.location_city)    AS location_city,
         MAX(r.location_county)  AS location_county,
         CAST(SUM(r.total_receipts) AS DOUBLE) AS total_receipts,
         CAST(MIN(DATE_TRUNC('month', r.obligation_end_date)) AS VARCHAR) AS first_seen_month
       FROM mixed_beverage_receipts r
       INNER JOIN new_only n ON n.tabc_permit_number = r.tabc_permit_number
       GROUP BY r.tabc_permit_number
     )
     SELECT *
     FROM aggregated
     WHERE total_receipts > 0
     ORDER BY total_receipts DESC
     LIMIT 10`
  );

  return rows.map((r) => ({
    tabc_permit_number: r.tabc_permit_number,
    location_name: r.location_name,
    location_city: r.location_city,
    location_county: r.location_county,
    total_receipts: r.total_receipts,
    first_seen_month: r.first_seen_month,
  }));
}

interface VenueOfMonthRow {
  permit: string;
  name: string;
  growth_pct: number;
  revenue: number;
  city: string;
  county: string;
}

/**
 * Venue of the month: single location with highest growth rate
 * (latest 3 months revenue vs prior 3 months revenue).
 * Joins with location_enrichments for the clean name.
 */
async function getVenueOfTheMonth(): Promise<VenueOfMonthRow | null> {
  const rows = await query<{
    permit: string;
    clean_name: string | null;
    raw_name: string;
    city: string;
    county: string;
    recent_revenue: number;
    prior_revenue: number;
    growth_pct: number;
  }>(
    `WITH latest_cutoff AS (
       SELECT
         DATE_TRUNC('month', MAX(obligation_end_date))                     AS recent_end,
         DATE_TRUNC('month', MAX(obligation_end_date)) - INTERVAL '3 months' AS recent_start,
         DATE_TRUNC('month', MAX(obligation_end_date)) - INTERVAL '3 months' AS prior_end,
         DATE_TRUNC('month', MAX(obligation_end_date)) - INTERVAL '6 months' AS prior_start
       FROM mixed_beverage_receipts
     ),
     recent AS (
       SELECT
         r.tabc_permit_number,
         CAST(SUM(r.total_receipts) AS DOUBLE) AS revenue,
         MAX(r.location_name)   AS location_name,
         MAX(r.location_city)   AS location_city,
         MAX(r.location_county) AS location_county
       FROM mixed_beverage_receipts r, latest_cutoff c
       WHERE r.obligation_end_date >= c.recent_start
         AND r.obligation_end_date <  c.recent_end
       GROUP BY r.tabc_permit_number
     ),
     prior AS (
       SELECT
         r.tabc_permit_number,
         CAST(SUM(r.total_receipts) AS DOUBLE) AS revenue
       FROM mixed_beverage_receipts r, latest_cutoff c
       WHERE r.obligation_end_date >= c.prior_start
         AND r.obligation_end_date <  c.prior_end
       GROUP BY r.tabc_permit_number
     )
     SELECT
       rec.tabc_permit_number                                 AS permit,
       le.clean_dba_name                                      AS clean_name,
       rec.location_name                                      AS raw_name,
       rec.location_city                                      AS city,
       rec.location_county                                    AS county,
       CAST(rec.revenue AS DOUBLE)                            AS recent_revenue,
       CAST(COALESCE(pri.revenue, 0) AS DOUBLE)               AS prior_revenue,
       CAST(ROUND(
         ((rec.revenue - COALESCE(pri.revenue, 0)) / NULLIF(COALESCE(pri.revenue, 0), 0)) * 100,
         2
       ) AS DOUBLE)                                           AS growth_pct
     FROM recent rec
     LEFT JOIN prior pri ON pri.tabc_permit_number = rec.tabc_permit_number
     LEFT JOIN location_enrichments le ON le.tabc_permit_number = rec.tabc_permit_number
     WHERE rec.revenue > 0
       AND COALESCE(pri.revenue, 0) > 0
     ORDER BY growth_pct DESC NULLS LAST
     LIMIT 1`
  );

  if (!rows.length) return null;

  const r = rows[0];
  return {
    permit: r.permit,
    name: r.clean_name ?? r.raw_name,
    growth_pct: r.growth_pct,
    revenue: r.recent_revenue,
    city: r.city,
    county: r.county,
  };
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Run all three suggestion queries in parallel
    const [marketReview, topNewAccounts, venueOfMonth] = await Promise.allSettled([
      getMarketReviewSuggestions(),
      getTopNewAccounts(),
      getVenueOfTheMonth(),
    ]);

    const result: Record<string, any> = {};

    if (marketReview.status === 'fulfilled') {
      result.market_review = marketReview.value;
    } else {
      console.error('[Content Suggestions] market_review error:', marketReview.reason);
      result.market_review = { top_counties: [], summary: 'Data unavailable.', error: true };
    }

    if (topNewAccounts.status === 'fulfilled') {
      result.top_new_accounts = topNewAccounts.value;
    } else {
      console.error('[Content Suggestions] top_new_accounts error:', topNewAccounts.reason);
      result.top_new_accounts = [];
    }

    if (venueOfMonth.status === 'fulfilled') {
      result.venue_of_the_month = venueOfMonth.value;
    } else {
      console.error('[Content Suggestions] venue_of_the_month error:', venueOfMonth.reason);
      result.venue_of_the_month = null;
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[Content Suggestions API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch content suggestions' },
      { status: 500 }
    );
  }
}
