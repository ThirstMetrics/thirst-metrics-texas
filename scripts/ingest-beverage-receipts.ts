#!/usr/bin/env tsx
/**
 * Ingest Beverage Receipts Data
 * Fetches mixed beverage receipts from Texas.gov API and imports into DuckDB
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { format, subMonths } from 'date-fns';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

const API_BASE_URL = process.env.TEXAS_API_BASE_URL || 'https://data.texas.gov/resource/naix-2893.json';
const APP_TOKEN = process.env.TEXAS_APP_TOKEN || process.env.TEXAS_GOV_APP_TOKEN || '';
const DUCKDB_PATH = process.env.DUCKDB_PATH 
  ? (path.isAbsolute(process.env.DUCKDB_PATH) 
      ? process.env.DUCKDB_PATH 
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');
const LOOKBACK_MONTHS = parseInt(process.env.INGEST_LOOKBACK_MONTHS || '37', 10); // 37 months for staging
const BATCH_SIZE = 50000;

interface BeverageReceipt {
  // Texas API field names (snake_case)
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

async function fetchFromAPI(offset: number, limit: number): Promise<BeverageReceipt[]> {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('$limit', limit.toString());
  url.searchParams.set('$offset', offset.toString());
  // Order by obligation_end_date_yyyymmdd
  url.searchParams.set('$order', 'obligation_end_date_yyyymmdd DESC');
  if (APP_TOKEN) {
    url.searchParams.set('$$app_token', APP_TOKEN);
  }

  const fullUrl = url.toString();
  console.log(chalk.gray(`   Fetching: ${fullUrl}`));

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Helper function to get field value (handles both snake_case and original field names)
function getField(record: BeverageReceipt, fieldName: string, snakeCaseName: string): string | undefined {
  return (record as any)[fieldName] || (record as any)[snakeCaseName];
}

// Parse date from YYYYMMDD format (Texas API format)
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  
  const cleaned = dateStr.trim();
  
  // Handle YYYYMMDD format (e.g., "20250125")
  if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) {
    const year = parseInt(cleaned.substring(0, 4), 10);
    const month = parseInt(cleaned.substring(4, 6), 10) - 1; // Month is 0-indexed
    const day = parseInt(cleaned.substring(6, 8), 10);
    return new Date(year, month, day);
  }
  
  // Fallback to standard date parsing
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Parse money value (strip $ and commas, or handle numeric values)
function parseMoney(value: string | number | undefined): number | null {
  if (value === null || value === undefined) return null;
  
  // If it's already a number, return it
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  
  // If it's a string, strip $ and commas
  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  if (cleaned === '' || cleaned === '$0') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

// Process a single record and insert/update in DuckDB
async function processRecord(
  record: BeverageReceipt,
  conn: duckdb.Connection,
  countyMap: Map<string, string>,
  startDate: Date,
  isFirstRecord: boolean = false
): Promise<{ inserted: boolean; modified: boolean; filtered: boolean }> {
  // Get field values using exact Texas API field names
  const permitNumber = (record as any).tabc_permit_number;
  const obligationDateStr = (record as any).obligation_end_date_yyyymmdd;
  
  if (isFirstRecord) {
    console.log(chalk.yellow('\n🔍 First record in batch:'));
    console.log(chalk.gray(`   Raw record keys: ${Object.keys(record).join(', ')}`));
    console.log(chalk.gray(`   Permit Number: ${permitNumber || 'MISSING'}`));
    console.log(chalk.gray(`   Obligation Date (YYYYMMDD): ${obligationDateStr || 'MISSING'}`));
    console.log(chalk.gray(`   Full record sample: ${JSON.stringify(record).substring(0, 200)}...`));
  }
  
  if (!permitNumber || !obligationDateStr) {
    if (isFirstRecord) {
      console.log(chalk.red(`   ✗ Skipping: Missing permitNumber or obligation_end_date_yyyymmdd`));
    }
    return { inserted: false, modified: false, filtered: false };
  }

  // Parse date from YYYYMMDD format
  const obligationDate = parseDate(obligationDateStr);
  if (!obligationDate) {
    if (isFirstRecord) {
      console.log(chalk.red(`   ✗ Skipping: Invalid date format: ${obligationDateStr} (expected YYYYMMDD)`));
    }
    return { inserted: false, modified: false, filtered: false };
  }

  // Optional: Filter by date locally
  if (obligationDate < startDate) {
    if (isFirstRecord) {
      console.log(chalk.yellow(`   ⚠ Filtered: Date ${obligationDate.toISOString().split('T')[0]} is before startDate ${startDate.toISOString().split('T')[0]}`));
    }
    return { inserted: false, modified: false, filtered: true };
  }

  // Generate location_month_key
  const monthKey = `${permitNumber}_${format(obligationDate, 'yyyyMM')}`;

  // Get Location County (it's already a Texas county code number)
  const locationCountyStr = (record as any).location_county;
  let countyCode: string | null = null;
  if (locationCountyStr) {
    const countyNum = parseInt(locationCountyStr.trim(), 10);
    if (!isNaN(countyNum)) {
      countyCode = countyNum.toString().padStart(3, '0');
    }
  }

  // Get other location fields (these may not exist in API, but check for them)
  const locationName = (record as any).location_name || null;
  const locationAddress = (record as any).location_address || null;
  const locationCity = (record as any).location_city || null;
  const locationState = (record as any).location_state || null;
  const locationZip = (record as any).location_zip || null;
  const locationCounty = locationCountyStr || null;

  // Parse money values (strip $ and commas if present)
  const liquorReceipts = parseMoney((record as any).liquor_receipts);
  const wineReceipts = parseMoney((record as any).wine_receipts);
  const beerReceipts = parseMoney((record as any).beer_receipts);
  const coverChargeReceipts = parseMoney((record as any).cover_charge_receipts);
  const totalReceipts = parseMoney((record as any).total_receipts);

  // Parse responsibility dates (YYYYMMDD format)
  const responsibilityBeginStr = (record as any).responsibility_begin_date_yyyymmdd;
  const responsibilityEndStr = (record as any).responsibility_end_date_yyyymmdd;
  const responsibilityBeginDate = responsibilityBeginStr ? parseDate(responsibilityBeginStr) : null;
  const responsibilityEndDate = responsibilityEndStr ? parseDate(responsibilityEndStr) : null;

  // Check if record exists
  const existing = await new Promise<any[]>((resolve, reject) => {
    conn.all(
      'SELECT location_month_key FROM mixed_beverage_receipts WHERE location_month_key = ?',
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

  if (existing.length > 0) {
    // Update existing record
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
          obligationDate.toISOString().split('T')[0],
          liquorReceipts,
          wineReceipts,
          beerReceipts,
          coverChargeReceipts,
          totalReceipts,
          responsibilityBeginDate ? responsibilityBeginDate.toISOString().split('T')[0] : null,
          responsibilityEndDate ? responsibilityEndDate.toISOString().split('T')[0] : null,
          monthKey
        ]
      );
      if (isFirstRecord) {
        console.log(chalk.green(`   ✓ Updated existing record: ${monthKey}`));
      }
      return { inserted: false, modified: true, filtered: false };
    } catch (error: any) {
      console.error(chalk.red(`\n✗ UPDATE ERROR for ${monthKey}: ${error.message || error}`));
      console.error(chalk.gray(`   SQL: UPDATE mixed_beverage_receipts WHERE location_month_key = ?`));
      console.error(chalk.gray(`   Params: monthKey=${monthKey}, permitNumber=${permitNumber}`));
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
          obligationDate.toISOString().split('T')[0],
          liquorReceipts,
          wineReceipts,
          beerReceipts,
          coverChargeReceipts,
          totalReceipts,
          responsibilityBeginDate ? responsibilityBeginDate.toISOString().split('T')[0] : null,
          responsibilityEndDate ? responsibilityEndDate.toISOString().split('T')[0] : null
        ]
      );
      if (isFirstRecord) {
        console.log(chalk.green(`   ✓ Inserted new record: ${monthKey}`));
        console.log(chalk.gray(`   Values: permit=${permitNumber}, date=${obligationDate.toISOString().split('T')[0]}, county=${countyCode || 'null'}`));
      }
      return { inserted: true, modified: false, filtered: false };
    } catch (error: any) {
      console.error(chalk.red(`\n✗ INSERT ERROR for ${monthKey}: ${error.message || error}`));
      console.error(chalk.gray(`   SQL: INSERT INTO mixed_beverage_receipts`));
      console.error(chalk.gray(`   Params: monthKey=${monthKey}, permitNumber=${permitNumber}, date=${obligationDate.toISOString().split('T')[0]}`));
      console.error(chalk.gray(`   Full params: ${JSON.stringify([
        monthKey,
        permitNumber,
        locationName,
        locationAddress,
        locationCity,
        locationState,
        locationZip,
        locationCounty,
        countyCode,
        obligationDate.toISOString().split('T')[0],
        liquorReceipts,
        wineReceipts,
        beerReceipts,
        coverChargeReceipts,
        totalReceipts,
        responsibilityBeginDate ? responsibilityBeginDate.toISOString().split('T')[0] : null,
        responsibilityEndDate ? responsibilityEndDate.toISOString().split('T')[0] : null
      ])}`));
      throw error;
    }
  }
}

async function ingestBeverageReceipts() {
  console.log(chalk.blue('📥 Starting beverage receipts ingestion...'));
  console.log(chalk.cyan(`   Batch size: ${BATCH_SIZE} records`));
  console.log(chalk.cyan(`   Fetching all records (no date filter)`));

  console.log(chalk.blue(`⏳ Fetching data from Texas.gov API...`));

  // Connect to DuckDB
  console.log(chalk.gray(`   Using DuckDB: ${DUCKDB_PATH}`));
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  // Get counties lookup for mapping
  const countyMap = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    conn.all('SELECT county_code, county_name FROM counties', (err: any, countiesResult: any[]) => {
      if (err) {
        reject(err);
        return;
      }
      countiesResult.forEach((row: any) => {
        countyMap.set(row.county_name.toLowerCase(), row.county_code);
      });
      resolve();
    });
  });

  const fetchProgressBar = new cliProgress.SingleBar({
    format: '⏳ Fetching: {bar} {percentage}% | {value} records fetched',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  const processProgressBar = new cliProgress.SingleBar({
    format: '🔄 Processing: {bar} {percentage}% | {value}/{total} records | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  try {
    let totalFetched = 0;
    let totalInserted = 0;
    let totalModified = 0;
    let errors = 0;
    let offset = 0;
    let hasMore = true;
    let filteredCount = 0;

    // Optional: Filter by date locally if needed
    const endDate = new Date();
    const startDate = subMonths(endDate, LOOKBACK_MONTHS);

    // Fetch and process in batches to avoid memory issues
    fetchProgressBar.start(1, 0);
    processProgressBar.start(1, 0);

    while (hasMore) {
      try {
        // Fetch a batch
        const batch = await fetchFromAPI(offset, BATCH_SIZE);
        
        if (batch.length === 0) {
          hasMore = false;
          break;
        }

        totalFetched += batch.length;
        fetchProgressBar.update(totalFetched);
        console.log(chalk.cyan(`   Processing batch: ${batch.length} records (total fetched: ${totalFetched})`));

        // Process and insert this batch immediately (don't accumulate in memory)
        processProgressBar.setTotal(totalFetched);

        // Process each record in the batch immediately
        let recordIndex = 0;
        for (const record of batch) {
          try {
            const isFirst = recordIndex === 0;
            const result = await processRecord(record, conn, countyMap, startDate, isFirst);
            if (result.inserted) totalInserted++;
            if (result.modified) totalModified++;
            if (result.filtered) filteredCount++;
            processProgressBar.update(totalInserted + totalModified);
            recordIndex++;
          } catch (error: any) {
            errors++;
            console.error(chalk.red(`\n✗ Error processing record at index ${recordIndex}: ${error.message || error}`));
            if (errors <= 10) { // Show first 10 errors with more detail
              console.error(chalk.gray(`   Stack: ${error.stack || 'No stack trace'}`));
            }
            recordIndex++;
          }
        }

        // Batch processed, check if we should continue
        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

        // Log progress every batch
        console.log(chalk.gray(`   Batch complete: ${totalInserted} inserted, ${totalModified} modified, ${filteredCount} filtered`));

      } catch (error) {
        console.error(chalk.red(`\n✗ Error fetching batch at offset ${offset}: ${error}`));
        errors++;
        // Retry once
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const retryBatch = await fetchFromAPI(offset, BATCH_SIZE);
          if (retryBatch.length === 0) {
            hasMore = false;
            break;
          }
          
          totalFetched += retryBatch.length;
          fetchProgressBar.update(totalFetched);
          processProgressBar.setTotal(totalFetched);
          
          // Process retry batch immediately using the same helper function
          let retryRecordIndex = 0;
          for (const record of retryBatch) {
            try {
              const isFirst = retryRecordIndex === 0;
              const result = await processRecord(record, conn, countyMap, startDate, isFirst);
              if (result.inserted) totalInserted++;
              if (result.modified) totalModified++;
              if (result.filtered) filteredCount++;
              processProgressBar.update(totalInserted + totalModified);
              retryRecordIndex++;
            } catch (retryError: any) {
              errors++;
              console.error(chalk.red(`\n✗ Error processing retry record at index ${retryRecordIndex}: ${retryError.message || retryError}`));
              retryRecordIndex++;
            }
          }

          if (retryBatch.length < BATCH_SIZE) hasMore = false;
          else offset += BATCH_SIZE;
        } catch (retryError) {
          console.error(chalk.red(`✗ Retry failed, skipping batch`));
          hasMore = false;
        }
      }
    }

    fetchProgressBar.stop();
    processProgressBar.stop();

    // Summary
    console.log(chalk.green('\n✅ INGESTION COMPLETE'));
    console.log(chalk.cyan(`   Fetched: ${totalFetched} records from API`));
    if (filteredCount > 0) {
      console.log(chalk.cyan(`   Filtered out (outside date range): ${filteredCount} records`));
    }
    console.log(chalk.cyan(`   Added: ${totalInserted} records`));
    console.log(chalk.cyan(`   Modified: ${totalModified} records`));
    if (errors > 0) {
      console.log(chalk.yellow(`   Errors: ${errors}`));
    }

  } catch (error) {
    fetchProgressBar.stop();
    processProgressBar.stop();
    console.error(chalk.red(`\n✗ Fatal error: ${error}`));
    process.exit(1);
  } finally {
    await closeConnection(conn);
    await closeDatabase(db);
  }
}

// Run ingestion
ingestBeverageReceipts().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
