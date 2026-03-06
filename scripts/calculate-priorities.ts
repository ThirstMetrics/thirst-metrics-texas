#!/usr/bin/env tsx
/**
 * Calculate Priority Scores
 *
 * Computes component scores (revenue, growth, recency) for all permits
 * and upserts to customer_priorities in Supabase.
 *
 * Steps:
 *   1. Pull revenue data from DuckDB (total, recent 6mo, prior 6mo, growth)
 *   2. Pull activity data from Supabase (last activity, recent count)
 *   3. Compute percentile-based component scores (0-100)
 *   4. Compute balanced composite → priority_score
 *   5. Upsert to Supabase in batches of 1000
 *
 * Usage:
 *   npx tsx scripts/calculate-priorities.ts
 *
 * Environment variables:
 *   DUCKDB_PATH                    - path to DuckDB file
 *   NEXT_PUBLIC_SUPABASE_URL       - Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY      - Supabase service role key
 */

import * as fs from 'fs';
import * as path from 'path';
import { DuckDBInstance } from '@duckdb/node-api';
import chalk from 'chalk';
import { createClient } from '@supabase/supabase-js';

// Load .env.local manually (no dotenv dependency)
function loadEnvFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {}
}
loadEnvFile(path.join(process.cwd(), '.env.local'));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const UPSERT_BATCH_SIZE = 1000;

// DuckDB path resolution
function resolveDuckDBPath(): string {
  if (process.env.DUCKDB_PATH) {
    if (path.isAbsolute(process.env.DUCKDB_PATH)) {
      return process.env.DUCKDB_PATH;
    }
    return path.join(process.cwd(), process.env.DUCKDB_PATH);
  }
  const dataDirUpper = path.join(process.cwd(), 'Data', 'analytics.duckdb');
  const dataDirLower = path.join(process.cwd(), 'data', 'analytics.duckdb');
  if (fs.existsSync(dataDirUpper)) return dataDirUpper;
  if (fs.existsSync(dataDirLower)) return dataDirLower;
  return dataDirLower;
}

const DUCKDB_PATH = resolveDuckDBPath();

// Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(chalk.red('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// DuckDB helpers (@duckdb/node-api)
// ---------------------------------------------------------------------------

/**
 * Convert BigInt and Decimal values to plain numbers
 */
function convertValues(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (typeof obj === 'string' && !isNaN(Number(obj)) && obj.trim() !== '') {
    const num = Number(obj);
    if (!isNaN(num) && isFinite(num)) return num;
  }
  if (typeof obj === 'object' && !Array.isArray(obj) && obj !== null) {
    if ('width' in obj && 'scale' in obj && 'value' in obj) {
      const scale = Number(obj.scale);
      const value = typeof obj.value === 'bigint' ? Number(obj.value) : Number(obj.value);
      return value / Math.pow(10, scale);
    }
  }
  if (Array.isArray(obj)) return obj.map(convertValues);
  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertValues(value);
    }
    return converted;
  }
  return obj;
}

async function queryDuckDB<T = any>(instance: DuckDBInstance, sql: string): Promise<T[]> {
  const connection = await instance.connect();
  try {
    const result = await connection.runAndReadAll(sql);
    const rows = await result.getRowObjects();
    return convertValues(rows || []) as T[];
  } finally {
    if (typeof (connection as any).disconnectSync === 'function') {
      (connection as any).disconnectSync();
    } else if (typeof (connection as any).closeSync === 'function') {
      (connection as any).closeSync();
    }
  }
}

// ---------------------------------------------------------------------------
// Recency score mapping
// ---------------------------------------------------------------------------

function computeRecencyScore(daysSinceActivity: number | null): number {
  if (daysSinceActivity === null) return 10; // No activity ever → small non-zero value
  if (daysSinceActivity <= 7) return 100;
  if (daysSinceActivity <= 14) return 90;
  if (daysSinceActivity <= 30) return 75;
  if (daysSinceActivity <= 60) return 50;
  if (daysSinceActivity <= 90) return 25;
  return 0;
}

// ---------------------------------------------------------------------------
// Percentile rank helper
// ---------------------------------------------------------------------------

function computePercentileRanks(values: number[]): number[] {
  if (values.length === 0) return [];
  const indexed = values.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array(values.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].index] = (i / (indexed.length - 1 || 1)) * 100;
  }
  return ranks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ActivityData {
  last_activity_date: string | null;
  activity_count: number;
}

async function main() {
  console.log(chalk.cyan('\n📊 Starting Priority Score Calculation...\n'));

  if (!fs.existsSync(DUCKDB_PATH)) {
    console.error(chalk.red(`DuckDB file not found: ${DUCKDB_PATH}`));
    process.exit(1);
  }

  console.log(chalk.gray(`DuckDB path: ${DUCKDB_PATH}`));
  const startTime = Date.now();

  // Step 1: Pull revenue data from DuckDB
  console.log(chalk.yellow('\n📥 Step 1: Pulling revenue data from DuckDB...'));

  const instance = await DuckDBInstance.create(DUCKDB_PATH, { access_mode: 'READ_ONLY' });

  // Calculate date boundaries for recent/prior periods
  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const sixMoStr = sixMonthsAgo.toISOString().split('T')[0];
  const twelveMoStr = twelveMonthsAgo.toISOString().split('T')[0];

  const revenueSql = `
    SELECT
      tabc_permit_number,
      CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE) as total_revenue,
      CAST(COALESCE(SUM(CASE WHEN obligation_end_date >= '${sixMoStr}' THEN total_receipts ELSE 0 END), 0) AS DOUBLE) as recent_revenue,
      CAST(COALESCE(SUM(CASE WHEN obligation_end_date >= '${twelveMoStr}' AND obligation_end_date < '${sixMoStr}' THEN total_receipts ELSE 0 END), 0) AS DOUBLE) as prior_revenue,
      CAST(MAX(obligation_end_date) AS VARCHAR) as last_receipt_date
    FROM mixed_beverage_receipts
    GROUP BY tabc_permit_number
  `;

  const revenueRows = await queryDuckDB<{
    tabc_permit_number: string;
    total_revenue: number;
    recent_revenue: number;
    prior_revenue: number;
    last_receipt_date: string | null;
  }>(instance, revenueSql);

  console.log(chalk.green(`  ✓ Got revenue data for ${revenueRows.length} permits`));

  // Compute growth rates (capped at ±200%)
  const revenueData = revenueRows.map((r) => {
    let growthRate = 0;
    const totalRevenue = Number(r.total_revenue) || 0;
    const recentRevenue = Number(r.recent_revenue) || 0;
    const priorRevenue = Number(r.prior_revenue) || 0;

    if (priorRevenue > 0) {
      growthRate = (recentRevenue - priorRevenue) / priorRevenue;
      growthRate = Math.max(-2, Math.min(2, growthRate)); // Cap at ±200%
    } else if (recentRevenue > 0) {
      growthRate = 2; // New revenue with no prior → max growth
    }

    return {
      tabc_permit_number: r.tabc_permit_number,
      total_revenue: totalRevenue,
      recent_revenue: recentRevenue,
      prior_revenue: priorRevenue,
      growth_rate: growthRate,
      revenue_rank: 0, // will be set after sorting
      last_receipt_date: r.last_receipt_date,
    };
  });

  // Sort by total revenue desc and assign ranks
  revenueData.sort((a, b) => b.total_revenue - a.total_revenue);
  revenueData.forEach((r, i) => { r.revenue_rank = i + 1; });

  // Build permit→revenue lookup
  const revenueMap = new Map(revenueData.map(r => [r.tabc_permit_number, r]));

  // Step 2: Pull activity data from Supabase
  console.log(chalk.yellow('\n📥 Step 2: Pulling activity data from Supabase...'));

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysStr = ninetyDaysAgo.toISOString().split('T')[0];

  // Get activities — Supabase limits to 1000 rows by default, paginate
  const activityMap = new Map<string, ActivityData>();
  let actOffset = 0;
  const ACT_PAGE_SIZE = 1000;
  let totalActivities = 0;

  while (true) {
    const { data: activities, error: actError } = await supabase
      .from('sales_activities')
      .select('tabc_permit_number, activity_date')
      .order('activity_date', { ascending: false })
      .range(actOffset, actOffset + ACT_PAGE_SIZE - 1);

    if (actError) {
      console.error(chalk.red(`Failed to fetch activities: ${actError.message}`));
      break;
    }

    if (!activities || activities.length === 0) break;

    for (const act of activities) {
      const permit = act.tabc_permit_number;
      const existing = activityMap.get(permit);
      if (!existing) {
        activityMap.set(permit, {
          last_activity_date: act.activity_date,
          activity_count: act.activity_date >= ninetyDaysStr ? 1 : 0,
        });
      } else {
        if (act.activity_date >= ninetyDaysStr) {
          existing.activity_count++;
        }
      }
    }

    totalActivities += activities.length;
    if (activities.length < ACT_PAGE_SIZE) break;
    actOffset += ACT_PAGE_SIZE;
  }

  console.log(chalk.green(`  ✓ Got ${totalActivities} activity records for ${activityMap.size} permits`));

  // Step 3: Compute component scores
  console.log(chalk.yellow('\n🔢 Step 3: Computing component scores...'));

  const allPermits = Array.from(revenueMap.keys());

  // Revenue percentile ranks
  const totalRevenues = allPermits.map(p => revenueMap.get(p)!.total_revenue);
  const revenuePercentiles = computePercentileRanks(totalRevenues);

  // Growth percentile ranks
  const growthRates = allPermits.map(p => revenueMap.get(p)!.growth_rate);
  const growthPercentiles = computePercentileRanks(growthRates);

  // Build final records
  interface PriorityRecord {
    tabc_permit_number: string;
    priority_score: number;
    revenue_rank: number;
    growth_rate: number;
    last_activity_date: string | null;
    revenue_score: number;
    growth_score: number;
    recency_score: number;
    total_revenue: number;
    recent_revenue: number;
    activity_count: number;
    last_updated: string;
  }

  const records: PriorityRecord[] = [];
  const nowISO = new Date().toISOString();

  for (let i = 0; i < allPermits.length; i++) {
    const permit = allPermits[i];
    const rev = revenueMap.get(permit)!;
    const act = activityMap.get(permit);

    const revenueScore = Math.round(revenuePercentiles[i] * 100) / 100;
    const growthScore = Math.round(growthPercentiles[i] * 100) / 100;

    // Recency: days since last activity
    let daysSinceActivity: number | null = null;
    if (act?.last_activity_date) {
      const lastActDate = new Date(act.last_activity_date);
      daysSinceActivity = Math.floor((Date.now() - lastActDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    const recencyScore = computeRecencyScore(daysSinceActivity);

    // Balanced composite (default mode)
    const composite = revenueScore * 0.35 + growthScore * 0.40 + recencyScore * 0.25;
    const priorityScore = Math.round(composite * 100) / 100;

    records.push({
      tabc_permit_number: permit,
      priority_score: priorityScore,
      revenue_rank: rev.revenue_rank,
      growth_rate: Math.round(rev.growth_rate * 10000) / 10000,
      last_activity_date: act?.last_activity_date || null,
      revenue_score: revenueScore,
      growth_score: growthScore,
      recency_score: recencyScore,
      total_revenue: Math.round(rev.total_revenue * 100) / 100,
      recent_revenue: Math.round(rev.recent_revenue * 100) / 100,
      activity_count: act?.activity_count || 0,
      last_updated: nowISO,
    });
  }

  console.log(chalk.green(`  ✓ Computed scores for ${records.length} permits`));

  // Summary stats
  const avgRevenue = records.reduce((s, r) => s + r.revenue_score, 0) / records.length;
  const avgGrowth = records.reduce((s, r) => s + r.growth_score, 0) / records.length;
  const avgRecency = records.reduce((s, r) => s + r.recency_score, 0) / records.length;
  const avgComposite = records.reduce((s, r) => s + r.priority_score, 0) / records.length;
  const withActivity = records.filter(r => r.activity_count > 0).length;

  console.log(chalk.gray(`  Avg revenue_score:  ${avgRevenue.toFixed(1)}`));
  console.log(chalk.gray(`  Avg growth_score:   ${avgGrowth.toFixed(1)}`));
  console.log(chalk.gray(`  Avg recency_score:  ${avgRecency.toFixed(1)}`));
  console.log(chalk.gray(`  Avg composite:      ${avgComposite.toFixed(1)}`));
  console.log(chalk.gray(`  With activity (90d): ${withActivity}`));

  // Step 4: Upsert to Supabase in batches
  console.log(chalk.yellow(`\n💾 Step 4: Upserting ${records.length} records to Supabase...`));

  let totalUpserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
    const batch = records.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(records.length / UPSERT_BATCH_SIZE);

    const { error } = await supabase
      .from('customer_priorities')
      .upsert(batch, { onConflict: 'tabc_permit_number' });

    if (error) {
      console.error(chalk.red(`  ✗ Batch ${batchNum}/${totalBatches} failed: ${error.message}`));
      totalErrors += batch.length;
    } else {
      totalUpserted += batch.length;
      console.log(chalk.gray(`  Batch ${batchNum}/${totalBatches}: ${batch.length} records upserted`));
    }
  }

  // Step 5: Summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(chalk.green('\n✅ PRIORITY SCORING COMPLETE'));
  console.log(chalk.green(`   Total scored:  ${records.length}`));
  console.log(chalk.green(`   Upserted:      ${totalUpserted}`));
  console.log(chalk.green(`   Errors:        ${totalErrors}`));
  console.log(chalk.green(`   Duration:      ${duration}s\n`));
}

main().catch(err => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
