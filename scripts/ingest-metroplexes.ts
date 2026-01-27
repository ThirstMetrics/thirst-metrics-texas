#!/usr/bin/env tsx
/**
 * Ingest Metroplexes Data
 * Imports metroplex data from Excel into DuckDB
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as XLSX from 'xlsx';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

// Try lowercase first, fallback to uppercase (Windows case-insensitive)
const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? 'data' : 'Data';
const EXCEL_PATH = path.join(process.cwd(), dataDir, 'Metroplex.xlsx');
const DUCKDB_PATH = process.env.DUCKDB_PATH 
  ? (path.isAbsolute(process.env.DUCKDB_PATH) 
      ? process.env.DUCKDB_PATH 
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

interface MetroplexRow {
  'ZIP Code': string;
  'City/Town': string;
  'County': string;
  'Metroplex': string;
}

async function ingestMetroplexes() {
  console.log(chalk.blue('📂 Reading metroplex Excel file...'));

  // Read Excel file
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: MetroplexRow[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(chalk.green(`✓ Found ${rows.length} metroplex records`));

  // Connect to DuckDB
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format: '🔄 Processing metroplexes: {bar} {percentage}% | {value}/{total} records | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  try {
    // Clear existing data
    await runQuery(conn, 'DELETE FROM metroplexes');

    progressBar.start(rows.length, 0);

    let inserted = 0;
    let errors = 0;
    let invalidZips = 0;

    for (const row of rows) {
      try {
        // Validate ZIP code (5 digits)
        const zip = String(row['ZIP Code'] || '').trim();
        if (!/^\d{5}$/.test(zip)) {
          invalidZips++;
          continue;
        }

        await runQuery(
          conn,
          `INSERT INTO metroplexes (zip, city_town, county, metroplex) 
           VALUES (?, ?, ?, ?)`,
          [
            zip,
            String(row['City/Town'] || '').trim(),
            String(row['County'] || '').trim(),
            String(row['Metroplex'] || '').trim()
          ]
        );

        inserted++;
        progressBar.update(inserted);
      } catch (error) {
        errors++;
        console.error(chalk.red(`\n✗ Error processing ZIP ${row['ZIP Code']}: ${error}`));
      }
    }

    progressBar.stop();

    // Summary
    console.log(chalk.green('\n✅ INGESTION COMPLETE'));
    console.log(chalk.cyan(`   Inserted: ${inserted} metroplex records`));
    if (invalidZips > 0) {
      console.log(chalk.yellow(`   Invalid ZIPs skipped: ${invalidZips}`));
    }
    if (errors > 0) {
      console.log(chalk.yellow(`   Errors: ${errors}`));
    }

  } catch (error) {
    progressBar.stop();
    console.error(chalk.red(`\n✗ Fatal error: ${error}`));
    process.exit(1);
  } finally {
    await closeConnection(conn);
    await closeDatabase(db);
  }
}

// Run ingestion
ingestMetroplexes().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
