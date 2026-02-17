/**
 * Admin Ingestion API Route
 * Provides monitoring, dry-run checks, and remote ingestion trigger for Texas.gov data.
 *
 * GET    /api/admin/ingestion  - Returns data freshness info and API status
 * POST   /api/admin/ingestion  - Dry-run check: what new data is available from the Texas API
 * PUT    /api/admin/ingestion  - Trigger ingestion: fire-and-forget via detached screen session over SSH
 * DELETE /api/admin/ingestion  - Check ingestion status: lock file, log tail, and screen session
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';
import { isProductionServer, APP_PATH } from '@/lib/server/exec-remote';

export const dynamic = 'force-dynamic';

const TEXAS_API_URL = 'https://data.texas.gov/resource/naix-2893.json';

// SSH connection details for production server (used when running from dev machine)
const SSH_HOST = '167.71.242.157';
const SSH_USER = 'master_nrbudqgaus';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '~/.ssh/id_ed25519';

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

        // Step 2: Fetch the highest-revenue sample records
        // Strategy: get top 5 from the latest month in the API.
        // If fewer than 5 results (month still being reported), backfill
        // with top records from the most recent complete month.
        const mapRecord = (record: any) => {
          const dateStr = record.obligation_end_date_yyyymmdd;
          return {
            permit: record.tabc_permit_number || '',
            name: record.location_name || '',
            date: dateStr ? formatDateFromApi(dateStr) : '',
            total: parseFloat(record.total_receipts) || 0,
          };
        };

        try {
          // First: try from the latest API month
          const sampleUrl = new URL(TEXAS_API_URL);
          sampleUrl.searchParams.set('$limit', '5');
          sampleUrl.searchParams.set('$order', 'total_receipts DESC');

          if (latestInApi) {
            const latestMonth = latestInApi.substring(0, 7);
            const monthStart = `${latestMonth}-01T00:00:00.000`;
            sampleUrl.searchParams.set(
              '$where',
              `obligation_end_date_yyyymmdd >= '${monthStart}' AND total_receipts > 0`
            );
          } else {
            sampleUrl.searchParams.set('$where', 'total_receipts > 0');
          }

          const sampleResponse = await fetch(sampleUrl.toString());
          if (sampleResponse.ok) {
            const sampleData: any[] = await sampleResponse.json();
            sampleRecords = sampleData.map(mapRecord);
          }

          // If fewer than 5 and we have a latest DB date, supplement with
          // top records from the most recent complete month (the one in DB)
          if (sampleRecords.length < 5 && latestInDb) {
            const dbMonth = latestInDb.substring(0, 7);
            const dbMonthStart = `${dbMonth}-01T00:00:00.000`;
            const dbMonthEndDate = new Date(latestInDb);
            dbMonthEndDate.setMonth(dbMonthEndDate.getMonth() + 1);
            dbMonthEndDate.setDate(1);
            const dbMonthEnd = dbMonthEndDate.toISOString().split('T')[0] + 'T00:00:00.000';

            const backfillUrl = new URL(TEXAS_API_URL);
            backfillUrl.searchParams.set('$limit', String(5 - sampleRecords.length));
            backfillUrl.searchParams.set('$order', 'total_receipts DESC');
            backfillUrl.searchParams.set(
              '$where',
              `obligation_end_date_yyyymmdd >= '${dbMonthStart}' AND obligation_end_date_yyyymmdd < '${dbMonthEnd}' AND total_receipts > 0`
            );

            const backfillResponse = await fetch(backfillUrl.toString());
            if (backfillResponse.ok) {
              const backfillData: any[] = await backfillResponse.json();
              sampleRecords = [...sampleRecords, ...backfillData.map(mapRecord)];
            }
          }
        } catch (sampleErr: any) {
          console.error('[Admin Ingestion API] Sample query error:', sampleErr?.message ?? sampleErr);
          // Fallback: sort the discovery records by total_receipts DESC
          const sorted = [...discoveryRecords]
            .filter((r) => parseFloat(r.total_receipts) > 0)
            .sort((a, b) => (parseFloat(b.total_receipts) || 0) - (parseFloat(a.total_receipts) || 0))
            .slice(0, 5);
          sampleRecords = sorted.map(mapRecord);
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
// PUT handler - Trigger ingestion via detached screen session (fire-and-forget)
// ---------------------------------------------------------------------------

export async function PUT() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const { exec } = await import('child_process');
    const isLocal = isProductionServer();
    const sshBase = isLocal ? '' : `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
    const lockFile = `${APP_PATH}/data/.ingestion-lock.json`;
    const logFile = `${APP_PATH}/data/.ingestion-log.txt`;

    // Step 1: Check if a lock file already exists (ingestion already running)
    const lockCheckCmd = isLocal
      ? `bash -c 'test -f ${lockFile} && cat ${lockFile} || echo "__NO_LOCK__"'`
      : `${sshBase} "test -f ${lockFile} && cat ${lockFile} || echo '__NO_LOCK__'"`;

    const checkLockResult = await new Promise<{ stdout: string; stderr: string; error: any }>((resolve) => {
      exec(
        lockCheckCmd,
        { timeout: 30_000 },
        (error, stdout, stderr) => resolve({ stdout: stdout || '', stderr: stderr || '', error })
      );
    });

    if (checkLockResult.error) {
      console.error('[Admin Ingestion API] SSH lock check failed:', checkLockResult.error.message);
      return NextResponse.json(
        { error: `SSH connection failed: ${checkLockResult.error.message}` },
        { status: 502 }
      );
    }

    const lockOutput = checkLockResult.stdout.trim();
    if (lockOutput !== '__NO_LOCK__') {
      // Lock file exists — ingestion is already running
      let lockInfo: { startedAt?: string; pid?: string } = {};
      try {
        lockInfo = JSON.parse(lockOutput);
      } catch {
        // Lock file exists but isn't valid JSON — still treat as locked
      }
      return NextResponse.json(
        {
          error: 'Ingestion is already running',
          startedAt: lockInfo.startedAt || 'unknown',
          pid: lockInfo.pid || 'unknown',
        },
        { status: 409 }
      );
    }

    // Step 2: Launch ingestion in a detached screen session
    // The screen command will:
    //   a. Create the lock file with timestamp and PID
    //   b. Run the ingestion script, capturing output to a log file
    //   c. Delete the lock file when done (via trap, so it runs on success or failure)
    // Build the remote bash script that runs inside screen.
    // We use a heredoc-style approach: SSH sends a single-quoted command to screen,
    // and screen runs it via bash -c.
    // To avoid nested quote hell, we build the lock-file JSON with printf.
    const remoteScript = [
      `trap 'rm -f ${lockFile}' EXIT`,
      `printf '{\\\\n  "startedAt": "%s",\\\\n  "pid": "%s"\\\\n}\\\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" > ${lockFile}`,
      `export NVM_DIR="$HOME/.nvm"`,
      `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`,
      `cd ${APP_PATH}`,
      `npx tsx scripts/ingest-beverage-receipts.ts 2>&1 | tee ${logFile}`,
    ].join(' ; ');

    // Build the full command: either local screen or SSH-wrapped screen
    const screenCommand = isLocal
      ? `screen -dmS thirst-ingest bash -c '${remoteScript}'`
      : `${sshBase} "screen -dmS thirst-ingest bash -c '${remoteScript}'"`;

    console.log(`[Admin Ingestion API] Launching detached screen session ${isLocal ? 'locally' : 'via SSH'}...`);

    const launchResult = await new Promise<{ stdout: string; stderr: string; error: any }>((resolve) => {
      exec(
        screenCommand,
        { timeout: 30_000 },
        (error, stdout, stderr) => resolve({ stdout: stdout || '', stderr: stderr || '', error })
      );
    });

    if (launchResult.error) {
      console.error('[Admin Ingestion API] SSH screen launch failed:', launchResult.error.message);
      console.error('[Admin Ingestion API] stderr:', launchResult.stderr);
      return NextResponse.json(
        { error: `Failed to start ingestion: ${launchResult.error.message}` },
        { status: 500 }
      );
    }

    console.log('[Admin Ingestion API] Screen session launched successfully');

    return NextResponse.json({
      success: true,
      message: 'Ingestion started in background screen session. Use status check to monitor progress.',
      status: 'started',
    });
  } catch (error: any) {
    console.error('[Admin Ingestion API] PUT error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to trigger ingestion' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE handler - Check ingestion status (lock file, log tail, screen session)
// ---------------------------------------------------------------------------

export async function DELETE() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const { exec } = await import('child_process');
    const isLocal = isProductionServer();
    const sshBase = isLocal ? '' : `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
    const lockFile = `${APP_PATH}/data/.ingestion-lock.json`;
    const logFile = `${APP_PATH}/data/.ingestion-log.txt`;

    // Run all status checks in a single call
    const statusScript = [
      `echo '===LOCK_START===';`,
      `if [ -f ${lockFile} ]; then cat ${lockFile}; else echo '__NO_LOCK__'; fi;`,
      `echo '===LOCK_END===';`,
      `echo '===LOG_START===';`,
      `if [ -f ${logFile} ]; then tail -n 50 ${logFile}; else echo '__NO_LOG__'; fi;`,
      `echo '===LOG_END===';`,
      `echo '===SCREEN_START===';`,
      `screen -ls 2>/dev/null | grep thirst-ingest || echo '__NO_SCREEN__';`,
      `echo '===SCREEN_END===';`,
    ].join(' ');

    const statusCommand = isLocal
      ? `bash -c '${statusScript}'`
      : `${sshBase} "${statusScript}"`;

    console.log(`[Admin Ingestion API] Checking ingestion status ${isLocal ? 'locally' : 'via SSH'}...`);

    const statusResult = await new Promise<{ stdout: string; stderr: string; error: any }>((resolve) => {
      exec(
        statusCommand,
        { timeout: 15_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => resolve({ stdout: stdout || '', stderr: stderr || '', error })
      );
    });

    if (statusResult.error) {
      console.error('[Admin Ingestion API] SSH status check failed:', statusResult.error.message);
      return NextResponse.json(
        { error: `SSH connection failed: ${statusResult.error.message}` },
        { status: 502 }
      );
    }

    const output = statusResult.stdout;

    // Parse lock file section
    const lockMatch = output.match(/===LOCK_START===\s*([\s\S]*?)\s*===LOCK_END===/);
    const lockContent = lockMatch ? lockMatch[1].trim() : '__NO_LOCK__';
    let running = false;
    let startedAt: string | null = null;

    if (lockContent !== '__NO_LOCK__') {
      running = true;
      try {
        const lockInfo = JSON.parse(lockContent);
        startedAt = lockInfo.startedAt || null;
      } catch {
        // Lock file exists but isn't valid JSON
        startedAt = 'unknown';
      }
    }

    // Parse log file section
    const logMatch = output.match(/===LOG_START===\s*([\s\S]*?)\s*===LOG_END===/);
    const logContent = logMatch ? logMatch[1].trim() : '';
    const logOutput = logContent === '__NO_LOG__' ? '' : logContent;

    // Parse screen session section
    const screenMatch = output.match(/===SCREEN_START===\s*([\s\S]*?)\s*===SCREEN_END===/);
    const screenContent = screenMatch ? screenMatch[1].trim() : '__NO_SCREEN__';
    const screenActive = screenContent !== '__NO_SCREEN__';

    return NextResponse.json({
      running,
      output: logOutput,
      startedAt,
      screenActive,
    });
  } catch (error: any) {
    console.error('[Admin Ingestion API] DELETE error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check ingestion status' },
      { status: 500 }
    );
  }
}
