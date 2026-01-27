#!/usr/bin/env tsx
/**
 * Test DuckDB Connection
 * Lists all tables in the DuckDB database
 */

import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';
import chalk from 'chalk';

const DUCKDB_PATH = process.env.DUCKDB_PATH 
  ? (path.isAbsolute(process.env.DUCKDB_PATH) 
      ? process.env.DUCKDB_PATH 
      : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

async function testDuckDB() {
  console.log(chalk.blue('🔍 Testing DuckDB Connection...'));
  console.log(chalk.gray(`   Database path: ${DUCKDB_PATH}`));

  // Check if database file exists
  if (!fs.existsSync(DUCKDB_PATH)) {
    console.error(chalk.red(`\n✗ Database file not found: ${DUCKDB_PATH}`));
    console.error(chalk.yellow(`   Run 'npm run init:duckdb' to create the database first.`));
    process.exit(1);
  }

  // Connect to DuckDB
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  try {
    // Query all tables
    const tables = await new Promise<any[]>((resolve, reject) => {
      conn.all(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
        (err: any, result: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result);
        }
      );
    });

    if (tables.length === 0) {
      console.log(chalk.yellow('\n⚠ No tables found in database'));
      console.log(chalk.yellow('   The database exists but is empty.'));
    } else {
      console.log(chalk.green(`\n✓ Found ${tables.length} table(s):\n`));
      tables.forEach((row: any, index: number) => {
        console.log(chalk.cyan(`   ${index + 1}. ${row.table_name}`));
      });
    }

    // Get row counts for each table
    if (tables.length > 0) {
      console.log(chalk.blue('\n📊 Table Row Counts:\n'));
      for (const table of tables) {
        const tableName = table.table_name;
        try {
          const countResult = await new Promise<any[]>((resolve, reject) => {
            conn.all(
              `SELECT COUNT(*) as count FROM ${tableName}`,
              (err: any, result: any[]) => {
                if (err) {
                  reject(err);
                  return;
                }
                resolve(result);
              }
            );
          });
          const count = countResult[0]?.count || 0;
          console.log(chalk.gray(`   ${tableName.padEnd(30)} ${count.toString().padStart(10)} rows`));
        } catch (error: any) {
          console.log(chalk.red(`   ${tableName.padEnd(30)} Error: ${error.message}`));
        }
      }
    }

    console.log(chalk.green('\n✅ Test complete\n'));

  } catch (error: any) {
    console.error(chalk.red(`\n✗ Error querying database: ${error.message}`));
    process.exit(1);
  } finally {
    await new Promise<void>((resolve) => {
      conn.close((err: any) => {
        if (err) console.error(chalk.yellow(`Warning closing connection: ${err.message}`));
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      db.close((err: any) => {
        if (err) console.error(chalk.yellow(`Warning closing database: ${err.message}`));
        resolve();
      });
    });
  }
}

// Run test
testDuckDB().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
