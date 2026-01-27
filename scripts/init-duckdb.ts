#!/usr/bin/env tsx
/**
 * Initialize DuckDB Database
 * Creates the DuckDB database file and runs the schema
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
const SCHEMA_PATH = path.join(process.cwd(), 'docs', 'duckdb_schema.sql');

async function initDuckDB() {
  console.log(chalk.blue('🔧 Initializing DuckDB database...'));
  console.log(chalk.gray(`   Database path: ${DUCKDB_PATH}`));

  // Ensure data directory exists
  const dbDir = path.dirname(DUCKDB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(chalk.green(`✓ Created directory: ${dbDir}`));
  }

  // Read schema file
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(chalk.red(`✗ Schema file not found: ${SCHEMA_PATH}`));
    process.exit(1);
  }

  const schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf-8');

  // Connect to DuckDB (creates file if it doesn't exist)
  const db = new duckdb.Database(DUCKDB_PATH);
  const conn = db.connect();

  try {
    // Execute entire schema using exec() which handles multiple statements
    console.log(chalk.cyan(`   Executing schema...`));
    
    await new Promise<void>((resolve, reject) => {
      conn.exec(schemaSQL, (err: any) => {
        if (err) {
          // Some errors are expected (like "already exists"), but log others
          if (!err.message.includes('already exists') && 
              !err.message.includes('duplicate') &&
              !err.message.includes('already present')) {
            console.error(chalk.yellow(`\n⚠ Schema execution warning: ${err.message}`));
          }
        }
        resolve();
      });
    });

    console.log(chalk.green(`✓ Schema executed`));

    // Verify tables were created
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
      console.error(chalk.red(`\n✗ Error: No tables were created!`));
      process.exit(1);
    }

    console.log(chalk.cyan(`✓ Created ${tables.length} tables:`));
    tables.forEach((row: any) => {
      console.log(chalk.gray(`   - ${row.table_name}`));
    });

    // Verify tables were created
    // const tables = conn.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name");
    // console.log(chalk.cyan(`\n✓ Created ${tables.length} tables:`));
    // tables.forEach((row: any) => {
    //   console.log(chalk.gray(`   - ${row.table_name}`));
    // });

    console.log(chalk.green(`\n✅ DuckDB database initialized successfully at: ${DUCKDB_PATH}\n`));

  } catch (error: any) {
    console.error(chalk.red(`\n✗ Fatal error: ${error.message || error}`));
    process.exit(1);
  } finally {
    // Ensure connection and database are properly closed to flush changes
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

// Run initialization
initDuckDB().catch(error => {
  console.error(chalk.red(`Fatal error: ${error}`));
  process.exit(1);
});
