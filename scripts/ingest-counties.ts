#!/usr/bin/env tsx
/**
 * Ingest Counties Data
 * Imports Texas county data from CSV into DuckDB
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

// Try lowercase first, fallback to uppercase (Windows case-insensitive)
const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? 'data' : 'Data';
const CSV_PATH = path.join(process.cwd(), dataDir, 'Texas_Counties.csv');
const DUCKDB_PATH = process.env.DUCKDB_PATH 
  ? (path.isAbsolute(process.env.DUCKDB_PATH) 
      ? process.env.DUCKDB_PATH 
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

interface CountyRow {
  County: string;
  Number: string;
}

async function ingestCounties() {
  console.log(chalk.blue('📂 Reading counties CSV...'));

  // Read CSV file
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  // Parse CSV (simple format: County,Number)
  const rows: CountyRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by last comma (county name may contain commas)
    const lastCommaIndex = line.lastIndexOf(',');
    if (lastCommaIndex === -1) continue;
    
    const countyName = line.substring(0, lastCommaIndex).trim();
    const countyNumber = line.substring(lastCommaIndex + 1).trim();
    
    if (countyName && countyNumber && /^\d+$/.test(countyNumber)) {
      rows.push({
        County: countyName.replace(/^"|"$/g, ''),
        Number: countyNumber
      });
    }
  }

  console.log(chalk.green(`✓ Found ${rows.length} counties`));
  console.log(chalk.gray(`   Using DuckDB: ${DUCKDB_PATH}`));

  // Connect to DuckDB
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format: '🔄 Processing counties: {bar} {percentage}% | {value}/{total} counties | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  try {
    // Clear existing data (table must exist from schema)
    try {
      await runQuery(conn, 'DELETE FROM counties');
    } catch (error: any) {
      if (error.message.includes('does not exist')) {
        console.error(chalk.red(`\n✗ Error: counties table does not exist in DuckDB`));
        console.error(chalk.yellow(`   Make sure you ran: npm run init:duckdb`));
        process.exit(1);
      }
      throw error;
    }

    progressBar.start(rows.length, 0);

    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        // Strip " County" suffix from name
        const countyName = row.County.replace(/\s+County\s*$/i, '');
        const countyNumber = parseInt(row.Number, 10);
        const countyCode = countyNumber.toString().padStart(3, '0');

        await runQuery(
          conn,
          `INSERT INTO counties (county_code, county_name, county_number) 
           VALUES (?, ?, ?)`,
          [countyCode, countyName, countyNumber]
        );

        inserted++;
        progressBar.update(inserted);
      } catch (error: any) {
        errors++;
        if (errors <= 5) { // Only show first 5 errors to avoid spam
          console.error(chalk.red(`\n✗ Error processing ${row.County}: ${error.message || error}`));
        }
      }
    }

    progressBar.stop();

    // Summary
    console.log(chalk.green('\n✅ INGESTION COMPLETE'));
    console.log(chalk.cyan(`   Inserted: ${inserted} counties`));
    if (errors > 0) {
      console.log(chalk.yellow(`   Errors: ${errors}`));
      if (errors > 5) {
        console.log(chalk.yellow(`   (Only first 5 errors were displayed)`));
      }
    }
    
    // Verify data was actually inserted
    await new Promise<void>((resolve, reject) => {
      conn.all('SELECT COUNT(*) as count FROM counties', (err: any, result: any[]) => {
        if (err) {
          console.error(chalk.red(`\n✗ Warning: Could not verify county count: ${err.message}`));
          resolve();
          return;
        }
        const count = result[0]?.count || 0;
        if (count === 0) {
          console.error(chalk.red(`\n✗ Warning: No counties found in database after insertion!`));
        } else {
          console.log(chalk.cyan(`   Verified: ${count} counties in database`));
        }
        resolve();
      });
    });

  } catch (error) {
    progressBar.stop();
    console.error(chalk.red(`\n✗ Fatal error: ${error}`));
    process.exit(1);
  } finally {
    // Ensure connection and database are properly closed to flush changes
    await closeConnection(conn);
    await closeDatabase(db);
  }
}

// Run ingestion
ingestCounties().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
