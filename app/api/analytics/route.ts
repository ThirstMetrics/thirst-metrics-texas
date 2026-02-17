/**
 * Analytics API Route
 * Returns aggregated analytics data from DuckDB for the analytics dashboard.
 *
 * GET /api/analytics?monthsBack=12&category=total&comparisonMode=yoy
 *
 * Query params:
 *   monthsBack      - Number of months to look back (default: 12)
 *   category        - Revenue category filter: total|beer|wine|liquor|cover_charge
 *                     Affects metroplexBreakdown, countyBreakdown, topMovers, bottomMovers
 *   comparisonMode  - Comparison mode: yoy|mom|90over90|3yr|5yr
 *                     Overrides monthsBack and midDate calculation for movers
 *
 * Sections returned:
 *   kpis, revenueTrend, categoryMix, topMovers, bottomMovers,
 *   metroplexBreakdown, countyBreakdown, industrySegmentMix,
 *   ownershipGroups, monthlyGrowth
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/duckdb/connection';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KPIs {
  totalRevenue: number;
  totalCustomers: number;
  avgRevenuePerCustomer: number;
  activeCustomers: number;
}

interface RevenueTrendRow {
  month: string;
  total: number;
  liquor: number;
  wine: number;
  beer: number;
}

interface CategoryMix {
  liquor: number;
  wine: number;
  beer: number;
  coverCharge: number;
}

interface MoverRow {
  permit: string;
  name: string;
  currentRevenue: number;
  previousRevenue: number;
  change: number;
  changePercent: number;
}

interface MetroplexRow {
  metroplex: string;
  revenue: number;
  customerCount: number;
}

interface CountyRow {
  county: string;
  revenue: number;
  customerCount: number;
}

interface IndustrySegmentRow {
  segment: string;
  revenue: number;
  customerCount: number;
}

interface OwnershipGroupRow {
  group: string;
  locationCount: number;
  totalRevenue: number;
  avgRevenuePerLocation: number;
}

interface MonthlyGrowthRow {
  month: string;
  revenue: number;
  growthPercent: number | null;
}

interface AnalyticsResponse {
  kpis: KPIs | null;
  revenueTrend: RevenueTrendRow[];
  categoryMix: CategoryMix | null;
  topMovers: MoverRow[];
  bottomMovers: MoverRow[];
  metroplexBreakdown: MetroplexRow[];
  countyBreakdown: CountyRow[];
  industrySegmentMix: IndustrySegmentRow[];
  ownershipGroups: OwnershipGroupRow[];
  monthlyGrowth: MonthlyGrowthRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely run a DuckDB query, returning a default value on failure and logging
 * the error with the [Analytics API] prefix.
 */
async function safeQuery<T>(label: string, sql: string, fallback: T): Promise<T> {
  try {
    const rows = await query(sql);
    return rows as T;
  } catch (err: any) {
    console.error(`[Analytics API] ${label} query failed:`, err?.message ?? err);
    return fallback;
  }
}

async function safeQueryOne<T>(label: string, sql: string, fallback: T): Promise<T> {
  try {
    const rows = await query(sql);
    return rows.length > 0 ? (rows[0] as T) : fallback;
  } catch (err: any) {
    console.error(`[Analytics API] ${label} query failed:`, err?.message ?? err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    // --- Auth ---
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Params ---
    const { searchParams } = new URL(request.url);
    let monthsBack = Math.max(1, parseInt(searchParams.get('monthsBack') || '12', 10));

    // Category filter: total|beer|wine|liquor|cover_charge
    const categoryParam = searchParams.get('category') || 'total';
    const validCategories = ['total', 'beer', 'wine', 'liquor', 'cover_charge'];
    const category = validCategories.includes(categoryParam) ? categoryParam : 'total';

    // Map category to the DuckDB column name
    const categoryColumnMap: Record<string, string> = {
      total: 'total_receipts',
      beer: 'beer_receipts',
      wine: 'wine_receipts',
      liquor: 'liquor_receipts',
      cover_charge: 'cover_charge_receipts',
    };
    const revenueColumn = categoryColumnMap[category];

    // Comparison mode: yoy|mom|90over90|3yr|5yr
    const comparisonMode = searchParams.get('comparisonMode') || null;

    // Date boundaries
    const now = new Date();

    // Override monthsBack based on comparison mode
    if (comparisonMode === 'yoy') {
      monthsBack = 24;
    } else if (comparisonMode === 'mom') {
      monthsBack = 2;
    } else if (comparisonMode === '90over90') {
      monthsBack = 15; // ~15 months to capture same quarter last year
    } else if (comparisonMode === '3yr') {
      monthsBack = 36;
    } else if (comparisonMode === '5yr') {
      monthsBack = 60;
    }

    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - monthsBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // For active customers: last 3 months
    const activeDate = new Date(now);
    activeDate.setMonth(activeDate.getMonth() - 3);
    const activeDateStr = activeDate.toISOString().split('T')[0];

    // For movers: split point depends on comparison mode
    let midDate: Date;
    if (comparisonMode === 'yoy') {
      midDate = new Date(now);
      midDate.setMonth(midDate.getMonth() - 12);
    } else if (comparisonMode === 'mom') {
      midDate = new Date(now);
      midDate.setMonth(midDate.getMonth() - 1);
    } else if (comparisonMode === '90over90') {
      // Compare current 90 days vs same 90 days last year
      midDate = new Date(now);
      midDate.setMonth(midDate.getMonth() - 12);
    } else {
      // Default: split period in half
      const halfMonths = Math.floor(monthsBack / 2);
      midDate = new Date(now);
      midDate.setMonth(midDate.getMonth() - halfMonths);
    }
    const midDateStr = midDate.toISOString().split('T')[0];

    // -----------------------------------------------------------------------
    // Run independent queries in parallel
    // -----------------------------------------------------------------------

    const [
      kpisResult,
      revenueTrend,
      categoryMixResult,
      topMovers,
      bottomMovers,
      metroplexBreakdown,
      countyBreakdown,
      industrySegmentMix,
      ownershipGroups,
      monthlyGrowthRaw,
    ] = await Promise.all([

      // 1. KPIs
      safeQueryOne<KPIs | null>('KPIs', `
        SELECT
          CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE) AS "totalRevenue",
          CAST(COUNT(DISTINCT tabc_permit_number) AS DOUBLE) AS "totalCustomers",
          CAST(
            CASE WHEN COUNT(DISTINCT tabc_permit_number) > 0
              THEN SUM(total_receipts) / COUNT(DISTINCT tabc_permit_number)
              ELSE 0
            END AS DOUBLE
          ) AS "avgRevenuePerCustomer",
          CAST((
            SELECT COUNT(DISTINCT tabc_permit_number)
            FROM mixed_beverage_receipts
            WHERE obligation_end_date >= '${activeDateStr}'
          ) AS DOUBLE) AS "activeCustomers"
        FROM mixed_beverage_receipts
        WHERE obligation_end_date >= '${startDateStr}'
      `, null),

      // 2. Revenue trend
      safeQuery<RevenueTrendRow[]>('RevenueTrend', `
        SELECT
          strftime('%Y-%m', obligation_end_date) AS month,
          CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE)  AS total,
          CAST(COALESCE(SUM(liquor_receipts), 0) AS DOUBLE)  AS liquor,
          CAST(COALESCE(SUM(wine_receipts), 0) AS DOUBLE)    AS wine,
          CAST(COALESCE(SUM(beer_receipts), 0) AS DOUBLE)    AS beer
        FROM mixed_beverage_receipts
        WHERE obligation_end_date >= '${startDateStr}'
        GROUP BY strftime('%Y-%m', obligation_end_date)
        ORDER BY month ASC
      `, []),

      // 3. Category mix
      safeQueryOne<CategoryMix | null>('CategoryMix', `
        SELECT
          CAST(COALESCE(SUM(liquor_receipts), 0) AS DOUBLE)       AS liquor,
          CAST(COALESCE(SUM(wine_receipts), 0) AS DOUBLE)         AS wine,
          CAST(COALESCE(SUM(beer_receipts), 0) AS DOUBLE)         AS beer,
          CAST(COALESCE(SUM(cover_charge_receipts), 0) AS DOUBLE) AS "coverCharge"
        FROM mixed_beverage_receipts
        WHERE obligation_end_date >= '${startDateStr}'
      `, null),

      // 4. Top movers (biggest revenue increases) — filtered by category
      safeQuery<MoverRow[]>('TopMovers', `
        WITH current_period AS (
          SELECT
            tabc_permit_number,
            CAST(COALESCE(SUM(${revenueColumn}), 0) AS DOUBLE) AS revenue
          FROM mixed_beverage_receipts
          WHERE obligation_end_date >= '${midDateStr}'
          GROUP BY tabc_permit_number
        ),
        previous_period AS (
          SELECT
            tabc_permit_number,
            CAST(COALESCE(SUM(${revenueColumn}), 0) AS DOUBLE) AS revenue
          FROM mixed_beverage_receipts
          WHERE obligation_end_date >= '${startDateStr}'
            AND obligation_end_date < '${midDateStr}'
          GROUP BY tabc_permit_number
        )
        SELECT
          c.tabc_permit_number                              AS permit,
          COALESCE(e.clean_dba_name, MAX(m.location_name))  AS name,
          c.revenue                                         AS "currentRevenue",
          COALESCE(p.revenue, 0)                            AS "previousRevenue",
          CAST(c.revenue - COALESCE(p.revenue, 0) AS DOUBLE) AS change,
          CAST(
            CASE WHEN COALESCE(p.revenue, 0) > 0
              THEN ((c.revenue - p.revenue) / p.revenue) * 100
              ELSE 0
            END AS DOUBLE
          ) AS "changePercent"
        FROM current_period c
        LEFT JOIN previous_period p ON c.tabc_permit_number = p.tabc_permit_number
        LEFT JOIN location_enrichments e ON c.tabc_permit_number = e.tabc_permit_number
        LEFT JOIN mixed_beverage_receipts m ON c.tabc_permit_number = m.tabc_permit_number
        WHERE c.revenue - COALESCE(p.revenue, 0) > 0
        GROUP BY c.tabc_permit_number, c.revenue, p.revenue, e.clean_dba_name
        ORDER BY change DESC
        LIMIT 10
      `, []),

      // 5. Bottom movers (biggest revenue decreases) — filtered by category
      safeQuery<MoverRow[]>('BottomMovers', `
        WITH current_period AS (
          SELECT
            tabc_permit_number,
            CAST(COALESCE(SUM(${revenueColumn}), 0) AS DOUBLE) AS revenue
          FROM mixed_beverage_receipts
          WHERE obligation_end_date >= '${midDateStr}'
          GROUP BY tabc_permit_number
        ),
        previous_period AS (
          SELECT
            tabc_permit_number,
            CAST(COALESCE(SUM(${revenueColumn}), 0) AS DOUBLE) AS revenue
          FROM mixed_beverage_receipts
          WHERE obligation_end_date >= '${startDateStr}'
            AND obligation_end_date < '${midDateStr}'
          GROUP BY tabc_permit_number
        )
        SELECT
          p.tabc_permit_number                              AS permit,
          COALESCE(e.clean_dba_name, MAX(m.location_name))  AS name,
          COALESCE(c.revenue, 0)                            AS "currentRevenue",
          p.revenue                                         AS "previousRevenue",
          CAST(COALESCE(c.revenue, 0) - p.revenue AS DOUBLE) AS change,
          CAST(
            CASE WHEN p.revenue > 0
              THEN ((COALESCE(c.revenue, 0) - p.revenue) / p.revenue) * 100
              ELSE 0
            END AS DOUBLE
          ) AS "changePercent"
        FROM previous_period p
        LEFT JOIN current_period c ON p.tabc_permit_number = c.tabc_permit_number
        LEFT JOIN location_enrichments e ON p.tabc_permit_number = e.tabc_permit_number
        LEFT JOIN mixed_beverage_receipts m ON p.tabc_permit_number = m.tabc_permit_number
        WHERE COALESCE(c.revenue, 0) - p.revenue < 0
        GROUP BY p.tabc_permit_number, c.revenue, p.revenue, e.clean_dba_name
        ORDER BY change ASC
        LIMIT 10
      `, []),

      // 6. Metroplex breakdown (top 10) — filtered by category
      safeQuery<MetroplexRow[]>('MetroplexBreakdown', `
        SELECT
          mp.metroplex                                                 AS metroplex,
          CAST(COALESCE(SUM(m.${revenueColumn}), 0) AS DOUBLE)        AS revenue,
          CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE)         AS "customerCount"
        FROM mixed_beverage_receipts m
        INNER JOIN metroplexes mp ON SUBSTR(m.location_zip, 1, 5) = mp.zip
        WHERE m.obligation_end_date >= '${startDateStr}'
        GROUP BY mp.metroplex
        ORDER BY revenue DESC
        LIMIT 10
      `, []),

      // 7. County breakdown (top 15) — filtered by category
      safeQuery<CountyRow[]>('CountyBreakdown', `
        SELECT
          co.county_name                                              AS county,
          CAST(COALESCE(SUM(m.${revenueColumn}), 0) AS DOUBLE)       AS revenue,
          CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE)        AS "customerCount"
        FROM mixed_beverage_receipts m
        INNER JOIN counties co ON m.location_county_code = co.county_code
        WHERE m.obligation_end_date >= '${startDateStr}'
        GROUP BY co.county_name
        ORDER BY revenue DESC
        LIMIT 15
      `, []),

      // 8. Industry segment mix
      safeQuery<IndustrySegmentRow[]>('IndustrySegmentMix', `
        SELECT
          COALESCE(e.industry_segment, 'Unknown')                     AS segment,
          CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE)         AS revenue,
          CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE)        AS "customerCount"
        FROM mixed_beverage_receipts m
        LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
        WHERE m.obligation_end_date >= '${startDateStr}'
        GROUP BY COALESCE(e.industry_segment, 'Unknown')
        ORDER BY revenue DESC
      `, []),

      // 9. Ownership groups (top 25)
      safeQuery<OwnershipGroupRow[]>('OwnershipGroups', `
        SELECT
          e.ownership_group                                            AS "group",
          CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE)         AS "locationCount",
          CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE)          AS "totalRevenue",
          CAST(
            CASE WHEN COUNT(DISTINCT m.tabc_permit_number) > 0
              THEN SUM(m.total_receipts) / COUNT(DISTINCT m.tabc_permit_number)
              ELSE 0
            END AS DOUBLE
          ) AS "avgRevenuePerLocation"
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
        WHERE m.obligation_end_date >= '${startDateStr}'
          AND e.ownership_group IS NOT NULL
          AND e.ownership_group != ''
        GROUP BY e.ownership_group
        ORDER BY "totalRevenue" DESC
        LIMIT 25
      `, []),

      // 10. Monthly growth (raw monthly revenue, growth computed after)
      safeQuery<{ month: string; revenue: number }[]>('MonthlyGrowth', `
        SELECT
          strftime('%Y-%m', obligation_end_date) AS month,
          CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE) AS revenue
        FROM mixed_beverage_receipts
        WHERE obligation_end_date >= '${startDateStr}'
        GROUP BY strftime('%Y-%m', obligation_end_date)
        ORDER BY month ASC
      `, []),
    ]);

    // -----------------------------------------------------------------------
    // Post-process monthly growth to compute MoM growth percent
    // -----------------------------------------------------------------------

    const monthlyGrowth: MonthlyGrowthRow[] = monthlyGrowthRaw.map((row, idx) => {
      if (idx === 0 || monthlyGrowthRaw[idx - 1].revenue === 0) {
        return { month: row.month, revenue: row.revenue, growthPercent: null };
      }
      const prev = monthlyGrowthRaw[idx - 1].revenue;
      const growthPercent = ((row.revenue - prev) / prev) * 100;
      return {
        month: row.month,
        revenue: row.revenue,
        growthPercent: Math.round(growthPercent * 100) / 100,
      };
    });

    // -----------------------------------------------------------------------
    // Assemble response
    // -----------------------------------------------------------------------

    const response: AnalyticsResponse = {
      kpis: kpisResult,
      revenueTrend,
      categoryMix: categoryMixResult,
      topMovers,
      bottomMovers,
      metroplexBreakdown,
      countyBreakdown,
      industrySegmentMix,
      ownershipGroups,
      monthlyGrowth,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[Analytics API] Unhandled error:', error?.message ?? error);
    console.error('[Analytics API] Stack:', error?.stack);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        message: error?.message,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
