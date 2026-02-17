#!/usr/bin/env tsx
/**
 * Sync Enrichments from Supabase to DuckDB
 * Reads location_enrichments_pg from Supabase and writes to DuckDB location_enrichments.
 * Also syncs geocoded coordinates to DuckDB location_coordinates.
 *
 * Usage:
 *   npx tsx scripts/sync-enrichments-to-duckdb.ts          # Sync only unsynced records
 *   npx tsx scripts/sync-enrichments-to-duckdb.ts --full    # Full sync (all records)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

// ============================================
// Config
// ============================================

const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? 'data' : 'Data';
const DUCKDB_PATH = process.env.DUCKDB_PATH
  ? (path.isAbsolute(process.env.DUCKDB_PATH)
      ? process.env.DUCKDB_PATH
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), dataDir, 'analytics.duckdb');

const LOCK_FILE = path.join(process.cwd(), dataDir, '.enrichment-sync-lock.json');
const FULL_SYNC = process.argv.includes('--full');

// Supabase client for scripts (uses env vars directly)
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================
// Lock File Management
// ============================================

function writeLock() {
  const lockData = {
    startedAt: new Date().toISOString(),
    pid: String(process.pid),
  };
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData, null, 2));
}

function removeLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    console.warn(chalk.yellow('Warning: Could not remove lock file'));
  }
}

// ============================================
// Main Sync
// ============================================

async function syncEnrichments() {
  console.log(chalk.blue('\n🔄 ENRICHMENT SYNC: Supabase → DuckDB'));
  console.log(chalk.gray(`   Mode: ${FULL_SYNC ? 'Full sync (all records)' : 'Incremental (unsynced only)'}`));
  console.log(chalk.gray(`   DuckDB: ${DUCKDB_PATH}\n`));

  writeLock();

  const supabase = getSupabaseClient();

  // Step 1: Fetch enrichments from Supabase
  console.log(chalk.cyan('📥 Fetching enrichments from Supabase...'));

  let query = supabase
    .from('location_enrichments_pg')
    .select('*');

  if (!FULL_SYNC) {
    query = query.eq('synced_to_duckdb', false);
  }

  const { data: enrichments, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(`Supabase fetch error: ${fetchError.message}`);
  }

  if (!enrichments || enrichments.length === 0) {
    console.log(chalk.green('✅ No enrichments to sync'));
    removeLock();
    return;
  }

  console.log(chalk.green(`   Found ${enrichments.length} enrichment(s) to sync\n`));

  // Step 2: Open DuckDB for writing
  console.log(chalk.cyan('🔌 Connecting to DuckDB (write mode)...'));
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  // Progress bar
  const progressBar = new cliProgress.SingleBar({
    format: '🔄 Syncing: {bar} {percentage}% | {value}/{total} | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  }, cliProgress.Presets.shades_classic);

  let synced = 0;
  let errors = 0;
  const syncedPermits: string[] = [];

  try {
    progressBar.start(enrichments.length, 0);

    for (const e of enrichments) {
      try {
        // Use the committed fields (clean_dba_name) if available, else AI suggestions
        const dbaName = e.clean_dba_name || e.ai_suggested_dba_name || null;
        const ownership = e.ownership_group || e.ai_suggested_ownership || null;
        const segment = e.industry_segment || e.ai_suggested_segment || null;

        // Upsert into DuckDB location_enrichments
        // First try DELETE + INSERT since DuckDB doesn't have native UPSERT
        await runQuery(conn, 'DELETE FROM location_enrichments WHERE tabc_permit_number = ?', [e.tabc_permit_number]);
        await runQuery(
          conn,
          `INSERT INTO location_enrichments (
            tabc_permit_number, clean_dba_name, ownership_group,
            industry_segment, clean_up_notes, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            e.tabc_permit_number,
            dbaName,
            ownership,
            segment,
            e.clean_up_notes || null,
            new Date().toISOString(),
          ]
        );

        synced++;
        syncedPermits.push(e.tabc_permit_number);
        progressBar.update(synced);
      } catch (err: any) {
        errors++;
        console.error(chalk.red(`\n✗ Error syncing ${e.tabc_permit_number}: ${err?.message}`));
      }
    }

    progressBar.stop();

    // Step 3: Sync geocoded coordinates
    console.log(chalk.cyan('\n🌍 Syncing geocoded coordinates...'));

    const { data: coordinates, error: coordError } = await supabase
      .from('location_coordinates')
      .select('*');

    let coordsSynced = 0;
    if (coordinates && !coordError && coordinates.length > 0) {
      // Build permit -> coordinate mapping
      // The Supabase location_coordinates table uses address_hash as key
      // We need to map back to tabc_permit_number
      // For now, sync any coordinates we have for the permits we just enriched
      console.log(chalk.gray(`   Found ${coordinates.length} cached coordinates in Supabase`));

      // Get addresses for enriched permits from DuckDB
      for (const permit of syncedPermits) {
        try {
          // Check if already geocoded in DuckDB
          const existing = await new Promise<any[]>((resolve, reject) => {
            conn.all(
              'SELECT 1 FROM location_coordinates WHERE tabc_permit_number = ?',
              permit,
              (err: any, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          if (existing.length > 0) continue; // Already geocoded

          // Get address from mixed_beverage_receipts
          const addressRows = await new Promise<any[]>((resolve, reject) => {
            conn.all(
              `SELECT location_address, location_city, location_zip
               FROM mixed_beverage_receipts
               WHERE tabc_permit_number = ?
               LIMIT 1`,
              permit,
              (err: any, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows || []);
              }
            );
          });

          if (addressRows.length === 0) continue;

          const addr = addressRows[0];
          const fullAddress = `${addr.location_address}, ${addr.location_city}, TX ${addr.location_zip}`;

          // Find matching coordinate in Supabase cache by address
          const matchingCoord = coordinates.find(c =>
            c.formatted_address && (
              c.formatted_address.toLowerCase().includes(addr.location_address?.toLowerCase() || '') ||
              fullAddress.toLowerCase().includes(c.formatted_address?.toLowerCase() || '')
            )
          );

          if (matchingCoord) {
            await runQuery(conn, 'DELETE FROM location_coordinates WHERE tabc_permit_number = ?', [permit]);
            await runQuery(
              conn,
              `INSERT INTO location_coordinates (
                tabc_permit_number, latitude, longitude,
                geocoded_at, geocode_source, geocode_quality
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                permit,
                matchingCoord.latitude,
                matchingCoord.longitude,
                new Date().toISOString(),
                'mapbox',
                'exact',
              ]
            );
            coordsSynced++;
          }
        } catch {
          // Non-fatal
        }
      }
    }

    // Step 4: Mark synced in Supabase
    console.log(chalk.cyan('\n📝 Marking records as synced in Supabase...'));

    if (syncedPermits.length > 0) {
      // Batch update in chunks of 100
      for (let i = 0; i < syncedPermits.length; i += 100) {
        const batch = syncedPermits.slice(i, i + 100);
        const { error: updateError } = await supabase
          .from('location_enrichments_pg')
          .update({ synced_to_duckdb: true })
          .in('tabc_permit_number', batch);

        if (updateError) {
          console.error(chalk.red(`   Error marking batch as synced: ${updateError.message}`));
        }
      }
    }

    // Summary
    console.log(chalk.green('\n✅ ENRICHMENT SYNC COMPLETE'));
    console.log(chalk.cyan(`   Enrichments synced: ${synced}`));
    console.log(chalk.cyan(`   Coordinates synced: ${coordsSynced}`));
    if (errors > 0) {
      console.log(chalk.yellow(`   Errors: ${errors}`));
    }

  } catch (error: any) {
    progressBar.stop();
    console.error(chalk.red(`\n✗ Fatal error: ${error?.message}`));
    throw error;
  } finally {
    await closeConnection(conn);
    await closeDatabase(db);
    removeLock();
  }
}

// ============================================
// Graceful shutdown
// ============================================

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠ Received SIGINT, cleaning up...'));
  removeLock();
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠ Received SIGTERM, cleaning up...'));
  removeLock();
  process.exit(1);
});

// Run
syncEnrichments().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  removeLock();
  process.exit(1);
});
