/**
 * Chain Detail API Route
 * GET /api/chains/[ownershipGroup] — detailed view of one ownership group
 * Returns all locations with revenue data, segments, and monthly trends
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

export interface ChainLocation {
  tabc_permit_number: string;
  location_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_county: string | null;
  location_zip: string | null;
  industry_segment: string | null;
  total_revenue: number;
  recent_3mo_revenue: number;
  prior_3mo_revenue: number;
  growth_pct: number;
  months_active: number;
}

export interface ChainMonthlyTrend {
  month: string;
  total_revenue: number;
  liquor_receipts: number;
  wine_receipts: number;
  beer_receipts: number;
  location_count: number;
}

export interface ChainDetailResponse {
  ownership_group: string;
  location_count: number;
  total_revenue: number;
  avg_revenue_per_location: number;
  growth_pct: number;
  recent_3mo_revenue: number;
  prior_3mo_revenue: number;
  industry_segments: string[];
  locations: ChainLocation[];
  monthly_trends: ChainMonthlyTrend[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ownershipGroup: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ownershipGroup } = await params;
    const decodedGroup = decodeURIComponent(ownershipGroup);
    const safeGroup = decodedGroup.replace(/'/g, "''");

    // Locations query — all locations in the group with revenue breakdown
    const locationsSql = `
      WITH location_totals AS (
        SELECT
          m.tabc_permit_number,
          COALESCE(e.clean_dba_name, MAX(m.location_name)) AS location_name,
          MAX(m.location_address) AS location_address,
          MAX(m.location_city) AS location_city,
          MAX(m.location_county) AS location_county,
          MAX(m.location_zip) AS location_zip,
          e.industry_segment,
          SUM(m.total_receipts) AS total_revenue,
          COUNT(DISTINCT m.obligation_end_date) AS months_active
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e
          ON m.tabc_permit_number = e.tabc_permit_number
        WHERE e.ownership_group = '${safeGroup}'
        GROUP BY m.tabc_permit_number, e.clean_dba_name, e.industry_segment
      ),
      recent_3mo AS (
        SELECT
          m.tabc_permit_number,
          SUM(m.total_receipts) AS recent_revenue
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e
          ON m.tabc_permit_number = e.tabc_permit_number
        WHERE e.ownership_group = '${safeGroup}'
          AND m.obligation_end_date >= (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY m.tabc_permit_number
      ),
      prior_3mo AS (
        SELECT
          m.tabc_permit_number,
          SUM(m.total_receipts) AS prior_revenue
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e
          ON m.tabc_permit_number = e.tabc_permit_number
        WHERE e.ownership_group = '${safeGroup}'
          AND m.obligation_end_date >= (CURRENT_DATE - INTERVAL '6 months')
          AND m.obligation_end_date < (CURRENT_DATE - INTERVAL '3 months')
        GROUP BY m.tabc_permit_number
      )
      SELECT
        lt.tabc_permit_number,
        lt.location_name,
        lt.location_address,
        lt.location_city,
        lt.location_county,
        lt.location_zip,
        lt.industry_segment,
        lt.total_revenue,
        lt.months_active,
        COALESCE(r.recent_revenue, 0) AS recent_3mo_revenue,
        COALESCE(p.prior_revenue, 0) AS prior_3mo_revenue,
        CASE
          WHEN COALESCE(p.prior_revenue, 0) > 0
          THEN ROUND(
            ((COALESCE(r.recent_revenue, 0) - p.prior_revenue) / p.prior_revenue) * 100,
            2
          )
          ELSE 0
        END AS growth_pct
      FROM location_totals lt
      LEFT JOIN recent_3mo r ON lt.tabc_permit_number = r.tabc_permit_number
      LEFT JOIN prior_3mo p ON lt.tabc_permit_number = p.tabc_permit_number
      ORDER BY lt.total_revenue DESC
    `;

    // Monthly trends — last 18 months
    const monthlyTrendsSql = `
      SELECT
        STRFTIME(m.obligation_end_date, '%Y-%m') AS month,
        SUM(m.total_receipts) AS total_revenue,
        SUM(COALESCE(m.liquor_receipts, 0)) AS liquor_receipts,
        SUM(COALESCE(m.wine_receipts, 0)) AS wine_receipts,
        SUM(COALESCE(m.beer_receipts, 0)) AS beer_receipts,
        COUNT(DISTINCT m.tabc_permit_number) AS location_count
      FROM mixed_beverage_receipts m
      INNER JOIN location_enrichments e
        ON m.tabc_permit_number = e.tabc_permit_number
      WHERE e.ownership_group = '${safeGroup}'
        AND m.obligation_end_date >= (CURRENT_DATE - INTERVAL '18 months')
      GROUP BY STRFTIME(m.obligation_end_date, '%Y-%m')
      ORDER BY month ASC
    `;

    const [locationRows, trendRows] = await Promise.all([
      query<{
        tabc_permit_number: string;
        location_name: string | null;
        location_address: string | null;
        location_city: string | null;
        location_county: string | null;
        location_zip: string | null;
        industry_segment: string | null;
        total_revenue: number;
        months_active: number;
        recent_3mo_revenue: number;
        prior_3mo_revenue: number;
        growth_pct: number;
      }>(locationsSql),
      query<{
        month: string;
        total_revenue: number;
        liquor_receipts: number;
        wine_receipts: number;
        beer_receipts: number;
        location_count: number;
      }>(monthlyTrendsSql),
    ]);

    if (locationRows.length === 0) {
      return NextResponse.json(
        { error: 'Ownership group not found' },
        { status: 404 }
      );
    }

    // Aggregate summary stats
    let totalRevenue = 0;
    let recent3mo = 0;
    let prior3mo = 0;
    const segmentSet = new Set<string>();

    const locations: ChainLocation[] = locationRows.map(row => {
      totalRevenue += Number(row.total_revenue);
      recent3mo += Number(row.recent_3mo_revenue);
      prior3mo += Number(row.prior_3mo_revenue);
      if (row.industry_segment) segmentSet.add(row.industry_segment);

      return {
        tabc_permit_number: row.tabc_permit_number,
        location_name: row.location_name,
        location_address: row.location_address,
        location_city: row.location_city,
        location_county: row.location_county,
        location_zip: row.location_zip,
        industry_segment: row.industry_segment,
        total_revenue: Number(row.total_revenue),
        recent_3mo_revenue: Number(row.recent_3mo_revenue),
        prior_3mo_revenue: Number(row.prior_3mo_revenue),
        growth_pct: Number(row.growth_pct),
        months_active: Number(row.months_active),
      };
    });

    const locationCount = locations.length;
    const avgRevenuePerLocation = locationCount > 0 ? totalRevenue / locationCount : 0;
    const overallGrowthPct = prior3mo > 0
      ? Math.round(((recent3mo - prior3mo) / prior3mo) * 10000) / 100
      : 0;

    const monthlyTrends: ChainMonthlyTrend[] = trendRows.map(row => ({
      month: row.month,
      total_revenue: Number(row.total_revenue),
      liquor_receipts: Number(row.liquor_receipts),
      wine_receipts: Number(row.wine_receipts),
      beer_receipts: Number(row.beer_receipts),
      location_count: Number(row.location_count),
    }));

    return NextResponse.json({
      ownership_group: decodedGroup,
      location_count: locationCount,
      total_revenue: totalRevenue,
      avg_revenue_per_location: avgRevenuePerLocation,
      growth_pct: overallGrowthPct,
      recent_3mo_revenue: recent3mo,
      prior_3mo_revenue: prior3mo,
      industry_segments: Array.from(segmentSet),
      locations,
      monthly_trends: monthlyTrends,
    } as ChainDetailResponse);
  } catch (error: any) {
    console.error('[API /chains/[ownershipGroup]] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch chain detail',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
