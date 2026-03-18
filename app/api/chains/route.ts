/**
 * Chain Analytics API Route
 * GET: Returns ownership groups with aggregated revenue stats, growth, and top locations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

export interface ChainSummary {
  ownership_group: string;
  location_count: number;
  total_revenue: number;
  avg_revenue_per_location: number;
  growth_pct: number;
  recent_3mo_revenue: number;
  prior_3mo_revenue: number;
  industry_segments: string[];
  top_locations: {
    tabc_permit_number: string;
    location_name: string | null;
    location_city: string | null;
    total_revenue: number;
  }[];
}

export interface ChainsResponse {
  chains: ChainSummary[];
  total_chains: number;
  total_chain_locations: number;
  total_revenue: number;
  chain_revenue_pct: number;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') || 'revenue';
    const segmentFilter = searchParams.get('segment') || '';
    const searchFilter = searchParams.get('search') || '';

    // Sanitize inputs to prevent SQL injection
    const safeSegment = segmentFilter.replace(/'/g, "''");
    const safeSearch = searchFilter.replace(/'/g, "''");

    // Validate sort param
    const validSorts = ['revenue', 'locations', 'growth'];
    const safeSortParam = validSorts.includes(sort) ? sort : 'revenue';

    const sortClause =
      safeSortParam === 'revenue' ? 'ORDER BY total_revenue DESC' :
      safeSortParam === 'locations' ? 'ORDER BY location_count DESC' :
      'ORDER BY growth_pct DESC';

    const segmentWhere = safeSegment
      ? `AND e.industry_segment = '${safeSegment}'`
      : '';

    const searchWhere = safeSearch
      ? `AND LOWER(e.ownership_group) LIKE LOWER('%${safeSearch}%')`
      : '';

    // Main chain aggregation query
    // Uses last 6 months of data: split into two 3-month windows for growth calc
    const chainSql = `
      WITH recent_months AS (
        SELECT
          m.tabc_permit_number,
          m.total_receipts,
          m.obligation_end_date,
          e.ownership_group,
          e.industry_segment
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e
          ON m.tabc_permit_number = e.tabc_permit_number
        WHERE e.ownership_group IS NOT NULL
          AND e.ownership_group != ''
          AND m.obligation_end_date >= (CURRENT_DATE - INTERVAL '6 months')
          ${segmentWhere}
          ${searchWhere}
      ),
      recent_3mo AS (
        SELECT
          ownership_group,
          SUM(total_receipts) AS recent_revenue
        FROM recent_months
        WHERE obligation_end_date >= (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY ownership_group
      ),
      prior_3mo AS (
        SELECT
          ownership_group,
          SUM(total_receipts) AS prior_revenue
        FROM recent_months
        WHERE obligation_end_date < (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY ownership_group
      ),
      all_time AS (
        SELECT
          e.ownership_group,
          COUNT(DISTINCT m.tabc_permit_number) AS location_count,
          SUM(m.total_receipts) AS total_revenue,
          LIST_DISTINCT(LIST(e.industry_segment) FILTER (WHERE e.industry_segment IS NOT NULL)) AS industry_segments
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e
          ON m.tabc_permit_number = e.tabc_permit_number
        WHERE e.ownership_group IS NOT NULL
          AND e.ownership_group != ''
          ${segmentWhere}
          ${searchWhere}
        GROUP BY e.ownership_group
      ),
      grand_total AS (
        SELECT SUM(total_receipts) AS grand_total_revenue
        FROM mixed_beverage_receipts
      )
      SELECT
        a.ownership_group,
        a.location_count,
        a.total_revenue,
        CASE WHEN a.location_count > 0 THEN a.total_revenue / a.location_count ELSE 0 END AS avg_revenue_per_location,
        COALESCE(r.recent_revenue, 0) AS recent_3mo_revenue,
        COALESCE(p.prior_revenue, 0) AS prior_3mo_revenue,
        CASE
          WHEN COALESCE(p.prior_revenue, 0) > 0
          THEN ROUND(((COALESCE(r.recent_revenue, 0) - p.prior_revenue) / p.prior_revenue) * 100, 2)
          ELSE 0
        END AS growth_pct,
        a.industry_segments,
        gt.grand_total_revenue
      FROM all_time a
      LEFT JOIN recent_3mo r ON a.ownership_group = r.ownership_group
      LEFT JOIN prior_3mo p ON a.ownership_group = p.ownership_group
      CROSS JOIN grand_total gt
      ${sortClause}
    `;

    const chainRows = await query<{
      ownership_group: string;
      location_count: number;
      total_revenue: number;
      avg_revenue_per_location: number;
      recent_3mo_revenue: number;
      prior_3mo_revenue: number;
      growth_pct: number;
      industry_segments: string[] | null;
      grand_total_revenue: number;
    }>(chainSql);

    if (chainRows.length === 0) {
      return NextResponse.json({
        chains: [],
        total_chains: 0,
        total_chain_locations: 0,
        total_revenue: 0,
        chain_revenue_pct: 0,
      } as ChainsResponse);
    }

    // Fetch top 3 locations per ownership group
    const ownershipGroups = chainRows.map(r => r.ownership_group).filter(Boolean);
    const quotedGroups = ownershipGroups.map(g => `'${g.replace(/'/g, "''")}'`).join(', ');

    const topLocationsSql = `
      WITH location_totals AS (
        SELECT
          m.tabc_permit_number,
          e.ownership_group,
          COALESCE(e.clean_dba_name, MAX(m.location_name)) AS location_name,
          MAX(m.location_city) AS location_city,
          SUM(m.total_receipts) AS total_revenue,
          ROW_NUMBER() OVER (
            PARTITION BY e.ownership_group
            ORDER BY SUM(m.total_receipts) DESC
          ) AS rn
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e
          ON m.tabc_permit_number = e.tabc_permit_number
        WHERE e.ownership_group IN (${quotedGroups})
        GROUP BY m.tabc_permit_number, e.ownership_group, e.clean_dba_name
      )
      SELECT
        tabc_permit_number,
        ownership_group,
        location_name,
        location_city,
        total_revenue
      FROM location_totals
      WHERE rn <= 3
      ORDER BY ownership_group, total_revenue DESC
    `;

    const topLocationRows = await query<{
      tabc_permit_number: string;
      ownership_group: string;
      location_name: string | null;
      location_city: string | null;
      total_revenue: number;
    }>(topLocationsSql);

    // Group top locations by ownership group
    const topLocMap = new Map<string, typeof topLocationRows>();
    for (const loc of topLocationRows) {
      if (!topLocMap.has(loc.ownership_group)) {
        topLocMap.set(loc.ownership_group, []);
      }
      topLocMap.get(loc.ownership_group)!.push(loc);
    }

    const grandTotalRevenue = chainRows[0]?.grand_total_revenue || 1;

    // Compute summary stats
    let totalChainLocations = 0;
    let totalChainRevenue = 0;

    const chains: ChainSummary[] = chainRows.map(row => {
      totalChainLocations += Number(row.location_count);
      totalChainRevenue += Number(row.total_revenue);

      const topLocs = (topLocMap.get(row.ownership_group) || []).map(l => ({
        tabc_permit_number: l.tabc_permit_number,
        location_name: l.location_name,
        location_city: l.location_city,
        total_revenue: Number(l.total_revenue),
      }));

      // Normalize industry_segments: DuckDB may return list as array or JSON string
      let segments: string[] = [];
      if (Array.isArray(row.industry_segments)) {
        segments = row.industry_segments.filter(Boolean);
      } else if (typeof row.industry_segments === 'string') {
        try {
          const parsed = JSON.parse(row.industry_segments as string);
          segments = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
          segments = [];
        }
      }

      return {
        ownership_group: row.ownership_group,
        location_count: Number(row.location_count),
        total_revenue: Number(row.total_revenue),
        avg_revenue_per_location: Number(row.avg_revenue_per_location),
        growth_pct: Number(row.growth_pct),
        recent_3mo_revenue: Number(row.recent_3mo_revenue),
        prior_3mo_revenue: Number(row.prior_3mo_revenue),
        industry_segments: segments,
        top_locations: topLocs,
      };
    });

    const chainRevenuePct = grandTotalRevenue > 0
      ? (totalChainRevenue / grandTotalRevenue) * 100
      : 0;

    return NextResponse.json({
      chains,
      total_chains: chains.length,
      total_chain_locations: totalChainLocations,
      total_revenue: totalChainRevenue,
      chain_revenue_pct: Math.round(chainRevenuePct * 10) / 10,
    } as ChainsResponse);
  } catch (error: any) {
    console.error('[API /chains] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch chain analytics',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
