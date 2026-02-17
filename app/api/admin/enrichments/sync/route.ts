/**
 * Admin Enrichment Sync API Route
 * Triggers sync of enrichments from Supabase to DuckDB via SSH.
 *
 * POST   /api/admin/enrichments/sync - Trigger sync script via SSH
 * DELETE /api/admin/enrichments/sync - Check sync status
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
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
// POST handler - Trigger DuckDB sync via SSH
// ---------------------------------------------------------------------------

export async function POST() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Check pending count first
    const serviceClient = createServiceClient();
    const { count } = await serviceClient
      .from('location_enrichments_pg')
      .select('*', { count: 'exact', head: true })
      .eq('synced_to_duckdb', false);

    if (!count || count === 0) {
      return NextResponse.json({
        message: 'No enrichments pending sync',
        synced: 0,
      });
    }

    const { exec } = await import('child_process');
    const isLocal = isProductionServer();
    const sshBase = isLocal ? '' : `ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${SSH_HOST}`;
    const lockFile = `${APP_PATH}/data/.enrichment-sync-lock.json`;
    const logFile = `${APP_PATH}/data/.enrichment-sync-log.txt`;

    // Check if sync is already running
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
      return NextResponse.json(
        { error: `SSH connection failed: ${checkLockResult.error.message}` },
        { status: 502 }
      );
    }

    const lockOutput = checkLockResult.stdout.trim();
    if (lockOutput !== '__NO_LOCK__') {
      return NextResponse.json(
        { error: 'Enrichment sync is already running', status: 'running' },
        { status: 409 }
      );
    }

    // Launch sync script in a detached screen session
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
      `npx tsx scripts/sync-enrichments-to-duckdb.ts 2>&1 | tee ${logFile}`,
      // Restart Next.js after sync completes
      `echo "Restarting Next.js server..."`,
      `cd ${APP_PATH}`,
      `nohup node node_modules/.bin/next start -p 3000 > /tmp/next-server.log 2>&1 &`,
      `sleep 2`,
      `echo "Next.js server restarted (PID $!)"`,
    ].join(' ; ');

    const screenCommand = isLocal
      ? `screen -dmS thirst-enrich-sync bash -c '${remoteScript}'`
      : `${sshBase} "screen -dmS thirst-enrich-sync bash -c '${remoteScript}'"`;

    console.log(`[Enrichment Sync API] Launching sync screen session ${isLocal ? 'locally' : 'via SSH'}...`);

    const launchResult = await new Promise<{ stdout: string; stderr: string; error: any }>((resolve) => {
      exec(
        screenCommand,
        { timeout: 30_000 },
        (error, stdout, stderr) => resolve({ stdout: stdout || '', stderr: stderr || '', error })
      );
    });

    if (launchResult.error) {
      return NextResponse.json(
        { error: `Failed to start sync: ${launchResult.error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Sync started for ${count} pending enrichment(s)`,
      pendingCount: count,
      status: 'started',
    });
  } catch (error: any) {
    console.error('[Enrichment Sync API] POST error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to trigger sync' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE handler - Check sync status
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
    const lockFile = `${APP_PATH}/data/.enrichment-sync-lock.json`;
    const logFile = `${APP_PATH}/data/.enrichment-sync-log.txt`;

    const statusScript = [
      `echo '===LOCK_START===';`,
      `if [ -f ${lockFile} ]; then cat ${lockFile}; else echo '__NO_LOCK__'; fi;`,
      `echo '===LOCK_END===';`,
      `echo '===LOG_START===';`,
      `if [ -f ${logFile} ]; then tail -n 30 ${logFile}; else echo '__NO_LOG__'; fi;`,
      `echo '===LOG_END===';`,
      `echo '===SCREEN_START===';`,
      `screen -ls 2>/dev/null | grep thirst-enrich-sync || echo '__NO_SCREEN__';`,
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

    // Get pending count from Supabase
    const serviceClient = createServiceClient();
    const { count: pendingCount } = await serviceClient
      .from('location_enrichments_pg')
      .select('*', { count: 'exact', head: true })
      .eq('synced_to_duckdb', false);

    return NextResponse.json({
      running,
      output: logOutput,
      startedAt,
      screenActive,
      pendingCount: pendingCount || 0,
    });
  } catch (error: any) {
    console.error('[Enrichment Sync API] DELETE error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check sync status' },
      { status: 500 }
    );
  }
}
