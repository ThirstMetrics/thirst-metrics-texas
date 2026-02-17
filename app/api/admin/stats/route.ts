/**
 * Admin Stats API Route
 * Returns system-wide statistics for the admin dashboard.
 *
 * GET /api/admin/stats
 *
 * Sections returned:
 *   system        - Total records, customers, revenue, date range, enrichment/geocoding counts
 *   dataFreshness - Latest data month, months covered, records by month (last 6)
 *   activityStats - Activity counts (total, week, month), photo counts, OCR stats
 *   userStats     - Total users and breakdown by role
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely run a DuckDB query, returning a default value on failure and logging
 * the error with the [Admin Stats API] prefix.
 */
async function safeQuery<T>(label: string, sql: string, fallback: T): Promise<T> {
  try {
    const rows = await query(sql);
    return rows as T;
  } catch (err: any) {
    console.error(`[Admin Stats API] ${label} query failed:`, err?.message ?? err);
    return fallback;
  }
}

async function safeQueryOne<T>(label: string, sql: string, fallback: T): Promise<T> {
  try {
    const rows = await query(sql);
    return rows.length > 0 ? (rows[0] as T) : fallback;
  } catch (err: any) {
    console.error(`[Admin Stats API] ${label} query failed:`, err?.message ?? err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // --- Auth ---
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Admin role check ---
    const serviceClient = createServiceClient();
    const { data: userRecord, error: roleError } = await serviceClient
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (roleError || !userRecord) {
      return NextResponse.json({ error: 'User record not found' }, { status: 403 });
    }

    if (userRecord.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
    }

    // --- Date boundaries for Supabase queries ---
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    // -----------------------------------------------------------------------
    // Run DuckDB queries in parallel
    // -----------------------------------------------------------------------

    const [
      systemOverview,
      enrichedCount,
      geocodedCount,
      dataFreshnessResult,
      monthsCoveredResult,
      recordsByMonth,
    ] = await Promise.all([

      // 1. System overview (from mixed_beverage_receipts)
      safeQueryOne<{
        totalRecords: number;
        totalCustomers: number;
        totalRevenue: number;
        earliest: string;
        latest: string;
      } | null>('SystemOverview', `
        SELECT
          CAST(COUNT(*) AS DOUBLE) AS "totalRecords",
          CAST(COUNT(DISTINCT tabc_permit_number) AS DOUBLE) AS "totalCustomers",
          CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE) AS "totalRevenue",
          CAST(MIN(obligation_end_date) AS VARCHAR) AS earliest,
          CAST(MAX(obligation_end_date) AS VARCHAR) AS latest
        FROM mixed_beverage_receipts
      `, null),

      // 2. Enriched customers count
      safeQueryOne<{ count: number } | null>('EnrichedCustomers', `
        SELECT CAST(COUNT(*) AS DOUBLE) AS count
        FROM location_enrichments
      `, null),

      // 3. Geocoded customers count
      safeQueryOne<{ count: number } | null>('GeocodedCustomers', `
        SELECT CAST(COUNT(*) AS DOUBLE) AS count
        FROM location_coordinates
      `, null),

      // 4. Latest data month
      safeQueryOne<{ latestDataMonth: string } | null>('LatestDataMonth', `
        SELECT CAST(MAX(obligation_end_date) AS VARCHAR) AS "latestDataMonth"
        FROM mixed_beverage_receipts
      `, null),

      // 5. Months covered
      safeQueryOne<{ monthsCovered: number } | null>('MonthsCovered', `
        SELECT CAST(COUNT(DISTINCT strftime('%Y-%m', obligation_end_date)) AS DOUBLE) AS "monthsCovered"
        FROM mixed_beverage_receipts
      `, null),

      // 6. Records by month (last 6 months)
      safeQuery<{ month: string; count: number }[]>('RecordsByMonth', `
        SELECT
          strftime('%Y-%m', obligation_end_date) AS month,
          CAST(COUNT(*) AS DOUBLE) AS count
        FROM mixed_beverage_receipts
        GROUP BY strftime('%Y-%m', obligation_end_date)
        ORDER BY month DESC
        LIMIT 6
      `, []),
    ]);

    // -----------------------------------------------------------------------
    // Run Supabase queries in parallel
    // -----------------------------------------------------------------------

    const [
      activitiesTotal,
      activitiesWeek,
      activitiesMonth,
      photosTotal,
      photosWithOcr,
      usersResult,
    ] = await Promise.all([

      // Total activities
      serviceClient
        .from('sales_activities')
        .select('id', { count: 'exact', head: true }),

      // Activities this week
      serviceClient
        .from('sales_activities')
        .select('id', { count: 'exact', head: true })
        .gte('activity_date', sevenDaysAgoStr),

      // Activities this month
      serviceClient
        .from('sales_activities')
        .select('id', { count: 'exact', head: true })
        .gte('activity_date', thirtyDaysAgoStr),

      // Total photos
      serviceClient
        .from('activity_photos')
        .select('id', { count: 'exact', head: true }),

      // Photos with OCR
      serviceClient
        .from('activity_photos')
        .select('id', { count: 'exact', head: true })
        .not('ocr_text', 'is', null),

      // All users with roles
      serviceClient
        .from('users')
        .select('id, role'),
    ]);

    // -----------------------------------------------------------------------
    // Assemble user stats
    // -----------------------------------------------------------------------

    const allUsers = usersResult.data || [];
    const byRole = {
      salesperson: 0,
      manager: 0,
      admin: 0,
    };
    for (const u of allUsers) {
      if (u.role === 'salesperson') byRole.salesperson += 1;
      else if (u.role === 'manager') byRole.manager += 1;
      else if (u.role === 'admin') byRole.admin += 1;
    }

    // -----------------------------------------------------------------------
    // Assemble response
    // -----------------------------------------------------------------------

    return NextResponse.json({
      system: {
        totalRecords: systemOverview?.totalRecords ?? 0,
        totalCustomers: systemOverview?.totalCustomers ?? 0,
        totalRevenue: systemOverview?.totalRevenue ?? 0,
        dateRange: {
          earliest: systemOverview?.earliest ?? null,
          latest: systemOverview?.latest ?? null,
        },
        enrichedCustomers: enrichedCount?.count ?? 0,
        geocodedCustomers: geocodedCount?.count ?? 0,
      },
      dataFreshness: {
        latestDataMonth: dataFreshnessResult?.latestDataMonth ?? null,
        monthsCovered: monthsCoveredResult?.monthsCovered ?? 0,
        recordsByMonth: recordsByMonth.sort((a, b) => a.month.localeCompare(b.month)),
      },
      activityStats: {
        totalActivities: activitiesTotal.count ?? 0,
        activitiesThisWeek: activitiesWeek.count ?? 0,
        activitiesThisMonth: activitiesMonth.count ?? 0,
        totalPhotos: photosTotal.count ?? 0,
        photosWithOcr: photosWithOcr.count ?? 0,
      },
      userStats: {
        totalUsers: allUsers.length,
        byRole,
      },
    });
  } catch (error: any) {
    console.error('[Admin Stats API] Unhandled error:', error?.message ?? error);
    console.error('[Admin Stats API] Stack:', error?.stack);
    return NextResponse.json(
      {
        error: 'Failed to fetch admin stats',
        message: error?.message,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
