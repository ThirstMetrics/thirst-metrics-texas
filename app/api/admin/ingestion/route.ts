/**
 * Admin Ingestion API Route
 * Provides monitoring and dry-run checks for Texas.gov mixed beverage data ingestion.
 *
 * GET  /api/admin/ingestion  - Returns data freshness info and API status
 * POST /api/admin/ingestion  - Dry-run check: what new data is available from the Texas API
 *
 * IMPORTANT: DuckDB is opened READ_ONLY in the web app. Actual ingestion must be
 * performed via SSH using: npx tsx scripts/ingest-beverage-receipts.ts
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

const TEXAS_API_URL = 'https://data.texas.gov/resource/naix-2893.json';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify that the requesting user has the admin role.
 * Returns the user record if admin, or an error response otherwise.
 */
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

/**
 * Parse a YYYYMMDD date string from the Texas API into YYYY-MM-DD format.
 */
function formatDateFromApi(dateStr: string): string {
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

/**
 * Extract the YYYY-MM portion from a YYYY-MM-DD date string.
 */
function toYearMonth(dateStr: string): string {
  return dateStr.substring(0, 7);
}

// ---------------------------------------------------------------------------
// GET handler - Data freshness info and API status
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Query DuckDB for data freshness info
    let latestRecord: string | null = null;
    let totalRecords = 0;
    let recordsByMonth: { month: string; count: number }[] = [];

    try {
      // Get the most recent obligation_end_date
      const latestResult = await query<{ latest_date: string }>(
        `SELECT CAST(MAX(obligation_end_date) AS VARCHAR) AS latest_date
         FROM mixed_beverage_receipts`
      );
      latestRecord = latestResult[0]?.latest_date || null;

      // Get total record count
      const countResult = await query<{ total: number }>(
        `SELECT CAST(COUNT(*) AS DOUBLE) AS total
         FROM mixed_beverage_receipts`
      );
      totalRecords = countResult[0]?.total || 0;

      // Get record counts for the last 6 months
      const monthsResult = await query<{ month: string; count: number }>(
        `SELECT
           CAST(DATE_TRUNC('month', obligation_end_date) AS VARCHAR) AS month,
           CAST(COUNT(*) AS DOUBLE) AS count
         FROM mixed_beverage_receipts
         WHERE obligation_end_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
         GROUP BY DATE_TRUNC('month', obligation_end_date)
         ORDER BY month DESC`
      );
      recordsByMonth = monthsResult.map((r) => ({
        month: r.month,
        count: r.count,
      }));
    } catch (dbError: any) {
      console.error('[Admin Ingestion API] DuckDB query error:', dbError?.message ?? dbError);
      // Continue with defaults so the API status check still returns
    }

    // Quick check if the Texas API is reachable
    let apiStatus: 'available' | 'unavailable' = 'unavailable';
    try {
      const apiCheck = await fetch(`${TEXAS_API_URL}?$limit=1`);
      apiStatus = apiCheck.ok ? 'available' : 'unavailable';
    } catch {
      apiStatus = 'unavailable';
    }

    return NextResponse.json({
      latestRecord,
      totalRecords,
      recordsByMonth,
      apiStatus,
      lastChecked: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Admin Ingestion API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch ingestion status' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler - Dry-run check of what new data is available
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Get the latest obligation_end_date from DuckDB
    let latestInDb: string | null = null;
    let existingMonths = new Set<string>();

    try {
      const latestResult = await query<{ latest_date: string }>(
        `SELECT CAST(MAX(obligation_end_date) AS VARCHAR) AS latest_date
         FROM mixed_beverage_receipts`
      );
      latestInDb = latestResult[0]?.latest_date || null;

      // Get all distinct months currently in the DB to compare
      const monthsResult = await query<{ month: string }>(
        `SELECT DISTINCT CAST(DATE_TRUNC('month', obligation_end_date) AS VARCHAR) AS month
         FROM mixed_beverage_receipts
         ORDER BY month DESC`
      );
      existingMonths = new Set(monthsResult.map((r) => r.month));
    } catch (dbError: any) {
      console.error('[Admin Ingestion API] DuckDB query error:', dbError?.message ?? dbError);
      // Continue - we can still check the API even if DuckDB fails
    }

    // Fetch the most recent 100 records from the Texas API
    let latestInApi: string | null = null;
    let newMonthsAvailable: string[] = [];
    let estimatedNewRecords = 0;
    let sampleRecords: { permit: string; name: string; date: string; total: number }[] = [];

    try {
      const apiUrl = new URL(TEXAS_API_URL);
      apiUrl.searchParams.set('$limit', '100');
      apiUrl.searchParams.set('$order', 'obligation_end_date_yyyymmdd DESC');

      const apiResponse = await fetch(apiUrl.toString());
      if (!apiResponse.ok) {
        throw new Error(`Texas API returned ${apiResponse.status} ${apiResponse.statusText}`);
      }

      const apiRecords: any[] = await apiResponse.json();

      if (apiRecords.length > 0) {
        // Find the latest date in API results
        const firstDateStr = apiRecords[0].obligation_end_date_yyyymmdd;
        if (firstDateStr) {
          latestInApi = formatDateFromApi(firstDateStr);
        }

        // Collect all unique months from API results
        const apiMonths = new Set<string>();
        for (const record of apiRecords) {
          const dateStr = record.obligation_end_date_yyyymmdd;
          if (dateStr) {
            const formatted = formatDateFromApi(dateStr);
            apiMonths.add(toYearMonth(formatted));
          }
        }

        // Determine which months in the API are not yet in DuckDB
        // existingMonths contains full timestamp strings from DuckDB, so we need to
        // normalize them to YYYY-MM for comparison
        const existingYearMonths = new Set<string>();
        for (const m of existingMonths) {
          // DuckDB DATE_TRUNC returns strings like "2026-01-01" or "2026-01-01 00:00:00"
          existingYearMonths.add(m.substring(0, 7));
        }

        newMonthsAvailable = Array.from(apiMonths)
          .filter((m) => !existingYearMonths.has(m))
          .sort()
          .reverse();

        // Filter API records that belong to new months for sample/estimation
        const newRecords = apiRecords.filter((record) => {
          const dateStr = record.obligation_end_date_yyyymmdd;
          if (!dateStr) return false;
          const formatted = formatDateFromApi(dateStr);
          return newMonthsAvailable.includes(toYearMonth(formatted));
        });

        estimatedNewRecords = newRecords.length;

        // If there are new months, estimate based on typical monthly volume (~23k/month)
        if (newMonthsAvailable.length > 0 && estimatedNewRecords < 100) {
          // The 100-record sample likely does not cover all new records.
          // Estimate roughly 23,000 per new month (typical Texas volume).
          estimatedNewRecords = newMonthsAvailable.length * 23000;
        }

        // Build sample preview from the first 5 new records (or first 5 overall if no new months)
        const previewSource = newRecords.length > 0 ? newRecords : apiRecords;
        sampleRecords = previewSource.slice(0, 5).map((record) => {
          const dateStr = record.obligation_end_date_yyyymmdd;
          return {
            permit: record.tabc_permit_number || '',
            name: record.location_name || '',
            date: dateStr ? formatDateFromApi(dateStr) : '',
            total: parseFloat(record.total_receipts) || 0,
          };
        });
      }
    } catch (apiError: any) {
      console.error('[Admin Ingestion API] Texas API error:', apiError?.message ?? apiError);
      return NextResponse.json(
        {
          latestInDb,
          latestInApi: null,
          newMonthsAvailable: [],
          estimatedNewRecords: 0,
          sampleRecords: [],
          message: `Unable to reach the Texas API: ${apiError?.message || 'Unknown error'}`,
          instructions: 'To ingest new data, SSH into the server and run: npx tsx scripts/ingest-beverage-receipts.ts',
        },
        { status: 502 }
      );
    }

    // Build human-readable message
    let message: string;
    if (newMonthsAvailable.length === 0) {
      message = 'Database is up to date. No new months of data found in the Texas API.';
    } else if (newMonthsAvailable.length === 1) {
      message = `1 new month of data available (${newMonthsAvailable[0]}), estimated ~${estimatedNewRecords.toLocaleString()} new records.`;
    } else {
      message = `${newMonthsAvailable.length} new months of data available (${newMonthsAvailable.join(', ')}), estimated ~${estimatedNewRecords.toLocaleString()} new records.`;
    }

    return NextResponse.json({
      latestInDb,
      latestInApi,
      newMonthsAvailable,
      estimatedNewRecords,
      sampleRecords,
      message,
      instructions: 'To ingest new data, SSH into the server and run: npx tsx scripts/ingest-beverage-receipts.ts',
    });
  } catch (error: any) {
    console.error('[Admin Ingestion API] POST error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check for new data' },
      { status: 500 }
    );
  }
}
