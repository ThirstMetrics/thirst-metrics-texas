# SPEC-006: Data Ingestion Best Practices

## Overview
This document defines mandatory practices for all data ingestion scripts across all environments (local, Cloudways, AWS, Azure, Docker).

## Core Principles

### 1. Batch Processing (MANDATORY)
- **Never load entire datasets into memory**
- Process records in configurable batch sizes
- Default batch sizes by environment:
  - Local development: 5,000 records
  - Cloudways (shared hosting): 1,000 records
  - Azure/AWS (dedicated): 10,000 records
  - Docker (configurable): Use ENV variable `INGESTION_BATCH_SIZE`

### 2. Commit Strategy
- **Commit after each batch, not at the end**
- Each batch = one transaction
- If batch N fails, batches 1 through N-1 are already saved
- Log batch completion with record counts

### 3. Progress Tracking
- Log progress every batch: `"Processed 50,000 of 850,000 records (5.9%)"`
- Include elapsed time and estimated time remaining
- Write progress to a checkpoint file for resume capability

### 4. Checkpoint/Resume Support
- Maintain checkpoint file: `data/.ingestion-checkpoint-{script-name}.json`
- Checkpoint contains: `{ lastProcessedRow: 50000, lastBatchTime: "2026-02-06T18:30:00Z" }`
- On restart, check for checkpoint and resume from last position
- Delete checkpoint file on successful completion

### 5. Memory Management
- Use streaming/cursor-based CSV reading (not `fs.readFileSync`)
- Process row-by-row or batch-by-batch
- Release references after each batch to allow garbage collection
- Monitor memory usage in logs for large ingestions

### 6. Error Handling
- Catch errors at batch level, not record level (for performance)
- On batch failure: log failed batch range, continue to next batch OR stop (configurable)
- Generate error report: `data/.ingestion-errors-{script-name}.json`
- Include: failed record data, error message, batch number

### 7. Duplicate Handling
- Use UPSERT (INSERT OR REPLACE) instead of INSERT where possible
- Or: DELETE existing + INSERT (within same transaction)
- Or: Check existence before insert (slower but explicit)
- Document chosen strategy per table

### 8. Environment Detection
```typescript
function getIngestionConfig() {
  const env = process.env.DEPLOYMENT_ENV || 'local';

  const configs = {
    local: { batchSize: 5000, commitEvery: 5000, logEvery: 10000 },
    cloudways: { batchSize: 1000, commitEvery: 1000, logEvery: 5000 },
    azure: { batchSize: 10000, commitEvery: 10000, logEvery: 50000 },
    docker: {
      batchSize: parseInt(process.env.INGESTION_BATCH_SIZE || '5000'),
      commitEvery: parseInt(process.env.INGESTION_COMMIT_EVERY || '5000'),
      logEvery: parseInt(process.env.INGESTION_LOG_EVERY || '10000')
    }
  };

  return configs[env] || configs.local;
}
```

## Implementation Template

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import * as duckdb from 'duckdb';

interface IngestionCheckpoint {
  lastProcessedRow: number;
  lastBatchTime: string;
  totalRows?: number;
}

async function ingestWithBestPractices(
  csvPath: string,
  tableName: string,
  db: duckdb.Database,
  options: {
    batchSize: number;
    onProgress?: (processed: number, total: number) => void;
    resume?: boolean;
  }
) {
  const checkpointPath = `data/.ingestion-checkpoint-${tableName}.json`;
  let startRow = 0;

  // Check for existing checkpoint
  if (options.resume && fs.existsSync(checkpointPath)) {
    const checkpoint: IngestionCheckpoint = JSON.parse(
      fs.readFileSync(checkpointPath, 'utf-8')
    );
    startRow = checkpoint.lastProcessedRow;
    console.log(`Resuming from row ${startRow}`);
  }

  const parser = fs.createReadStream(csvPath).pipe(
    parse({ columns: true, skip_lines: startRow })
  );

  let batch: any[] = [];
  let processedCount = startRow;
  let totalCount = 0; // Would need to count lines first or track

  for await (const record of parser) {
    batch.push(record);

    if (batch.length >= options.batchSize) {
      // Insert batch
      await insertBatch(db, tableName, batch);
      processedCount += batch.length;

      // Save checkpoint
      const checkpoint: IngestionCheckpoint = {
        lastProcessedRow: processedCount,
        lastBatchTime: new Date().toISOString()
      };
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint));

      // Log progress
      console.log(`Processed ${processedCount.toLocaleString()} records...`);
      options.onProgress?.(processedCount, totalCount);

      // Clear batch for GC
      batch = [];
    }
  }

  // Final batch
  if (batch.length > 0) {
    await insertBatch(db, tableName, batch);
    processedCount += batch.length;
  }

  // Clean up checkpoint on success
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }

  console.log(`Completed: ${processedCount.toLocaleString()} total records`);
}

async function insertBatch(db: duckdb.Database, table: string, records: any[]) {
  // Use prepared statement for efficiency
  // Implementation depends on table schema
  // MUST use transaction per batch
}
```

## Pre-Ingestion Checklist

Before running any ingestion:

- [ ] Verify source file exists and is readable
- [ ] Check available disk space (need ~2x final DB size)
- [ ] Check available memory (batch_size * avg_record_size < available RAM)
- [ ] Verify database connection
- [ ] Confirm batch size appropriate for environment
- [ ] Test with small subset first (100 records)

## Post-Ingestion Verification

After ingestion completes:

```sql
-- Verify record counts
SELECT COUNT(*) FROM table_name;

-- Check for duplicates (if applicable)
SELECT primary_key, COUNT(*)
FROM table_name
GROUP BY primary_key
HAVING COUNT(*) > 1;

-- Verify data integrity
SELECT MIN(date_col), MAX(date_col) FROM table_name;
```

## Environment Variables

Add to `.env.local` or environment config:

```env
# Ingestion Configuration
DEPLOYMENT_ENV=cloudways  # local | cloudways | azure | docker
INGESTION_BATCH_SIZE=1000
INGESTION_COMMIT_EVERY=1000
INGESTION_LOG_EVERY=5000
INGESTION_RESUME_ON_RESTART=true
```

## Applying to Existing Scripts

Priority order for refactoring:

1. `ingest-beverage-receipts.ts` - 850k records, highest risk
2. `ingest-sales-tax.ts` - Large dataset
3. `ingest-enrichments.ts` - Medium dataset
4. `ingest-counties.ts` - Small, low priority
5. `ingest-metroplexes.ts` - Small, low priority

## References

- DuckDB bulk loading: https://duckdb.org/docs/data/csv/overview
- Node.js streams: https://nodejs.org/api/stream.html
- csv-parse streaming: https://csv.js.org/parse/api/stream/
