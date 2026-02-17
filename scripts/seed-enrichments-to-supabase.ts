#!/usr/bin/env tsx
/**
 * Seed Enrichments to Supabase
 * One-time migration: reads existing location_enrichments from DuckDB
 * and inserts into Supabase location_enrichments_pg table.
 *
 * Uses @duckdb/node-api (same as Next.js app) for local dev,
 * or old duckdb package on production server.
 *
 * Usage:
 *   npx tsx scripts/seed-enrichments-to-supabase.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';
import { query } from '../lib/duckdb/connection';

// Load .env.local manually since scripts don't go through Next.js
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log(chalk.gray('   Loaded .env.local'));
}

// ============================================
// Config
// ============================================

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
// Main
// ============================================

async function seedEnrichments() {
  console.log(chalk.blue('\n🌱 SEED: DuckDB location_enrichments → Supabase location_enrichments_pg\n'));

  // Step 1: Read from DuckDB using the app's read-only connection
  console.log(chalk.cyan('📥 Reading enrichments from DuckDB...'));

  const enrichments = await query<{
    tabc_permit_number: string;
    clean_dba_name: string | null;
    ownership_group: string | null;
    industry_segment: string | null;
    clean_up_notes: string | null;
    last_updated: string | null;
  }>(`SELECT tabc_permit_number, clean_dba_name, ownership_group, industry_segment, clean_up_notes,
      CAST(last_updated AS VARCHAR) as last_updated
      FROM location_enrichments`);

  console.log(chalk.green(`   Found ${enrichments.length} enrichment records in DuckDB\n`));

  if (enrichments.length === 0) {
    console.log(chalk.yellow('   No enrichments to seed. Exiting.'));
    return;
  }

  // Step 2: Insert into Supabase
  console.log(chalk.cyan('📤 Inserting into Supabase location_enrichments_pg...'));

  const supabase = getSupabaseClient();
  let inserted = 0;
  let errors = 0;

  // Process in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < enrichments.length; i += BATCH_SIZE) {
    const batch = enrichments.slice(i, i + BATCH_SIZE).map(e => ({
      tabc_permit_number: e.tabc_permit_number,
      clean_dba_name: e.clean_dba_name || null,
      ownership_group: e.ownership_group || null,
      industry_segment: e.industry_segment || null,
      clean_up_notes: e.clean_up_notes || null,
      source: 'import' as const,
      synced_to_duckdb: true, // Already in DuckDB
      geocoded: false,
      created_at: new Date().toISOString(),
      updated_at: e.last_updated || new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('location_enrichments_pg')
      .upsert(batch, { onConflict: 'tabc_permit_number', ignoreDuplicates: true });

    if (error) {
      console.error(chalk.red(`   Batch ${Math.floor(i / BATCH_SIZE) + 1} error: ${error.message}`));
      errors += batch.length;
    } else {
      inserted += batch.length;
      if (inserted % 1000 === 0 || i + BATCH_SIZE >= enrichments.length) {
        console.log(chalk.gray(`   Progress: ${inserted}/${enrichments.length} records`));
      }
    }
  }

  // Summary
  console.log(chalk.green('\n✅ SEED COMPLETE'));
  console.log(chalk.cyan(`   Inserted: ${inserted} records`));
  if (errors > 0) {
    console.log(chalk.yellow(`   Errors: ${errors}`));
  }
}

seedEnrichments().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
