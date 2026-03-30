/**
 * Admin Content Suggestions API Route
 * Uses DuckDB to surface data-driven suggestions for each article type.
 * Admin role required.
 *
 * GET /api/admin/content/suggestions
 *
 * Returns shape matching the Suggestions interface in admin-content.tsx:
 *   market_review       – { top_growing_counties: [...], period: string }
 *   top_new_accounts    – { accounts: [...], period: string }
 *   venue_of_the_month  – { tabc_permit_number, name, city, county, total_revenue, growth_pct }
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

/** Format a YYYY-MM-DD date string to "Month YYYY" */
function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Market Review: Top counties by YoY growth
// Uses the latest COMPLETE month (>5000 records) vs same month prior year.
// Only counties with >$500k prior-year revenue to avoid noise.
// ---------------------------------------------------------------------------

async function getMarketReview() {
  // Find the latest complete month (one with substantial data)
  const monthRows = await query<{ month: string; cnt: string }>(`
    SELECT SUBSTR(CAST(DATE_TRUNC('month', obligation_end_date) AS VARCHAR), 1, 10) AS month,
           COUNT(*)::VARCHAR AS cnt
    FROM mixed_beverage_receipts
    GROUP BY month
    ORDER BY month DESC
    LIMIT 5
  `);

  // Pick the latest month with >5000 records (skip partial months)
  let currentStart = '';
  for (const m of monthRows) {
    if (parseInt(m.cnt) > 5000) {
      currentStart = m.month;
      break;
    }
  }

  if (!currentStart) {
    return { top_growing_counties: [], period: 'No data available' };
  }

  // Derive date boundaries
  const currentDate = new Date(currentStart + 'T00:00:00Z');
  const currentEndDate = new Date(currentDate);
  currentEndDate.setUTCMonth(currentEndDate.getUTCMonth() + 1);
  const currentEnd = currentEndDate.toISOString().substring(0, 10);

  const priorDate = new Date(currentDate);
  priorDate.setUTCFullYear(priorDate.getUTCFullYear() - 1);
  const priorStart = priorDate.toISOString().substring(0, 10);
  const priorEndDate = new Date(priorDate);
  priorEndDate.setUTCMonth(priorEndDate.getUTCMonth() + 1);
  const priorEnd = priorEndDate.toISOString().substring(0, 10);

  const rows = await query<{
    county_name: string;
    current_rev: number;
    prior_rev: number;
    growth_pct: number;
  }>(`
    WITH current_month AS (
      SELECT location_county_code AS cc,
             CAST(SUM(total_receipts) AS DOUBLE) AS rev
      FROM mixed_beverage_receipts
      WHERE obligation_end_date >= DATE '${currentStart}'
        AND obligation_end_date < DATE '${currentEnd}'
      GROUP BY cc
    ),
    prior_year AS (
      SELECT location_county_code AS cc,
             CAST(SUM(total_receipts) AS DOUBLE) AS rev
      FROM mixed_beverage_receipts
      WHERE obligation_end_date >= DATE '${priorStart}'
        AND obligation_end_date < DATE '${priorEnd}'
      GROUP BY cc
    )
    SELECT COALESCE(co.county_name, c.cc) AS county_name,
           c.rev  AS current_rev,
           p.rev  AS prior_rev,
           CAST(ROUND(((c.rev - p.rev) / p.rev) * 100, 2) AS DOUBLE) AS growth_pct
    FROM current_month c
    JOIN prior_year p ON c.cc = p.cc
    LEFT JOIN counties co ON c.cc = co.county_code
    WHERE p.rev > 500000
      AND c.rev > 0
    ORDER BY growth_pct DESC
    LIMIT 10
  `);

  const period = formatPeriod(currentStart);

  return {
    top_growing_counties: rows.map((r) => ({
      county: r.county_name,
      growth_pct: r.growth_pct,
      total_revenue: r.current_rev,
    })),
    period,
  };
}

// ---------------------------------------------------------------------------
// Top New Accounts: Permits first appearing in the latest 2 complete months
// that had NO prior records. Shows total revenue across all months present.
// Only accounts with >$10k revenue to filter out noise.
// ---------------------------------------------------------------------------

async function getTopNewAccounts() {
  // Find latest complete month
  const monthRows = await query<{ month: string; cnt: string }>(`
    SELECT SUBSTR(CAST(DATE_TRUNC('month', obligation_end_date) AS VARCHAR), 1, 10) AS month,
           COUNT(*)::VARCHAR AS cnt
    FROM mixed_beverage_receipts
    GROUP BY month
    ORDER BY month DESC
    LIMIT 5
  `);

  let latestComplete = '';
  for (const m of monthRows) {
    if (parseInt(m.cnt) > 5000) {
      latestComplete = m.month;
      break;
    }
  }

  if (!latestComplete) {
    return { accounts: [], period: 'No data available' };
  }

  // Cutoff = 3 months before the latest complete month (wider window catches more new entrants)
  const latestDate = new Date(latestComplete + 'T00:00:00Z');
  const cutoffDate = new Date(latestDate);
  cutoffDate.setUTCMonth(cutoffDate.getUTCMonth() - 2);
  const cutoff = cutoffDate.toISOString().substring(0, 10);

  const rows = await query<{
    tabc_permit_number: string;
    name: string;
    city: string;
    county: string;
    total_rev: number;
  }>(`
    WITH new_permits AS (
      SELECT DISTINCT tabc_permit_number
      FROM mixed_beverage_receipts
      WHERE obligation_end_date >= DATE '${cutoff}'
      EXCEPT
      SELECT DISTINCT tabc_permit_number
      FROM mixed_beverage_receipts
      WHERE obligation_end_date < DATE '${cutoff}'
    )
    SELECT r.tabc_permit_number,
           COALESCE(e.clean_dba_name, MAX(r.location_name)) AS name,
           MAX(r.location_city) AS city,
           COALESCE(
             (SELECT co.county_name FROM counties co WHERE co.county_code = MAX(r.location_county_code)),
             MAX(r.location_county)
           ) AS county,
           CAST(SUM(r.total_receipts) AS DOUBLE) AS total_rev
    FROM mixed_beverage_receipts r
    JOIN new_permits n ON r.tabc_permit_number = n.tabc_permit_number
    LEFT JOIN location_enrichments e ON r.tabc_permit_number = e.tabc_permit_number
    WHERE r.total_receipts > 0
    GROUP BY r.tabc_permit_number, e.clean_dba_name
    HAVING SUM(r.total_receipts) > 10000
    ORDER BY total_rev DESC
    LIMIT 15
  `);

  const period = formatPeriod(cutoff) + ' – ' + formatPeriod(latestComplete);

  return {
    accounts: rows.map((r) => ({
      tabc_permit_number: r.tabc_permit_number,
      name: r.name,
      city: r.city,
      county: r.county,
      first_month_revenue: r.total_rev,
    })),
    period,
  };
}

// ---------------------------------------------------------------------------
// Venue of the Month: High-revenue location with strong growth.
// Compares latest 3 complete months vs prior 3 months.
// Requires >$100k recent revenue and >$30k prior (filters out noise/seasonal).
// Prefers venues with $100k–$5M range (not stadiums) — caps at $5M to keep
// it relatable for distributor sales teams.
// ---------------------------------------------------------------------------

async function getVenueOfTheMonth() {
  // Find latest complete month
  const monthRows = await query<{ month: string; cnt: string }>(`
    SELECT SUBSTR(CAST(DATE_TRUNC('month', obligation_end_date) AS VARCHAR), 1, 10) AS month,
           COUNT(*)::VARCHAR AS cnt
    FROM mixed_beverage_receipts
    GROUP BY month
    ORDER BY month DESC
    LIMIT 5
  `);

  let latestComplete = '';
  for (const m of monthRows) {
    if (parseInt(m.cnt) > 5000) {
      latestComplete = m.month;
      break;
    }
  }

  if (!latestComplete) return null;

  const latestDate = new Date(latestComplete + 'T00:00:00Z');

  // Recent = latest 3 complete months
  const recentEndDate = new Date(latestDate);
  recentEndDate.setUTCMonth(recentEndDate.getUTCMonth() + 1);
  const recentEnd = recentEndDate.toISOString().substring(0, 10);

  const recentStartDate = new Date(latestDate);
  recentStartDate.setUTCMonth(recentStartDate.getUTCMonth() - 2);
  const recentStart = recentStartDate.toISOString().substring(0, 10);

  // Prior = 3 months before that
  const priorEnd = recentStart;
  const priorStartDate = new Date(recentStartDate);
  priorStartDate.setUTCMonth(priorStartDate.getUTCMonth() - 3);
  const priorStart = priorStartDate.toISOString().substring(0, 10);

  const rows = await query<{
    permit: string;
    name: string;
    city: string;
    county: string;
    recent_rev: number;
    prior_rev: number;
    growth_pct: number;
  }>(`
    WITH recent AS (
      SELECT r.tabc_permit_number AS permit,
             COALESCE(e.clean_dba_name, MAX(r.location_name)) AS name,
             MAX(r.location_city) AS city,
             COALESCE(
               (SELECT co.county_name FROM counties co WHERE co.county_code = MAX(r.location_county_code)),
               MAX(r.location_county)
             ) AS county,
             CAST(SUM(r.total_receipts) AS DOUBLE) AS rev
      FROM mixed_beverage_receipts r
      LEFT JOIN location_enrichments e ON r.tabc_permit_number = e.tabc_permit_number
      WHERE r.obligation_end_date >= DATE '${recentStart}'
        AND r.obligation_end_date < DATE '${recentEnd}'
      GROUP BY r.tabc_permit_number, e.clean_dba_name
    ),
    prior AS (
      SELECT r.tabc_permit_number AS permit,
             CAST(SUM(r.total_receipts) AS DOUBLE) AS rev
      FROM mixed_beverage_receipts r
      WHERE r.obligation_end_date >= DATE '${priorStart}'
        AND r.obligation_end_date < DATE '${priorEnd}'
      GROUP BY r.tabc_permit_number
    )
    SELECT recent.permit, recent.name, recent.city, recent.county,
           recent.rev AS recent_rev,
           prior.rev AS prior_rev,
           CAST(ROUND(((recent.rev - prior.rev) / prior.rev) * 100, 1) AS DOUBLE) AS growth_pct
    FROM recent
    JOIN prior ON recent.permit = prior.permit
    WHERE recent.rev BETWEEN 100000 AND 5000000
      AND prior.rev > 30000
      AND ((recent.rev - prior.rev) / prior.rev) > 0.30
    ORDER BY recent.rev DESC
    LIMIT 1
  `);

  if (!rows.length) return null;

  const r = rows[0];
  return {
    tabc_permit_number: r.permit,
    name: r.name,
    city: r.city,
    county: r.county,
    total_revenue: r.recent_rev,
    growth_pct: r.growth_pct,
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
      getMarketReview(),
      getTopNewAccounts(),
      getVenueOfTheMonth(),
    ]);

    const result: Record<string, any> = {};

    if (marketReview.status === 'fulfilled') {
      result.market_review = marketReview.value;
    } else {
      console.error('[Content Suggestions] market_review error:', marketReview.reason);
      result.market_review = { top_growing_counties: [], period: 'Data unavailable' };
    }

    if (topNewAccounts.status === 'fulfilled') {
      result.top_new_accounts = topNewAccounts.value;
    } else {
      console.error('[Content Suggestions] top_new_accounts error:', topNewAccounts.reason);
      result.top_new_accounts = { accounts: [], period: 'Data unavailable' };
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
