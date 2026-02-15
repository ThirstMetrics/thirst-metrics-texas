/**
 * Batch Geocode Locations Script
 *
 * Reads customer addresses from DuckDB mixed_beverage_receipts,
 * geocodes them via US Census Bureau Geocoder (free, no API key),
 * and inserts coordinates into DuckDB location_coordinates table.
 *
 * Uses checkpoint/resume for reliability (per project rules for >10k records).
 * Deduplicates by normalized address to minimize API calls.
 *
 * Usage: npx tsx scripts/geocode-locations.ts [--limit N] [--resume] [--dry-run]
 */

import { DuckDBInstance } from '@duckdb/node-api';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const DUCKDB_PATH = process.env.DUCKDB_PATH
  ? (path.isAbsolute(process.env.DUCKDB_PATH) ? process.env.DUCKDB_PATH : path.join(process.cwd(), process.env.DUCKDB_PATH))
  : path.join(process.cwd(), 'data', 'analytics.duckdb');

const CHECKPOINT_FILE = path.join(process.cwd(), 'data', '.ingestion-checkpoint-geocode.json');

// Census Bureau Geocoder - free, no API key required, designed for US addresses
const CENSUS_GEOCODE_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

// Nominatim (OpenStreetMap) - free backup, 1 req/sec
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

// Rate limits
const DELAY_BETWEEN_REQUESTS_MS = 350;  // ~170/min, conservative for Census Bureau
const NOMINATIM_DELAY_MS = 1100;        // Nominatim requires 1 req/sec max
const BATCH_INSERT_SIZE = 50;           // Insert to DB every N geocodes (small batches for reliability)
const LOG_EVERY = 50;                   // Echo progress every N records

// ============================================================================
// Types
// ============================================================================

interface CustomerAddress {
  tabc_permit_number: string;
  location_address: string;
  location_city: string;
  location_state: string;
  location_zip: string;
  full_address: string;
}

interface GeocodedResult {
  tabc_permit_number: string;
  latitude: number;
  longitude: number;
  geocode_quality: string;
  geocode_source: string;
}

interface Checkpoint {
  lastProcessedIndex: number;
  totalCustomers: number;
  geocodedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string;
  lastUpdatedAt: string;
  addressCache: Record<string, { lat: number; lng: number; quality: string; source: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildFullAddress(row: any): string {
  const parts = [
    row.location_address,
    row.location_city,
    row.location_state || 'TX',
    row.location_zip,
  ].filter(Boolean);
  return parts.join(', ');
}

function escapeSQL(val: string): string {
  return val.replace(/'/g, "''");
}

function loadCheckpoint(): Checkpoint | null {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      return data as Checkpoint;
    }
  } catch {
    console.warn('  Warning: Could not load checkpoint file, starting fresh.');
  }
  return null;
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  checkpoint.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function deleteCheckpoint(): void {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }
  } catch {}
}

// ============================================================================
// Geocoding Functions
// ============================================================================

/**
 * Geocode using US Census Bureau Geocoder
 * Free, no API key, designed for US addresses
 * Docs: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.pdf
 */
async function geocodeCensus(fullAddress: string): Promise<{ lat: number; lng: number; quality: string } | null> {
  const params = new URLSearchParams({
    address: fullAddress,
    benchmark: 'Public_AR_Current',
    format: 'json',
  });

  const url = `${CENSUS_GEOCODE_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ThirstMetrics-Geocoder/1.0 (Texas beverage distribution analytics)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) {
      return null;
    }

    const match = matches[0];
    const coords = match.coordinates;

    if (!coords || !coords.x || !coords.y) {
      return null;
    }

    // Census returns x=longitude, y=latitude
    const quality = match.tigerLine ? 'exact' : 'approximate';

    return {
      lat: coords.y,
      lng: coords.x,
      quality,
    };
  } catch (err: any) {
    // Silently fail, will try Nominatim fallback
    return null;
  }
}

/**
 * Geocode using Nominatim (OpenStreetMap) - fallback
 * Free, requires User-Agent, max 1 req/sec
 */
async function geocodeNominatim(fullAddress: string): Promise<{ lat: number; lng: number; quality: string } | null> {
  const params = new URLSearchParams({
    q: fullAddress,
    format: 'json',
    countrycodes: 'us',
    limit: '1',
  });

  const url = `${NOMINATIM_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ThirstMetrics-Geocoder/1.0 (Texas beverage distribution analytics)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return null;
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }

    return {
      lat,
      lng,
      quality: 'approximate',
    };
  } catch {
    return null;
  }
}

/**
 * Geocode with fallback chain: Census Bureau -> Nominatim
 */
async function geocodeAddress(fullAddress: string): Promise<{ lat: number; lng: number; quality: string; source: string } | null> {
  // Try Census Bureau first (faster, more accurate for US)
  const censusResult = await geocodeCensus(fullAddress);
  if (censusResult) {
    return { ...censusResult, source: 'census' };
  }

  // Fallback to Nominatim (slower, needs extra delay)
  await sleep(NOMINATIM_DELAY_MS);
  const nominatimResult = await geocodeNominatim(fullAddress);
  if (nominatimResult) {
    return { ...nominatimResult, source: 'nominatim' };
  }

  return null;
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  const startTime = Date.now();

  // Parse args
  const args = process.argv.slice(2);
  const limitFlag = args.indexOf('--limit');
  const maxLimit = limitFlag >= 0 ? parseInt(args[limitFlag + 1], 10) : Infinity;
  const shouldResume = args.includes('--resume');
  const isDryRun = args.includes('--dry-run');

  console.log('');
  console.log('📍 Starting batch geocoding...');
  console.log(`   Database: ${DUCKDB_PATH}`);
  console.log(`   Geocoder: US Census Bureau + Nominatim fallback (no API key needed)`);
  console.log(`   Limit: ${maxLimit === Infinity ? 'none' : maxLimit}`);
  console.log(`   Resume: ${shouldResume}`);
  console.log(`   Dry run: ${isDryRun}`);
  console.log('');

  if (!fs.existsSync(DUCKDB_PATH)) {
    console.error(`ERROR: DuckDB file not found at: ${DUCKDB_PATH}`);
    process.exit(1);
  }

  // Open DuckDB in READ_WRITE mode for this script
  console.log('   Opening DuckDB in READ_WRITE mode...');
  const instance = await DuckDBInstance.create(DUCKDB_PATH, {
    access_mode: 'READ_WRITE',
  });
  const conn = await instance.connect();

  try {
    // 1. Fetch all distinct customer addresses
    console.log('⏳ Fetching customer addresses from mixed_beverage_receipts...');

    const addrResult = await conn.runAndReadAll(`
      SELECT
        m.tabc_permit_number,
        MAX(m.location_address) as location_address,
        MAX(m.location_city) as location_city,
        MAX(m.location_state) as location_state,
        MAX(m.location_zip) as location_zip
      FROM mixed_beverage_receipts m
      LEFT JOIN location_coordinates c ON m.tabc_permit_number = c.tabc_permit_number
      WHERE m.location_address IS NOT NULL
        AND m.location_city IS NOT NULL
        AND c.tabc_permit_number IS NULL
      GROUP BY m.tabc_permit_number
      ORDER BY m.tabc_permit_number
    `);

    const allRows = addrResult.getRowObjects() as any[];
    console.log(`   Found ${allRows.length} customers needing geocoding.`);

    if (allRows.length === 0) {
      console.log('   All customers already geocoded! Nothing to do.');
      return;
    }

    // Build customer list with full addresses
    const customers: CustomerAddress[] = allRows.map(row => ({
      tabc_permit_number: String(row.tabc_permit_number),
      location_address: String(row.location_address || ''),
      location_city: String(row.location_city || ''),
      location_state: String(row.location_state || 'TX'),
      location_zip: String(row.location_zip || ''),
      full_address: buildFullAddress(row),
    }));

    // Apply limit
    const toProcess = maxLimit < customers.length ? customers.slice(0, maxLimit) : customers;
    console.log(`   Will process ${toProcess.length} customers.`);

    // 2. Load or create checkpoint
    let checkpoint: Checkpoint;
    if (shouldResume) {
      const existing = loadCheckpoint();
      if (existing && existing.totalCustomers === toProcess.length) {
        checkpoint = existing;
        console.log(`   Resuming from index ${checkpoint.lastProcessedIndex + 1} (${checkpoint.geocodedCount} geocoded, ${checkpoint.failedCount} failed so far)`);
      } else {
        console.log('   Checkpoint not compatible, starting fresh.');
        checkpoint = {
          lastProcessedIndex: -1,
          totalCustomers: toProcess.length,
          geocodedCount: 0,
          failedCount: 0,
          skippedCount: 0,
          startedAt: new Date().toISOString(),
          lastUpdatedAt: new Date().toISOString(),
          addressCache: {},
        };
      }
    } else {
      deleteCheckpoint();
      checkpoint = {
        lastProcessedIndex: -1,
        totalCustomers: toProcess.length,
        geocodedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        addressCache: {},
      };
    }

    // 3. Process customers
    let pendingInserts: GeocodedResult[] = [];
    const startIdx = checkpoint.lastProcessedIndex + 1;

    for (let i = startIdx; i < toProcess.length; i++) {
      const customer = toProcess[i];
      const normalizedAddr = normalizeAddress(customer.full_address);

      // Check address cache (dedup: same address = same coordinates)
      const cached = checkpoint.addressCache[normalizedAddr];

      if (cached) {
        pendingInserts.push({
          tabc_permit_number: customer.tabc_permit_number,
          latitude: cached.lat,
          longitude: cached.lng,
          geocode_quality: cached.quality,
          geocode_source: cached.source,
        });
        checkpoint.skippedCount++;
      } else {
        if (!isDryRun) {
          const result = await geocodeAddress(customer.full_address);

          if (result) {
            pendingInserts.push({
              tabc_permit_number: customer.tabc_permit_number,
              latitude: result.lat,
              longitude: result.lng,
              geocode_quality: result.quality,
              geocode_source: result.source,
            });
            checkpoint.addressCache[normalizedAddr] = result;
            checkpoint.geocodedCount++;
          } else {
            pendingInserts.push({
              tabc_permit_number: customer.tabc_permit_number,
              latitude: 0,
              longitude: 0,
              geocode_quality: 'failed',
              geocode_source: 'none',
            });
            checkpoint.failedCount++;
          }

          await sleep(DELAY_BETWEEN_REQUESTS_MS);
        } else {
          checkpoint.geocodedCount++;
        }
      }

      // Progress logging
      const processed = i - startIdx + 1;
      if (processed % LOG_EVERY === 0 || i === toProcess.length - 1) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = toProcess.length > i + 1 ? Math.round((toProcess.length - i - 1) / rate) : 0;
        const censusCount = Object.values(checkpoint.addressCache).filter(c => c.source === 'census').length;
        const nomCount = Object.values(checkpoint.addressCache).filter(c => c.source === 'nominatim').length;
        console.log(`🔄 ${i + 1}/${toProcess.length} | ✅ ${checkpoint.geocodedCount} (census: ${censusCount}, osm: ${nomCount}) | ❌ ${checkpoint.failedCount} | 🔁 ${checkpoint.skippedCount} deduped | ~${remaining}s left`);
      }

      // Batch insert to DuckDB
      if (pendingInserts.length >= BATCH_INSERT_SIZE || i === toProcess.length - 1) {
        if (!isDryRun && pendingInserts.length > 0) {
          await insertBatch(conn, pendingInserts);
        }
        pendingInserts = [];

        checkpoint.lastProcessedIndex = i;
        saveCheckpoint(checkpoint);
      }
    }

    // 4. Summary
    const duration = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);

    console.log('');
    console.log('✅ GEOCODING COMPLETE');
    console.log(`   Geocoded:  ${checkpoint.geocodedCount} locations`);
    console.log(`   Deduped:   ${checkpoint.skippedCount} (same address reused)`);
    console.log(`   Failed:    ${checkpoint.failedCount}`);
    console.log(`   Duration:  ${minutes}m ${seconds}s`);
    console.log('');

    // Verify counts
    const verifyResult = await conn.runAndReadAll(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN geocode_quality != 'failed' THEN 1 END) as good,
        COUNT(CASE WHEN geocode_quality = 'failed' THEN 1 END) as failed
      FROM location_coordinates
    `);
    const verify = verifyResult.getRowObjects()[0] as any;
    console.log(`   DB verify: ${verify.total} total, ${verify.good} good, ${verify.failed} failed`);

    deleteCheckpoint();
    console.log('   Checkpoint cleaned up.');

  } finally {
    try {
      conn.closeSync();
    } catch {}
  }
}

async function insertBatch(conn: any, batch: GeocodedResult[]): Promise<void> {
  for (const row of batch) {
    if (row.geocode_quality === 'failed') {
      const sql = `INSERT OR REPLACE INTO location_coordinates (tabc_permit_number, latitude, longitude, geocoded_at, geocode_source, geocode_quality) VALUES ('${escapeSQL(row.tabc_permit_number)}', NULL, NULL, CURRENT_TIMESTAMP, '${escapeSQL(row.geocode_source)}', 'failed')`;
      await conn.runAndReadAll(sql);
    } else {
      const sql = `INSERT OR REPLACE INTO location_coordinates (tabc_permit_number, latitude, longitude, geocoded_at, geocode_source, geocode_quality) VALUES ('${escapeSQL(row.tabc_permit_number)}', ${row.latitude}, ${row.longitude}, CURRENT_TIMESTAMP, '${escapeSQL(row.geocode_source)}', '${escapeSQL(row.geocode_quality)}')`;
      await conn.runAndReadAll(sql);
    }
  }
}

// Run
main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
