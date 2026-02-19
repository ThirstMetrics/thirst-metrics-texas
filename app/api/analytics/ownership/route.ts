/**
 * Ownership Group Search & Detail API
 *
 * GET /api/analytics/ownership?search=pappas&monthsBack=12
 *   → Returns matching ownership groups with segments and top locations
 *
 * GET /api/analytics/ownership?groups=Pappa's,Chuy's&monthsBack=12
 *   → Returns detailed comparison data for specific groups
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/duckdb/connection';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OwnershipGroupDetail {
  group: string;
  locationCount: number;
  totalRevenue: number;
  avgRevenuePerLocation: number;
  segments: { segment: string; locationCount: number; revenue: number }[];
  locations: { permit: string; name: string; city: string; segment: string; revenue: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeQuery<T>(label: string, sql: string, fallback: T): Promise<T> {
  try {
    const rows = await query(sql);
    return rows as T;
  } catch (err: any) {
    console.error(`[Ownership API] ${label} query failed:`, err?.message ?? err);
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

    const { searchParams } = new URL(request.url);
    const monthsBack = Math.max(1, parseInt(searchParams.get('monthsBack') || '12', 10));
    const searchTerm = searchParams.get('search') || '';
    const groupsParam = searchParams.get('groups') || '';

    // Date boundary
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    const startDateStr = startDate.toISOString().split('T')[0];

    // -----------------------------------------------------------------------
    // Mode 1: Search — return matching ownership groups (autocomplete)
    // -----------------------------------------------------------------------
    if (searchTerm && !groupsParam) {
      const escaped = searchTerm.replace(/'/g, "''");
      const results = await safeQuery<{ group: string; locationCount: number; totalRevenue: number }[]>(
        'OwnershipSearch',
        `
        SELECT
          e.ownership_group AS "group",
          CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE) AS "locationCount",
          CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) AS "totalRevenue"
        FROM mixed_beverage_receipts m
        INNER JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
        WHERE m.obligation_end_date >= '${startDateStr}'
          AND e.ownership_group IS NOT NULL
          AND e.ownership_group != ''
          AND LOWER(e.ownership_group) LIKE LOWER('%${escaped}%')
        GROUP BY e.ownership_group
        ORDER BY "totalRevenue" DESC
        LIMIT 20
        `,
        [],
      );

      return NextResponse.json({ results });
    }

    // -----------------------------------------------------------------------
    // Mode 2: Detail — return full breakdown for selected groups
    // -----------------------------------------------------------------------
    if (groupsParam) {
      const groupNames = groupsParam.split(',').map(g => g.trim()).filter(Boolean);
      if (groupNames.length === 0) {
        return NextResponse.json({ groups: [] });
      }

      const groups: OwnershipGroupDetail[] = [];

      for (const groupName of groupNames) {
        const escaped = groupName.replace(/'/g, "''");

        // Aggregate stats
        const [statsRows, segmentRows, locationRows] = await Promise.all([
          // Group totals
          safeQuery<{ locationCount: number; totalRevenue: number; avgRevenuePerLocation: number }[]>(
            `GroupStats:${groupName}`,
            `
            SELECT
              CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE) AS "locationCount",
              CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) AS "totalRevenue",
              CAST(
                CASE WHEN COUNT(DISTINCT m.tabc_permit_number) > 0
                  THEN SUM(m.total_receipts) / COUNT(DISTINCT m.tabc_permit_number)
                  ELSE 0
                END AS DOUBLE
              ) AS "avgRevenuePerLocation"
            FROM mixed_beverage_receipts m
            INNER JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
            WHERE m.obligation_end_date >= '${startDateStr}'
              AND e.ownership_group = '${escaped}'
            `,
            [],
          ),

          // Segments within this group
          safeQuery<{ segment: string; locationCount: number; revenue: number }[]>(
            `GroupSegments:${groupName}`,
            `
            SELECT
              COALESCE(e.industry_segment, 'Unknown') AS segment,
              CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE) AS "locationCount",
              CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) AS revenue
            FROM mixed_beverage_receipts m
            INNER JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
            WHERE m.obligation_end_date >= '${startDateStr}'
              AND e.ownership_group = '${escaped}'
            GROUP BY COALESCE(e.industry_segment, 'Unknown')
            ORDER BY revenue DESC
            `,
            [],
          ),

          // Individual locations sorted by revenue
          safeQuery<{ permit: string; name: string; city: string; segment: string; revenue: number }[]>(
            `GroupLocations:${groupName}`,
            `
            SELECT
              m.tabc_permit_number AS permit,
              COALESCE(e.clean_dba_name, MAX(m.location_name)) AS name,
              MAX(m.location_city) AS city,
              COALESCE(e.industry_segment, 'Unknown') AS segment,
              CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) AS revenue
            FROM mixed_beverage_receipts m
            INNER JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
            WHERE m.obligation_end_date >= '${startDateStr}'
              AND e.ownership_group = '${escaped}'
            GROUP BY m.tabc_permit_number, e.clean_dba_name, e.industry_segment
            ORDER BY name ASC
            `,
            [],
          ),
        ]);

        const stats = statsRows[0] || { locationCount: 0, totalRevenue: 0, avgRevenuePerLocation: 0 };

        groups.push({
          group: groupName,
          locationCount: stats.locationCount,
          totalRevenue: stats.totalRevenue,
          avgRevenuePerLocation: stats.avgRevenuePerLocation,
          segments: segmentRows,
          locations: locationRows,
        });
      }

      return NextResponse.json({ groups });
    }

    // -----------------------------------------------------------------------
    // Mode 3: No params — return top ownership groups (default view)
    // -----------------------------------------------------------------------
    const topGroups = await safeQuery<{ group: string; locationCount: number; totalRevenue: number }[]>(
      'TopOwnershipGroups',
      `
      SELECT
        e.ownership_group AS "group",
        CAST(COUNT(DISTINCT m.tabc_permit_number) AS DOUBLE) AS "locationCount",
        CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) AS "totalRevenue"
      FROM mixed_beverage_receipts m
      INNER JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
      WHERE m.obligation_end_date >= '${startDateStr}'
        AND e.ownership_group IS NOT NULL
        AND e.ownership_group != ''
      GROUP BY e.ownership_group
      ORDER BY "totalRevenue" DESC
      LIMIT 50
      `,
      [],
    );

    return NextResponse.json({ results: topGroups });
  } catch (error: any) {
    console.error('[Ownership API] Unhandled error:', error?.message ?? error);
    return NextResponse.json({ error: 'Failed to fetch ownership data' }, { status: 500 });
  }
}
