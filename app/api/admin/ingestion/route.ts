/**
 * Admin Ingestion API Route
 * Provides monitoring, dry-run checks, and remote ingestion trigger for Texas.gov data.
 *
 * GET  /api/admin/ingestion  - Returns data freshness info and API status
 * POST /api/admin/ingestion  - Dry-run check: what new data is available from the Texas API
 * PUT  /api/admin/ingestion  - Trigger ingestion: SSH into server and run the ingestion script
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

const TEXAS_API_URL = 'https://data.texas.gov/resource/naix-2893.json';

// SSH connection details for production server
const SSH_HOST = '167.71.242.157';
const SSH_USER = 'master_nrbudqgaus';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '~/.ssh/id_ed25519';
const APP_PATH = '~/applications/gnhezcjyuk/public_html';

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
 * Parse a date value from the Texas API into YYYY-MM-DD format.
 * The API returns ISO timestamps like "2026-02-28T00:00:00.000"
 * despite the field name suggesting YYYYMMDD format.
 */
function formatDateFromApi(dateStr: string): string {
  // Handle ISO timestamp format: "2026-02-28T00:00:00.000"
  if (dateStr.includes('T') || dateStr.includes('-')) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  }
  // Fallback: YYYYMMDD format (e.g., "20260228")
  if (/^\d{8}$/.test(dateStr)) {
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
  }
  // Last resort: return as-is
  return dateStr;
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
    }

    // Fetch the most recent records from the Texas API to discover new months
    let latestInApi: string | null = null;
    let newMonthsAvailable: string[] = [];
    let estimatedNewRecords = 0;
    let sampleRecords: { permit: string; name: string; date: string; total: number }[] = [];

    try {
      // Step 1: Fetch latest 100 records to discover what months are available
      const discoveryUrl = new URL(TEXAS_API_URL);
      discoveryUrl.searchParams.set('$limit', '100');
      discoveryUrl.searchParams.set('$order', 'obligation_end_date_yyyymmdd DESC');

      const discoveryResponse = await fetch(discoveryUrl.toString());
      if (!discoveryResponse.ok) {
        throw new Error(`Texas API returned ${discoveryResponse.status} ${discoveryResponse.statusText}`);
      }

      const discoveryRecords: any[] = await discoveryResponse.json();

      if (discoveryRecords.length > 0) {
        // Find the latest date in API results
        const firstDateStr = discoveryRecords[0].obligation_end_date_yyyymmdd;
        if (firstDateStr) {
          latestInApi = formatDateFromApi(firstDateStr);
        }

        // Collect all unique months from API results
        const apiMonths = new Set<string>();
        for (const record of discoveryRecords) {
          const dateStr = record.obligation_end_date_yyyymmdd;
          if (dateStr) {
            const formatted = formatDateFromApi(dateStr);
            apiMonths.add(toYearMonth(formatted));
          }
        }

        // Normalize existing DB months to YYYY-MM for comparison
        const existingYearMonths = new Set<string>();
        for (const m of existingMonths) {
          existingYearMonths.add(m.substring(0, 7));
        }

        newMonthsAvailable = Array.from(apiMonths)
          .filter((m) => !existingYearMonths.has(m))
          .sort()
          .reverse();

        // Estimate new records (~23k per month typical for Texas)
        if (newMonthsAvailable.length > 0) {
          estimatedNewRecords = newMonthsAvailable.length * 23000;
        }

        // Step 2: Fetch the highest-revenue sample records from new data
        // This gives the admin a meaningful preview of real data that arrived
        const sampleUrl = new URL(TEXAS_API_URL);
        sampleUrl.searchParams.set('$limit', '5');
        sampleUrl.searchParams.set('$order', 'total_receipts DESC');

        // Filter for records after the latest DB date with actual revenue
        if (latestInDb) {
          const latestDbFormatted = latestInDb.substring(0, 10);
          sampleUrl.searchParams.set(
            '$where',
            `obligation_end_date_yyyymmdd > '${latestDbFormatted}T00:00:00.000' AND total_receipts > 0`
          );
        } else {
          sampleUrl.searchParams.set('$where', 'total_receipts > 0');
        }

        try {
          const sampleResponse = await fetch(sampleUrl.toString());
          if (sampleResponse.ok) {
            const sampleData: any[] = await sampleResponse.json();
            sampleRecords = sampleData.map((record) => {
              const dateStr = record.obligation_end_date_yyyymmdd;
              return {
                permit: record.tabc_permit_number || '',
                name: record.location_name || '',
                date: dateStr ? formatDateFromApi(dateStr) : '',
                total: parseFloat(record.total_receipts) || 0,
              };
            });
          }
        } catch (sampleErr: any) {
          console.error('[Admin Ingestion API] Sample query error:', sampleErr?.message ?? sampleErr);
          // Fallback: sort the discovery records by total_receipts DESC
          const sorted = [...discoveryRecords]
            .filter((r) => parseFloat(r.total_receipts) > 0)
            .sort((a, b) => (parseFloat(b.total_receipts) || 0) - (parseFloat(a.total_receipts) || 0))
            .slice(0, 5);
          sampleRecords = sorted.map((record) => {
            const dateStr = record.obligation_end_date_yyyymmdd;
            return {
              permit: record.tabc_permit_number || '',
              name: record.location_name || '',
              date: dateStr ? formatDateFromApi(dateStr) : '',
              total: parseFloat(record.total_receipts) || 0,
            };
          });
        }
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
    });
  } catch (error: any) {
    console.error('[Admin Ingestion API] POST error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check for new data' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT handler - Trigger ingestion via SSH
// ---------------------------------------------------------------------------

export async function PUT() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Use Node.js child_process to SSH into the production server and run ingestion
    const { exec } = await import('child_process');

    const sshCommand = [
      `ssh -i ${SSH_KEY_PATH}`,
      `-o StrictHostKeyChecking=no`,
      `-o ConnectTimeout=10`,
      `${SSH_USER}@${SSH_HOST}`,
      `'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && cd ${APP_PATH} && npx tsx scripts/ingest-beverage-receipts.ts 2>&1'`,
    ].join(' ');

    console.log('[Admin Ingestion API] Starting remote ingestion via SSH...');
    console.log('[Admin Ingestion API] Command:', sshCommand);

    return new Promise<Response>((resolve) => {
      // Set a generous timeout — ingestion can take several minutes
      const childProcess = exec(sshCommand, {
        timeout: 10 * 60 * 1000, // 10 minutes
        maxBuffer: 10 * 1024 * 1024, // 10MB output buffer
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('[Admin Ingestion API] SSH exec error:', error.message);
          console.error('[Admin Ingestion API] stderr:', stderr);
          console.error('[Admin Ingestion API] stdout:', stdout);

          // Check if it's a timeout
          if (error.killed) {
            resolve(NextResponse.json({
              success: false,
              message: 'Ingestion timed out after 10 minutes. It may still be running on the server.',
              output: stdout ? stdout.substring(stdout.length - 2000) : '',
              error: 'Process timed out',
            }, { status: 504 }));
            return;
          }

          resolve(NextResponse.json({
            success: false,
            message: `Ingestion failed: ${error.message}`,
            output: stdout || '',
            error: stderr || error.message,
          }, { status: 500 }));
          return;
        }

        // Parse the output for summary stats
        const output = stdout || '';
        const addedMatch = output.match(/Added:\s*(\d[\d,]*)/);
        const modifiedMatch = output.match(/Modified:\s*(\d[\d,]*)/);
        const fetchedMatch = output.match(/Fetched:\s*(\d[\d,]*)/);
        const errorMatch = output.match(/Errors:\s*(\d[\d,]*)/);

        const summary = {
          added: addedMatch ? addedMatch[1] : '0',
          modified: modifiedMatch ? modifiedMatch[1] : '0',
          fetched: fetchedMatch ? fetchedMatch[1] : 'unknown',
          errors: errorMatch ? errorMatch[1] : '0',
        };

        console.log('[Admin Ingestion API] Ingestion complete:', summary);

        resolve(NextResponse.json({
          success: true,
          message: `Ingestion complete. Added: ${summary.added}, Modified: ${summary.modified}`,
          summary,
          output: output.substring(output.length - 3000), // Last 3000 chars of output
        }));
      });

      // Log process PID for debugging
      if (childProcess.pid) {
        console.log('[Admin Ingestion API] SSH process PID:', childProcess.pid);
      }
    });
  } catch (error: any) {
    console.error('[Admin Ingestion API] PUT error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to trigger ingestion' },
      { status: 500 }
    );
  }
}
