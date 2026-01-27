/**
 * DuckDB Connection using @duckdb/node-api
 * Uses InstanceCache to manage database instances efficiently
 */

import { DuckDBInstance, DuckDBInstanceCache, DuckDBConnection, DuckDBPreparedStatement, DuckDBQueryResult } from '@duckdb/node-api';
import * as path from 'path';
import * as fs from 'fs';

// Resolve DuckDB path - try both lowercase and uppercase 'data' directory
function resolveDuckDBPath(): string {
  if (process.env.DUCKDB_PATH) {
    if (path.isAbsolute(process.env.DUCKDB_PATH)) {
      return process.env.DUCKDB_PATH;
    }
    return path.join(process.cwd(), process.env.DUCKDB_PATH);
  }
  
  // Try uppercase first (Windows), then lowercase
  const dataDirUpper = path.join(process.cwd(), 'Data', 'analytics.duckdb');
  const dataDirLower = path.join(process.cwd(), 'data', 'analytics.duckdb');
  
  if (fs.existsSync(dataDirUpper)) {
    return dataDirUpper;
  }
  if (fs.existsSync(dataDirLower)) {
    return dataDirLower;
  }
  
  // Default to uppercase (Windows convention)
  return dataDirUpper;
}

const DUCKDB_PATH = resolveDuckDBPath();

// Singleton cache – opens file once, reuses instance
const cache = new DuckDBInstanceCache();
let dbInstance: DuckDBInstance | null = null;

/**
 * Get or create DuckDB instance using the cache
 */
async function getDb(): Promise<DuckDBInstance> {
  if (!dbInstance) {
    if (!fs.existsSync(DUCKDB_PATH)) {
      throw new Error(
        `DuckDB database not found at: ${DUCKDB_PATH}\n` +
        `Please run 'npm run init:duckdb' to create the database.`
      );
    }
    dbInstance = await cache.getOrCreateInstance(DUCKDB_PATH);
    console.log('[DuckDB Neo] Instance cached');
  }
  return dbInstance;
}

/**
 * Convert BigInt and Decimal values to numbers for JSON serialization
 * Also handles string numbers that should be numeric
 */
function convertBigIntToNumber(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj);
  }
  
  // Handle string numbers (common with DECIMAL types from DuckDB)
  if (typeof obj === 'string' && !isNaN(Number(obj)) && obj.trim() !== '') {
    const num = Number(obj);
    // Only convert if it's a valid number (not NaN, Infinity, etc.)
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToNumber);
  }
  
  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }
    return converted;
  }
  
  return obj;
}

/**
 * Execute a query and return results as an array
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  console.log(`[DuckDB Neo] Query: ${sql.slice(0, 120)}... params: ${JSON.stringify(params)}`);

  const instance = await getDb();
  const connection: DuckDBConnection = await instance.connect();

  try {
    let rows: T[];

    if (params.length === 0) {
      // Simple non-param query
      const result: DuckDBQueryResult = await connection.runAndReadAll(sql);
      rows = await result.getRowObjects() as T[];
      console.log(`[DuckDB Neo] Success – ${rows.length} rows (no params)`);
    } else {
      // Parameterized query
      const prepared: DuckDBPreparedStatement = await connection.prepare(sql);

      // Bind params – position starts at 1
      params.forEach((val, idx) => {
        const pos = idx + 1;
        if (val === null || val === undefined) {
          prepared.bindNull(pos);
        } else if (typeof val === 'number') {
          if (Number.isInteger(val)) {
            prepared.bindInteger(pos, val);
          } else {
            prepared.bindDouble(pos, val);
          }
        } else if (typeof val === 'string') {
          prepared.bindVarchar(pos, val);
        } else if (typeof val === 'boolean') {
          prepared.bindBoolean(pos, val);
        } else if (val instanceof Date) {
          prepared.bindTimestamp(pos, val.getTime() / 1000); // DuckDB timestamp is seconds since epoch
        } else {
          // Fallback to string conversion
          prepared.bindVarchar(pos, String(val));
        }
      });

      const result: DuckDBQueryResult = await prepared.run();
      rows = await result.getRowObjects() as T[];
      console.log(`[DuckDB Neo] Success – ${rows.length} rows (with params)`);
    }

    // Convert BigInt values to numbers for JSON serialization
    return convertBigIntToNumber(rows || []);
  } catch (error: any) {
    console.error('[DuckDB Neo] Query failed:', error);
    console.error('[DuckDB Neo] SQL:', sql);
    console.error('[DuckDB Neo] Params:', params);
    throw error;
  } finally {
    // Disconnect the connection
    if (connection && typeof connection.disconnectSync === 'function') {
      connection.disconnectSync();
    } else if (connection && typeof connection.closeSync === 'function') {
      connection.closeSync();
    }
  }
}

/**
 * Execute a query and return a single row
 */
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}
