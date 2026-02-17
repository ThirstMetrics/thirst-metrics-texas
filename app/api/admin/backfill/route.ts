/**
 * Admin Backfill API Route
 * Triggers and monitors backfill ingestion (loading historical data backwards).
 *
 * POST   /api/admin/backfill         - Trigger backfill with { months: N }
 * DELETE /api/admin/backfill         - Check backfill status (lock file, log tail, screen session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';
import { isProductionServer, APP_PATH } from '@/lib/server/exec-remote';

export const dynamic = 'force-dynamic';

// SSH connection details (used when running from dev machine)
const SSH_HOST = '167.71.242.157';
const SSH_USER = 'master_nrbudqgaus';
const SSH_KEY_PATH = process.env.SSH_KEY_PATH || '~/.ssh/id_ed25519';

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
// GET handler - Get data boundaries (earliest/latest dates in DB)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    let earliestDate: string | null = null;
    let latestDate: string | null = null;
    let totalRecords = 0;

    try {
      const result = await query<{ earliest: string; latest: string; total: number }>(
        `SELECT
           CAST(MIN(obligation_end_date) AS VARCHAR) AS earliest,
           CAST(MAX(obligation_end_date) AS VARCHAR) AS latest,
           CAST(COUNT(*) AS DOUBLE) AS total
         FROM mixed_beverage_receipts`
      );
      earliestDate = result[0]?.earliest || null;
      latestDate = result[0]?.latest || null;
      totalRecords = result[0]?.total || 0;
    } catch (dbError: any) {
      console.error('[Admin Backfill API] DuckDB query error:', dbError?.message ?? dbError);
    }

    return NextResponse.json({
      earliestDate,
      latestDate,
      totalRecords,
    });
  } catch (error: any) {
    console.error('[Admin Backfill API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch data boundaries' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler - Trigger backfill via detached screen session
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Parse request body for months parameter
    let months = 6;
    try {
      const body = await request.json();
      if (body.months && typeof body.months === 'number' && body.months > 0 && body.months <= 120) {
        months = body.months;
      }
    } catch {
      // Default to 6 months if no body
    }

    const { exec } = await import('child_process');
    const isLocal = isProductionServer();
    const sshBase = isLocal ? '' : `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
    const lockFile = `${APP_PATH}/data/.backfill-lock.json`;
    const logFile = `${APP_PATH}/data/.backfill-log.txt`;

    // Step 1: Check if a lock file already exists (backfill already running)
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
      console.error('[Admin Backfill API] SSH lock check failed:', checkLockResult.error.message);
      return NextResponse.json(
        { error: `SSH connection failed: ${checkLockResult.error.message}` },
        { status: 502 }
      );
    }

    const lockOutput = checkLockResult.stdout.trim();
    if (lockOutput !== '__NO_LOCK__') {
      let lockInfo: { startedAt?: string; pid?: string } = {};
      try {
        lockInfo = JSON.parse(lockOutput);
      } catch {
        // Lock file exists but isn't valid JSON
      }
      return NextResponse.json(
        {
          error: 'Backfill is already running',
          startedAt: lockInfo.startedAt || 'unknown',
          pid: lockInfo.pid || 'unknown',
        },
        { status: 409 }
      );
    }

    // Step 2: Launch backfill in a detached screen session
    const remoteScript = [
      `trap 'rm -f ${lockFile}' EXIT`,
      `printf '{\\\\n  "startedAt": "%s",\\\\n  "pid": "%s"\\\\n}\\\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" > ${lockFile}`,
      `export NVM_DIR="$HOME/.nvm"`,
      `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`,
      `cd ${APP_PATH}`,
      // Stop Next.js to release DuckDB file lock (DuckDB only allows one writer)
      `echo "Stopping Next.js server to release DuckDB lock..."`,
      `pkill -f "next start" 2>/dev/null`,
      `sleep 3`,
      `npx tsx scripts/ingest-backfill.ts --months ${months} 2>&1 | tee ${logFile}`,
      // Restart Next.js after backfill completes
      `echo "Restarting Next.js server..."`,
      `cd ${APP_PATH}`,
      `nohup node node_modules/.bin/next start -p 3000 > /tmp/next-server.log 2>&1 &`,
      `sleep 2`,
      `echo "Next.js server restarted (PID $!)"`,
    ].join(' ; ');

    const screenCommand = isLocal
      ? `screen -dmS thirst-backfill bash -c '${remoteScript}'`
      : `${sshBase} "screen -dmS thirst-backfill bash -c '${remoteScript}'"`;

    console.log(`[Admin Backfill API] Launching backfill screen session (${months} months) ${isLocal ? 'locally' : 'via SSH'}...`);

    const launchResult = await new Promise<{ stdout: string; stderr: string; error: any }>((resolve) => {
      exec(
        screenCommand,
        { timeout: 30_000 },
        (error, stdout, stderr) => resolve({ stdout: stdout || '', stderr: stderr || '', error })
      );
    });

    if (launchResult.error) {
      console.error('[Admin Backfill API] SSH screen launch failed:', launchResult.error.message);
      return NextResponse.json(
        { error: `Failed to start backfill: ${launchResult.error.message}` },
        { status: 500 }
      );
    }

    console.log('[Admin Backfill API] Screen session launched successfully');

    return NextResponse.json({
      success: true,
      message: `Backfill started for ${months} months in background screen session.`,
      months,
      status: 'started',
    });
  } catch (error: any) {
    console.error('[Admin Backfill API] POST error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to trigger backfill' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE handler - Check backfill status (lock file, log tail, screen session)
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
    const lockFile = `${APP_PATH}/data/.backfill-lock.json`;
    const logFile = `${APP_PATH}/data/.backfill-log.txt`;

    const statusScript = [
      `echo '===LOCK_START===';`,
      `if [ -f ${lockFile} ]; then cat ${lockFile}; else echo '__NO_LOCK__'; fi;`,
      `echo '===LOCK_END===';`,
      `echo '===LOG_START===';`,
      `if [ -f ${logFile} ]; then tail -n 50 ${logFile}; else echo '__NO_LOG__'; fi;`,
      `echo '===LOG_END===';`,
      `echo '===SCREEN_START===';`,
      `screen -ls 2>/dev/null | grep thirst-backfill || echo '__NO_SCREEN__';`,
      `echo '===SCREEN_END===';`,
    ].join(' ');

    const statusCommand = isLocal
      ? `bash -c '${statusScript}'`
      : `${sshBase} "${statusScript}"`;

    const statusResult = await new Promise<{ stdout: string; stderr: string; error: any }>((resolve) => {
      exec(
        statusCommand,
        { timeout: 15_000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => resolve({ stdout: stdout || '', stderr: stderr || '', error })
      );
    });

    if (statusResult.error) {
      return NextResponse.json(
        { error: `SSH connection failed: ${statusResult.error.message}` },
        { status: 502 }
      );
    }

    const output = statusResult.stdout;

    // Parse lock file
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
        startedAt = 'unknown';
      }
    }

    // Parse log
    const logMatch = output.match(/===LOG_START===\s*([\s\S]*?)\s*===LOG_END===/);
    const logContent = logMatch ? logMatch[1].trim() : '';
    const logOutput = logContent === '__NO_LOG__' ? '' : logContent;

    // Parse screen
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
    console.error('[Admin Backfill API] DELETE error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check backfill status' },
      { status: 500 }
    );
  }
}
