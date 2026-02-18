#!/usr/bin/env tsx
/**
 * Backfill Ingestion Script
 * Loads historical Texas beverage receipt data BACKWARDS from what's already in the database.
 *
 * Queries DuckDB for the earliest obligation_end_date, then fetches N months of data
 * prior to that date from the Texas.gov API.
 *
 * Features:
 *   - Checkpoint/resume: saves progress after each batch, resumes on restart
 *   - Exponential backoff retries on fetch failure (up to 3 retries)
 *   - 60-second fetch timeout via AbortController
 *   - Graceful shutdown on SIGINT/SIGTERM
 *   - Error tolerance: skips bad records, aborts after 100 total errors
 *   - Memory management: releases batch arrays, logs heap usage every 5 batches
 *   - Date-range scoped API queries via $where for efficiency
 *
 * Usage:
 *   npx tsx scripts/ingest-backfill.ts                     # backfill 6 months
 *   npx tsx scripts/ingest-backfill.ts --months 3          # backfill 3 months
 *   npx tsx scripts/ingest-backfill.ts --months 12         # backfill 12 months
 *   npx tsx scripts/ingest-backfill.ts --months 3 --fresh  # ignore checkpoint
 *
 * Environment variables:
 *   INGEST_BATCH_SIZE       - records per API fetch (default: 5000)
 *   TEXAS_API_BASE_URL      - API endpoint
 *   TEXAS_APP_TOKEN         - Socrata app token
 *   TEXAS_GOV_APP_TOKEN     - alternate app token env var
 *   DUCKDB_PATH             - path to DuckDB file
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { format, subMonths } from 'date-fns';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseMonthsArg(): number {
  const idx = process.argv.indexOf('--months');
  if (idx !== -1 && process.argv[idx + 1]) {
    const val = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return 6; // default
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.TEXAS_API_BASE_URL || 'https://data.texas.gov/resource/naix-2893.json';
const APP_TOKEN = process.env.TEXAS_APP_TOKEN || process.env.TEXAS_GOV_APP_TOKEN || '';
// Resolve the production DuckDB path
const DUCKDB_PRODUCTION_PATH = process.env.DUCKDB_PATH
  ? (path.isAbsolute(process.env.DUCKDB_PATH)
      ? process.env.DUCKDB_PATH
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

// Write to a staging copy to avoid file lock conflicts with the Next.js server
const DUCKDB_STAGING_PATH = DUCKDB_PRODUCTION_PATH.replace(/\.duckdb$/, '-staging.duckdb');
const DUCKDB_PATH = DUCKDB_STAGING_PATH;
const MONTHS_TO_FETCH = parseMonthsArg();
const BATCH_SIZE = parseInt(process.env.INGEST_BATCH_SIZE || '5000', 10);

const FETCH_TIMEOUT_MS = 60_000;          // 60 seconds per fetch
const MAX_RETRIES = 3;                     // retries per fetch attempt
const BACKOFF_BASE_MS = 2_000;             // base delay for exponential backoff
const BACKOFF_EXPONENT = 2;                // exponent multiplier
const MAX_ERRORS = 100;                    // abort if this many record-level errors
const MEMORY_LOG_INTERVAL = 5;             // log memory usage every N batches

const CHECKPOINT_PATH = path.join(process.cwd(), 'data', '.backfill-checkpoint.json');
const LOCK_FILE_PATH = path.join(process.cwd(), 'data', '.backfill-lock.json');
const FRESH_FLAG = process.argv.includes('--fresh');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BeverageReceipt {
  tabc_permit_number?: string;
  obligation_end_date_yyyymmdd?: string;
  responsibility_begin_date_yyyymmdd?: string;
  responsibility_end_date_yyyymmdd?: string;
  location_county?: string;
  location_name?: string;
  location_address?: string;
  location_city?: string;
  location_state?: string;
  location_zip?: string;
  liquor_receipts?: string | number;
  wine_receipts?: string | number;
  beer_receipts?: string | number;
  cover_charge_receipts?: string | number;
  total_receipts?: string | number;
}

interface Checkpoint {
  offset: number;
  totalInserted: number;
  totalModified: number;
  errors: number;
  startedAt: string;
  lastBatchAt: string;
  windowStart: string;  // ISO date for the start of the backfill window
  windowEnd: string;    // ISO date for the end of the backfill window (earliest in DB)
}

interface LockFileData {
  startedAt: string;
  pid: number;
}

// ---------------------------------------------------------------------------
// Graceful shutdown handling
// ---------------------------------------------------------------------------

let shutdownRequested = false;

function requestShutdown(signal: string) {
  if (shutdownRequested) return; // only handle once
  shutdownRequested = true;
  console.log(chalk.yellow(`\n   Received ${signal} — graceful shutdown requested. Finishing current record...`));
  deleteLockFile();
}

process.on('SIGINT', () => requestShutdown('SIGINT'));
process.on('SIGTERM', () => requestShutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------

function loadCheckpoint(): Checkpoint | null {
  if (FRESH_FLAG) {
    console.log(chalk.yellow('   --fresh flag detected, ignoring any existing checkpoint'));
    deleteCheckpoint();
    return null;
  }
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      const raw = fs.readFileSync(CHECKPOINT_PATH, 'utf-8');
      const cp: Checkpoint = JSON.parse(raw);
      console.log(chalk.yellow(`   Checkpoint found: resuming from offset ${cp.offset} (${cp.totalInserted} inserted, ${cp.totalModified} modified, ${cp.errors} errors)`));
      console.log(chalk.gray(`   Window: ${cp.windowStart} to ${cp.windowEnd}`));
      console.log(chalk.gray(`   Started at: ${cp.startedAt} | Last batch: ${cp.lastBatchAt}`));
      return cp;
    }
  } catch (err) {
    console.log(chalk.yellow(`   Warning: could not read checkpoint file, starting fresh. Error: ${err}`));
  }
  return null;
}

function saveCheckpoint(cp: Checkpoint): void {
  try {
    const dir = path.dirname(CHECKPOINT_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2), 'utf-8');
  } catch (err) {
    console.error(chalk.red(`   Warning: could not save checkpoint: ${err}`));
  }
}

function deleteCheckpoint(): void {
  try {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      fs.unlinkSync(CHECKPOINT_PATH);
    }
  } catch (err) {
    console.error(chalk.red(`   Warning: could not delete checkpoint file: ${err}`));
  }
}

// ---------------------------------------------------------------------------
// Lock file helpers
// ---------------------------------------------------------------------------

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function checkExistingLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
      const lock: LockFileData = JSON.parse(raw);

      if (isProcessRunning(lock.pid)) {
        console.error(chalk.red(`\n   ABORT: Another backfill process is already running (PID ${lock.pid}, started at ${lock.startedAt}).`));
        console.error(chalk.red(`   If this is incorrect, delete the lock file manually: ${LOCK_FILE_PATH}`));
        process.exit(1);
      } else {
        console.log(chalk.yellow(`   WARNING: Stale lock file found (PID ${lock.pid} is no longer running, started at ${lock.startedAt}).`));
        console.log(chalk.yellow(`   Removing stale lock and proceeding...`));
        deleteLockFile();
      }
    }
  } catch (err) {
    console.log(chalk.yellow(`   Warning: could not read lock file, proceeding. Error: ${err}`));
    // If we can't read it, try to delete it and proceed
    deleteLockFile();
  }
}

function createLockFile(): void {
  try {
    const dir = path.dirname(LOCK_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const lock: LockFileData = {
      startedAt: new Date().toISOString(),
      pid: process.pid
    };
    fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(lock, null, 2), 'utf-8');
    console.log(chalk.gray(`   Lock file created: PID ${process.pid}`));
  } catch (err) {
    console.error(chalk.red(`   Warning: could not create lock file: ${err}`));
  }
}

function deleteLockFile(): void {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      fs.unlinkSync(LOCK_FILE_PATH);
    }
  } catch (err) {
    console.error(chalk.red(`   Warning: could not delete lock file: ${err}`));
  }
}

// ---------------------------------------------------------------------------
// Memory logging
// ---------------------------------------------------------------------------

function logMemoryUsage(batchNumber: number): void {
  const mem = process.memoryUsage();
  const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(chalk.gray(
    `   Memory (batch #${batchNumber}): heap ${toMB(mem.heapUsed)}/${toMB(mem.heapTotal)} MB, rss ${toMB(mem.rss)} MB`
  ));
}

// ---------------------------------------------------------------------------
// Fetch with timeout + exponential backoff retries + $where date filter
// ---------------------------------------------------------------------------

async function fetchFromAPI(
  offset: number,
  limit: number,
  startFilter: string,
  endFilter: string
): Promise<BeverageReceipt[]> {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('$limit', limit.toString());
  url.searchParams.set('$offset', offset.toString());
  url.searchParams.set('$order', 'obligation_end_date_yyyymmdd ASC');
  url.searchParams.set(
    '$where',
    `obligation_end_date_yyyymmdd >= '${startFilter}' AND obligation_end_date_yyyymmdd < '${endFilter}'`
  );
  if (APP_TOKEN) {
    url.searchParams.set('$$app_token', APP_TOKEN);
  }

  const fullUrl = url.toString();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      if (attempt > 1) {
        const delay = BACKOFF_BASE_MS * Math.pow(BACKOFF_EXPONENT, attempt - 1); // 2s, 8s, 32s
        console.log(chalk.yellow(`   Retry ${attempt}/${MAX_RETRIES} after ${delay / 1000}s delay...`));
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      console.log(chalk.gray(`   Fetching: offset=${offset} limit=${limit} (attempt ${attempt}/${MAX_RETRIES})`));

      const response = await fetch(fullUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      return await response.json() as BeverageReceipt[];
    } catch (error: any) {
      clearTimeout(timeoutId);

      const isTimeout = error.name === 'AbortError';
      const label = isTimeout ? 'Fetch timed out' : `Fetch failed: ${error.message || error}`;
      console.error(chalk.red(`   ${label} (attempt ${attempt}/${MAX_RETRIES})`));

      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to fetch after ${MAX_RETRIES} attempts at offset ${offset}: ${error.message || error}`);
      }
      // loop continues to next retry
    }
  }

  // Should never reach here, but satisfy TypeScript
  throw new Error(`Unexpected: exhausted retries without returning or throwing`);
}

// ---------------------------------------------------------------------------
// Date / money parsing
// ---------------------------------------------------------------------------

/**
 * Parse date from multiple formats:
 *   - ISO timestamp: "2026-02-28T00:00:00.000"
 *   - YYYYMMDD:      "20260228"
 *   - ISO date:      "2026-02-28"
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const cleaned = dateStr.trim();

  // Handle YYYYMMDD format (e.g., "20250125")
  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    const year = parseInt(cleaned.substring(0, 4), 10);
    const month = parseInt(cleaned.substring(4, 6), 10) - 1;
    const day = parseInt(cleaned.substring(6, 8), 10);
    return new Date(year, month, day);
  }

  // Handle ISO timestamp "2026-02-28T00:00:00.000" or ISO date "2026-02-28"
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    const parsed = new Date(cleaned);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  // Fallback: try standard Date parsing
  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Parse money value (strip $ and commas, or handle numeric values) */
function parseMoney(value: string | number | undefined): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '$0') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/** Coerce a DuckDB value (DECIMAL, BigInt, string, number, or null) to a plain JS number for comparison */
function toNum(val: any): number {
  if (val === null || val === undefined) return 0;
  // DuckDB DECIMAL may come back as an object with .value (BigInt) and .scale
  if (typeof val === 'object' && val !== null && 'value' in val && 'scale' in val) {
    return Number(val.value) / Math.pow(10, val.scale);
  }
  // BigInt
  if (typeof val === 'bigint') return Number(val);
  // String (e.g., "12345.67")
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  // Already a number
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Process a single record — insert or update in DuckDB
// ---------------------------------------------------------------------------

async function processRecord(
  record: BeverageReceipt,
  conn: duckdb.Connection,
  isFirstRecord: boolean = false
): Promise<{ inserted: boolean; modified: boolean; unchanged: boolean }> {
  const permitNumber = (record as any).tabc_permit_number;
  const obligationDateStr = (record as any).obligation_end_date_yyyymmdd;

  if (isFirstRecord) {
    console.log(chalk.yellow('\n   First record in batch:'));
    console.log(chalk.gray(`   Raw record keys: ${Object.keys(record).join(', ')}`));
    console.log(chalk.gray(`   Permit Number: ${permitNumber || 'MISSING'}`));
    console.log(chalk.gray(`   Obligation Date: ${obligationDateStr || 'MISSING'}`));
    console.log(chalk.gray(`   Full record sample: ${JSON.stringify(record).substring(0, 200)}...`));
  }

  if (!permitNumber || !obligationDateStr) {
    if (isFirstRecord) {
      console.log(chalk.red(`   Skipping: Missing permitNumber or obligation_end_date_yyyymmdd`));
    }
    return { inserted: false, modified: false, unchanged: false };
  }

  const obligationDate = parseDate(obligationDateStr);
  if (!obligationDate) {
    if (isFirstRecord) {
      console.log(chalk.red(`   Skipping: Invalid date format: ${obligationDateStr}`));
    }
    return { inserted: false, modified: false, unchanged: false };
  }

  // Generate location_month_key
  const monthKey = `${permitNumber}_${format(obligationDate, 'yyyyMM')}`;

  // County code
  const locationCountyStr = (record as any).location_county;
  let countyCode: string | null = null;
  if (locationCountyStr) {
    const countyNum = parseInt(locationCountyStr.trim(), 10);
    if (!isNaN(countyNum)) {
      countyCode = countyNum.toString().padStart(3, '0');
    }
  }

  // Location fields
  const locationName = (record as any).location_name || null;
  const locationAddress = (record as any).location_address || null;
  const locationCity = (record as any).location_city || null;
  const locationState = (record as any).location_state || null;
  const locationZip = (record as any).location_zip || null;
  const locationCounty = locationCountyStr || null;

  // Money values
  const liquorReceipts = parseMoney((record as any).liquor_receipts);
  const wineReceipts = parseMoney((record as any).wine_receipts);
  const beerReceipts = parseMoney((record as any).beer_receipts);
  const coverChargeReceipts = parseMoney((record as any).cover_charge_receipts);
  const totalReceipts = parseMoney((record as any).total_receipts);

  // Responsibility dates
  const responsibilityBeginStr = (record as any).responsibility_begin_date_yyyymmdd;
  const responsibilityEndStr = (record as any).responsibility_end_date_yyyymmdd;
  const responsibilityBeginDate = responsibilityBeginStr ? parseDate(responsibilityBeginStr) : null;
  const responsibilityEndDate = responsibilityEndStr ? parseDate(responsibilityEndStr) : null;

  // Check if record exists and fetch key fields for comparison
  const existing = await new Promise<any[]>((resolve, reject) => {
    conn.all(
      `SELECT location_month_key, location_name, location_address,
              liquor_receipts, wine_receipts, beer_receipts,
              cover_charge_receipts, total_receipts
       FROM mixed_beverage_receipts WHERE location_month_key = ?`,
      [monthKey],
      (err: any, result: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      }
    );
  });

  const dateStr = obligationDate.toISOString().split('T')[0];
  const respBeginStr = responsibilityBeginDate ? responsibilityBeginDate.toISOString().split('T')[0] : null;
  const respEndStr = responsibilityEndDate ? responsibilityEndDate.toISOString().split('T')[0] : null;

  if (existing.length > 0) {
    // Compare key fields to see if anything actually changed
    const ex = existing[0];
    const nameMatch = String(ex.location_name ?? '') === String(locationName ?? '');
    const addrMatch = String(ex.location_address ?? '') === String(locationAddress ?? '');
    const EPS = 0.005; // half-cent tolerance for DECIMAL(15,2)
    const liquorMatch = Math.abs(toNum(ex.liquor_receipts) - toNum(liquorReceipts)) < EPS;
    const wineMatch = Math.abs(toNum(ex.wine_receipts) - toNum(wineReceipts)) < EPS;
    const beerMatch = Math.abs(toNum(ex.beer_receipts) - toNum(beerReceipts)) < EPS;
    const coverMatch = Math.abs(toNum(ex.cover_charge_receipts) - toNum(coverChargeReceipts)) < EPS;
    const totalMatch = Math.abs(toNum(ex.total_receipts) - toNum(totalReceipts)) < EPS;
    const same = nameMatch && addrMatch && liquorMatch && wineMatch && beerMatch && coverMatch && totalMatch;

    if (isFirstRecord && existing.length > 0) {
      console.log(chalk.yellow('   Comparison debug (first existing record in batch):'));
      console.log(chalk.gray(`     DB liquor_receipts raw: ${JSON.stringify(ex.liquor_receipts)} (type: ${typeof ex.liquor_receipts}) -> toNum: ${toNum(ex.liquor_receipts)}`));
      console.log(chalk.gray(`     API liquor_receipts:    ${liquorReceipts} (type: ${typeof liquorReceipts}) -> toNum: ${toNum(liquorReceipts)}`));
      console.log(chalk.gray(`     DB total_receipts raw:  ${JSON.stringify(ex.total_receipts)} (type: ${typeof ex.total_receipts}) -> toNum: ${toNum(ex.total_receipts)}`));
      console.log(chalk.gray(`     API total_receipts:     ${totalReceipts} (type: ${typeof totalReceipts}) -> toNum: ${toNum(totalReceipts)}`));
      console.log(chalk.gray(`     Fields match: name=${nameMatch} addr=${addrMatch} liquor=${liquorMatch} wine=${wineMatch} beer=${beerMatch} cover=${coverMatch} total=${totalMatch}`));
      console.log(chalk.gray(`     Overall same: ${same}`));
    }

    if (same) {
      // No change — skip the UPDATE entirely
      if (isFirstRecord) {
        console.log(chalk.gray(`   Unchanged existing record: ${monthKey} (skipped)`));
      }
      return { inserted: false, modified: false, unchanged: true };
    }

    // Data actually changed — run the UPDATE
    try {
      await runQuery(
        conn,
        `UPDATE mixed_beverage_receipts SET
          tabc_permit_number = ?, location_name = ?, location_address = ?,
          location_city = ?, location_state = ?, location_zip = ?,
          location_county = ?, location_county_code = ?,
          obligation_end_date = ?, liquor_receipts = ?, wine_receipts = ?,
          beer_receipts = ?, cover_charge_receipts = ?, total_receipts = ?,
          responsibility_begin_date = ?, responsibility_end_date = ?
        WHERE location_month_key = ?`,
        [
          permitNumber,
          locationName,
          locationAddress,
          locationCity,
          locationState,
          locationZip,
          locationCounty,
          countyCode,
          dateStr,
          liquorReceipts,
          wineReceipts,
          beerReceipts,
          coverChargeReceipts,
          totalReceipts,
          respBeginStr,
          respEndStr,
          monthKey
        ]
      );
      if (isFirstRecord) {
        console.log(chalk.green(`   Updated existing record: ${monthKey}`));
      }
      return { inserted: false, modified: true, unchanged: false };
    } catch (error: any) {
      console.error(chalk.red(`\n   UPDATE ERROR for ${monthKey}: ${error.message || error}`));
      throw error;
    }
  } else {
    // Insert new record
    try {
      await runQuery(
        conn,
        `INSERT INTO mixed_beverage_receipts (
          location_month_key, tabc_permit_number, location_name, location_address,
          location_city, location_state, location_zip, location_county, location_county_code,
          obligation_end_date, liquor_receipts, wine_receipts, beer_receipts,
          cover_charge_receipts, total_receipts, responsibility_begin_date, responsibility_end_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          monthKey,
          permitNumber,
          locationName,
          locationAddress,
          locationCity,
          locationState,
          locationZip,
          locationCounty,
          countyCode,
          dateStr,
          liquorReceipts,
          wineReceipts,
          beerReceipts,
          coverChargeReceipts,
          totalReceipts,
          respBeginStr,
          respEndStr
        ]
      );
      if (isFirstRecord) {
        console.log(chalk.green(`   Inserted new record: ${monthKey}`));
        console.log(chalk.gray(`   Values: permit=${permitNumber}, date=${dateStr}, county=${countyCode || 'null'}`));
      }
      return { inserted: true, modified: false, unchanged: false };
    } catch (error: any) {
      console.error(chalk.red(`\n   INSERT ERROR for ${monthKey}: ${error.message || error}`));
      console.error(chalk.gray(`   Params: monthKey=${monthKey}, permitNumber=${permitNumber}, date=${dateStr}`));
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Main backfill ingestion
// ---------------------------------------------------------------------------

async function ingestBackfill() {
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  console.log(chalk.blue('Starting backfill ingestion (historical data)...'));
  console.log(chalk.cyan(`   Months to backfill: ${MONTHS_TO_FETCH}`));
  console.log(chalk.cyan(`   Batch size: ${BATCH_SIZE} records`));
  console.log(chalk.cyan(`   Fetch timeout: ${FETCH_TIMEOUT_MS / 1000}s | Max retries: ${MAX_RETRIES}`));
  console.log(chalk.cyan(`   Max error tolerance: ${MAX_ERRORS}`));
  console.log(chalk.cyan(`   Checkpoint file: ${CHECKPOINT_PATH}`));

  // Check for existing lock (abort if another backfill process is running)
  checkExistingLock();
  createLockFile();

  // Copy production DB to staging to avoid file lock conflict with Next.js
  if (fs.existsSync(DUCKDB_PRODUCTION_PATH)) {
    console.log(chalk.cyan(`   Copying production DB to staging...`));
    fs.copyFileSync(DUCKDB_PRODUCTION_PATH, DUCKDB_STAGING_PATH);
    console.log(chalk.green(`   Staging copy created (${(fs.statSync(DUCKDB_STAGING_PATH).size / 1024 / 1024).toFixed(1)} MB)`));
  }

  // Load checkpoint or start fresh
  const checkpoint = loadCheckpoint();

  // Connect to DuckDB
  console.log(chalk.gray(`   Using DuckDB: ${DUCKDB_PATH}`));
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  // ---------------------------------------------------------------------------
  // Determine the backfill date window
  // ---------------------------------------------------------------------------

  let windowStartStr: string;
  let windowEndStr: string;
  let startFilter: string;
  let endFilter: string;

  if (checkpoint && checkpoint.windowStart && checkpoint.windowEnd) {
    // Resume with the same window as before
    windowStartStr = checkpoint.windowStart;
    windowEndStr = checkpoint.windowEnd;
    console.log(chalk.yellow(`   Resuming backfill window from checkpoint: ${windowStartStr} to ${windowEndStr}`));
  } else {
    // Query DB for the earliest date currently loaded
    const result = await new Promise<any[]>((resolve, reject) => {
      conn.all(
        'SELECT CAST(MIN(obligation_end_date) AS VARCHAR) AS earliest_date FROM mixed_beverage_receipts',
        (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const earliestInDb = result[0]?.earliest_date;

    if (!earliestInDb) {
      console.error(chalk.red('\n   ABORT: No records found in mixed_beverage_receipts table.'));
      console.error(chalk.red('   Run the forward ingestion script first to load initial data.'));
      deleteLockFile();
      await closeConnection(conn);
      await closeDatabase(db);
      process.exit(1);
      return;
    }

    console.log(chalk.cyan(`   Earliest date in DB: ${earliestInDb}`));

    const windowEnd = new Date(earliestInDb);       // e.g. 2023-01-31
    const windowStart = subMonths(windowEnd, MONTHS_TO_FETCH); // e.g. 2022-07-31

    windowEndStr = earliestInDb;  // "2023-01-31" format from DB
    windowStartStr = format(windowStart, 'yyyy-MM-dd');

    console.log(chalk.cyan(`   Backfill window: ${windowStartStr} to ${windowEndStr} (${MONTHS_TO_FETCH} months)`));
  }

  // Build API $where filter dates — use first-of-month for clean start boundary
  const windowStartDate = new Date(windowStartStr);
  startFilter = `${format(windowStartDate, 'yyyy-MM')}-01T00:00:00.000`;
  endFilter = `${windowEndStr}T00:00:00.000`;

  console.log(chalk.gray(`   API $where filter: obligation_end_date_yyyymmdd >= '${startFilter}' AND < '${endFilter}'`));

  // ---------------------------------------------------------------------------
  // Initialize counters
  // ---------------------------------------------------------------------------

  let offset = checkpoint ? checkpoint.offset : 0;
  let totalInserted = checkpoint ? checkpoint.totalInserted : 0;
  let totalModified = checkpoint ? checkpoint.totalModified : 0;
  let totalUnchanged = 0;
  let errors = checkpoint ? checkpoint.errors : 0;
  const effectiveStartedAt = checkpoint ? checkpoint.startedAt : startedAt;

  // Helper to save checkpoint and close DB cleanly
  async function cleanupAndExit(exitCode: number) {
    const cp: Checkpoint = {
      offset,
      totalInserted,
      totalModified,
      errors,
      startedAt: effectiveStartedAt,
      lastBatchAt: new Date().toISOString(),
      windowStart: windowStartStr,
      windowEnd: windowEndStr
    };
    saveCheckpoint(cp);
    console.log(chalk.yellow(`   Checkpoint saved at offset ${offset}`));
    deleteLockFile();

    try {
      await closeConnection(conn);
      await closeDatabase(db);
    } catch (err) {
      console.error(chalk.red(`   Error closing database: ${err}`));
    }
    process.exit(exitCode);
  }

  // Progress bars
  const fetchProgressBar = new cliProgress.SingleBar({
    format: '  Fetching: {bar} {percentage}% | {value} records fetched',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  const processProgressBar = new cliProgress.SingleBar({
    format: '  Processing: {bar} {percentage}% | {value}/{total} records | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  let totalFetched = offset; // if resuming, we already fetched this many
  let hasMore = true;
  let batchNumber = checkpoint ? Math.floor(checkpoint.offset / BATCH_SIZE) : 0;

  try {
    fetchProgressBar.start(totalFetched || 1, totalFetched);
    processProgressBar.start(totalFetched || 1, totalInserted + totalModified + totalUnchanged);

    while (hasMore) {
      // ------- Check for graceful shutdown before fetching next batch -------
      if (shutdownRequested) {
        console.log(chalk.yellow('\n   Graceful shutdown: saving checkpoint and exiting...'));
        fetchProgressBar.stop();
        processProgressBar.stop();
        await cleanupAndExit(0);
        return; // unreachable but satisfies TS
      }

      batchNumber++;
      let batch: BeverageReceipt[] | null = null;

      try {
        batch = await fetchFromAPI(offset, BATCH_SIZE, startFilter, endFilter);
      } catch (fetchErr: any) {
        // All retries exhausted for this batch
        console.error(chalk.red(`\n   Fatal fetch error at offset ${offset}: ${fetchErr.message || fetchErr}`));
        console.error(chalk.red(`   Saving checkpoint and aborting.`));
        fetchProgressBar.stop();
        processProgressBar.stop();
        await cleanupAndExit(1);
        return;
      }

      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      totalFetched += batch.length;
      fetchProgressBar.setTotal(totalFetched);
      fetchProgressBar.update(totalFetched);
      processProgressBar.setTotal(totalFetched);

      console.log(chalk.cyan(`\n   Batch #${batchNumber}: ${batch.length} records (offset ${offset}, total fetched: ${totalFetched})`));

      // Process each record in the batch
      for (let i = 0; i < batch.length; i++) {
        // Check for shutdown between records
        if (shutdownRequested) {
          console.log(chalk.yellow(`\n   Graceful shutdown: stopping mid-batch at record ${i}/${batch.length}`));
          // Adjust offset to resume from current position within this batch
          offset += i;
          fetchProgressBar.stop();
          processProgressBar.stop();
          await cleanupAndExit(0);
          return;
        }

        try {
          const isFirst = i === 0;
          const result = await processRecord(batch[i], conn, isFirst);
          if (result.inserted) totalInserted++;
          else if (result.modified) totalModified++;
          else if (result.unchanged) totalUnchanged++;
          processProgressBar.update(totalInserted + totalModified + totalUnchanged);
        } catch (error: any) {
          errors++;
          console.error(chalk.red(`\n   Error processing record ${i} in batch #${batchNumber}: ${error.message || error}`));
          if (errors <= 10) {
            console.error(chalk.gray(`   Stack: ${error.stack || 'No stack trace'}`));
          }
          if (errors >= MAX_ERRORS) {
            console.error(chalk.red(`\n   ERROR LIMIT REACHED (${MAX_ERRORS}). Aborting backfill.`));
            fetchProgressBar.stop();
            processProgressBar.stop();
            await cleanupAndExit(1);
            return;
          }
          // Continue to next record (error tolerance)
        }
      }

      // Batch complete - advance offset
      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        offset += BATCH_SIZE;
      }

      // Release batch memory
      batch = null;

      // Save checkpoint after each batch
      const cp: Checkpoint = {
        offset,
        totalInserted,
        totalModified,
        errors,
        startedAt: effectiveStartedAt,
        lastBatchAt: new Date().toISOString(),
        windowStart: windowStartStr,
        windowEnd: windowEndStr
      };
      saveCheckpoint(cp);

      // Log memory usage periodically
      if (batchNumber % MEMORY_LOG_INTERVAL === 0) {
        logMemoryUsage(batchNumber);
      }

      // Brief delay between batches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log(chalk.gray(`   Batch #${batchNumber} complete: ${totalInserted} inserted, ${totalModified} modified, ${totalUnchanged} unchanged, ${errors} errors`));
    }

    fetchProgressBar.stop();
    processProgressBar.stop();

    // ---------------------------------------------------------------------------
    // Query for new earliest date after backfill
    // ---------------------------------------------------------------------------

    let newEarliestDate = 'unknown';
    try {
      const newResult = await new Promise<any[]>((resolve, reject) => {
        conn.all(
          'SELECT CAST(MIN(obligation_end_date) AS VARCHAR) AS earliest_date FROM mixed_beverage_receipts',
          (err: any, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      newEarliestDate = newResult[0]?.earliest_date || 'unknown';
    } catch (err) {
      console.error(chalk.yellow(`   Warning: could not query new earliest date: ${err}`));
    }

    // Calculate duration
    const durationMs = Date.now() - startTime;
    const durationMin = Math.floor(durationMs / 60000);
    const durationSec = Math.floor((durationMs % 60000) / 1000);

    // Success! Delete checkpoint and lock file
    deleteCheckpoint();
    deleteLockFile();

    // Summary
    console.log(chalk.green('\n BACKFILL COMPLETE'));
    console.log(chalk.cyan(`   Backfill window: ${windowStartStr} to ${windowEndStr}`));
    console.log(chalk.cyan(`   Fetched: ${totalFetched} records from API`));
    console.log(chalk.cyan(`   Added: ${totalInserted} records`));
    console.log(chalk.cyan(`   Modified: ${totalModified} records`));
    console.log(chalk.cyan(`   Unchanged: ${totalUnchanged} records`));
    console.log(chalk.cyan(`   Errors: ${errors}`));
    console.log(chalk.cyan(`   Duration: ${durationMin}m ${durationSec}s`));
    console.log(chalk.green(`   New earliest date in DB: ${newEarliestDate}`));

  } catch (error) {
    fetchProgressBar.stop();
    processProgressBar.stop();
    console.error(chalk.red(`\n   Fatal error: ${error}`));

    // Save checkpoint so we can resume
    const cp: Checkpoint = {
      offset,
      totalInserted,
      totalModified,
      errors,
      startedAt: effectiveStartedAt,
      lastBatchAt: new Date().toISOString(),
      windowStart: windowStartStr,
      windowEnd: windowEndStr
    };
    saveCheckpoint(cp);
    console.log(chalk.yellow(`   Checkpoint saved at offset ${offset}. Re-run to resume.`));
    deleteLockFile();

    await closeConnection(conn);
    await closeDatabase(db);
    process.exit(1);
  }

  // Clean shutdown
  await closeConnection(conn);
  await closeDatabase(db);

  // Swap staging DB into production
  console.log(chalk.cyan('\n   Swapping staging DB into production...'));
  try {
    const backupPath = DUCKDB_PRODUCTION_PATH + '.bak';
    if (fs.existsSync(DUCKDB_PRODUCTION_PATH)) {
      fs.renameSync(DUCKDB_PRODUCTION_PATH, backupPath);
    }
    fs.renameSync(DUCKDB_STAGING_PATH, DUCKDB_PRODUCTION_PATH);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
    console.log(chalk.green('   Swap complete — production DB updated.'));
  } catch (swapErr) {
    console.error(chalk.red(`   Swap failed: ${swapErr}`));
    console.error(chalk.red(`   Staging file preserved at: ${DUCKDB_STAGING_PATH}`));
  }
}

// Run backfill
ingestBackfill().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  deleteLockFile();
  process.exit(1);
});
