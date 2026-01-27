#!/usr/bin/env tsx
/**
 * Ingest Sales Tax Data
 * Imports general sales tax data from CSV into DuckDB
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import { runQuery, closeConnection, closeDatabase } from './duckdb-helpers';

// Try lowercase first, fallback to uppercase (Windows case-insensitive)
const dataDir = fs.existsSync(path.join(process.cwd(), 'data')) ? 'data' : 'Data';
const CSV_PATH = path.join(process.cwd(), dataDir, 'Sales_Tax.csv');
const DUCKDB_PATH = process.env.DUCKDB_PATH 
  ? (path.isAbsolute(process.env.DUCKDB_PATH) 
      ? process.env.DUCKDB_PATH 
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

interface SalesTaxRow {
  Type: string;
  Name: string;
  'Current Rate': string;
  'Net Payment This Period': string;
  'Comparable Payment Prior Year': string;
  'Percent Change From Prior Year': string;
  'Payments To Date': string;
  'Previous Payments To Date': string;
  'Percent Change To Date': string;
  'Report Month': string;
  'Report Year': string;
  'Report Period Type': string;
}

async function ingestSalesTax() {
  console.log(chalk.blue('📂 Reading sales tax CSV...'));

  // Read CSV file
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  // Parse CSV header
  const header = lines[0].split(',').map(h => h.trim());
  
  // Parse rows
  const rows: SalesTaxRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = {};
    header.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row as SalesTaxRow);
  }

  // Filter to COUNTY type only
  const countyRows = rows.filter(row => row.Type === 'COUNTY');
  console.log(chalk.green(`✓ Found ${countyRows.length} county records (${rows.length} total)`));

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

  // Create progress bar
  const progressBar = new cliProgress.SingleBar({
    format: '🔄 Processing sales tax: {bar} {percentage}% | {value}/{total} records | ETA: {eta}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  try {
    // Clear existing COUNTY data only
    await runQuery(conn, "DELETE FROM general_sales_tax WHERE type = 'COUNTY'");

    progressBar.start(countyRows.length, 0);

    let inserted = 0;
    let errors = 0;
    let unmapped = 0;

    for (const row of countyRows) {
      try {
        // Map county name to county_code
        const countyName = row.Name.replace(/\s+County\s*$/i, '');
        const countyCode = countyMap.get(countyName.toLowerCase()) || null;

        if (!countyCode) {
          unmapped++;
        }

        // Generate month field (YYYY-MM)
        const reportYear = parseInt(row['Report Year'], 10);
        const reportMonth = parseInt(row['Report Month'], 10);
        const month = `${reportYear}-${reportMonth.toString().padStart(2, '0')}`;

        // Parse numeric values
        const parseDecimal = (val: string): number | null => {
          const cleaned = val.replace(/,/g, '').trim();
          return cleaned ? parseFloat(cleaned) : null;
        };

        await runQuery(
          conn,
          `INSERT INTO general_sales_tax (
            type, name, report_year, report_month, report_period_type,
            current_rate, net_payment_this_period, comparable_payment_prior_year,
            percent_change_from_prior_year, payments_to_date, previous_payments_to_date,
            percent_change_to_date, month, county_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.Type,
            row.Name,
            reportYear,
            reportMonth,
            row['Report Period Type'],
            parseDecimal(row['Current Rate']),
            parseDecimal(row['Net Payment This Period']),
            parseDecimal(row['Comparable Payment Prior Year']),
            parseDecimal(row['Percent Change From Prior Year']),
            parseDecimal(row['Payments To Date']),
            parseDecimal(row['Previous Payments To Date']),
            parseDecimal(row['Percent Change To Date']),
            month,
            countyCode
          ]
        );

        inserted++;
        progressBar.update(inserted);
      } catch (error) {
        errors++;
        console.error(chalk.red(`\n✗ Error processing ${row.Name}: ${error}`));
      }
    }

    progressBar.stop();

    // Summary
    console.log(chalk.green('\n✅ INGESTION COMPLETE'));
    console.log(chalk.cyan(`   Inserted: ${inserted} county sales tax records`));
    if (unmapped > 0) {
      console.log(chalk.yellow(`   Unmapped counties: ${unmapped}`));
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
ingestSalesTax().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
