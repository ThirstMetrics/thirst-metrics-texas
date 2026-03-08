#!/usr/bin/env tsx
/**
 * Ingest Location Enrichments Data
 * Imports proprietary location enrichment data from Excel into DuckDB
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import ExcelJS from 'exceljs';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

// Try lowercase first, fallback to uppercase (Windows case-insensitive)
const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? 'data' : 'Data';
const EXCEL_PATH = path.join(process.cwd(), dataDir, 'ProprietaryData.xlsx');
const DUCKDB_PATH = process.env.DUCKDB_PATH 
  ? (path.isAbsolute(process.env.DUCKDB_PATH) 
      ? process.env.DUCKDB_PATH 
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

interface EnrichmentRow {
  'TABC_Permit_Number': string;
  'Clean_DBA_Name': string;
  'Ownership_Group': string;
  'Industry_Segment': string;
  'Clean_Up_Notes': string;
}

async function ingestEnrichments() {
  console.log(chalk.blue('📂 Reading enrichments Excel file...'));

  // Read Excel file
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  const worksheet = workbook.worksheets[0];

  // Convert to row objects using header row
  const headers = (worksheet.getRow(1).values as (string | undefined)[]).slice(1);
  const rows: any[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: any = {};
    (row.values as (string | undefined)[]).slice(1).forEach((val, i) => {
      if (headers[i]) obj[headers[i] as string] = val;
    });
    rows.push(obj);
  });

  console.log(chalk.green(`✓ Found ${rows.length} enrichment records`));

  // Connect to DuckDB
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format: '🔄 Processing enrichments: {bar} {percentage}% | {value}/{total} records | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  try {
    // Clear existing data
    await runQuery(conn, 'DELETE FROM location_enrichments');

    progressBar.start(rows.length, 0);

    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        // Extract only enrichment fields (skip desktop editing reference fields)
        const permitNumber = String(row['TABC_Permit_Number'] || '').trim();
        if (!permitNumber) {
          continue; // Skip rows without permit number
        }

        await runQuery(
          conn,
          `INSERT INTO location_enrichments (
            tabc_permit_number, clean_dba_name, ownership_group, 
            industry_segment, clean_up_notes, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            permitNumber,
            String(row['Clean_DBA_Name'] || '').trim() || null,
            String(row['Ownership_Group'] || '').trim() || null,
            String(row['Industry_Segment'] || '').trim() || null,
            String(row['Clean_Up_Notes'] || '').trim() || null,
            new Date().toISOString()
          ]
        );

        inserted++;
        progressBar.update(inserted);
      } catch (error) {
        errors++;
        console.error(chalk.red(`\n✗ Error processing permit ${row['TABC_Permit_Number']}: ${error}`));
      }
    }

    progressBar.stop();

    // Summary
    console.log(chalk.green('\n✅ INGESTION COMPLETE'));
    console.log(chalk.cyan(`   Inserted: ${inserted} enrichment records`));
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
ingestEnrichments().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
