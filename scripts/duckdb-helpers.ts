/**
 * DuckDB Helper Functions
 * Utility functions for working with DuckDB connections
 */

import * as duckdb from 'duckdb';

/**
 * Execute a run() operation with Promise wrapper
 * DuckDB expects parameters as individual arguments, not as an array
 */
export function runQuery(conn: duckdb.Connection, sql: string, params?: any[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (params && params.length > 0) {
      // DuckDB expects parameters as individual arguments, spread the array
      conn.run(sql, ...params, (err: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    } else {
      conn.run(sql, (err: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    }
  });
}

/**
 * Close connection with Promise wrapper
 */
export function closeConnection(conn: duckdb.Connection): Promise<void> {
  return new Promise<void>((resolve) => {
    conn.close((err: any) => {
      if (err) {
        console.error(`Warning closing connection: ${err.message}`);
      }
      resolve();
    });
  });
}

/**
 * Close database with Promise wrapper
 */
export function closeDatabase(db: duckdb.Database): Promise<void> {
  return new Promise<void>((resolve) => {
    db.close((err: any) => {
      if (err) {
        console.error(`Warning closing database: ${err.message}`);
      }
      resolve();
    });
  });
}
