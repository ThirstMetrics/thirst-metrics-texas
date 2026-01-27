# Phase 1: Database Setup - Complete Guide

This guide walks you through setting up the database infrastructure for Thirst Metrics Texas.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Supabase account (free tier is fine)
- Texas.gov API token (optional, but recommended for ingestion)

## Step 1: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js 14
- Supabase client
- DuckDB
- Progress bars and utilities
- Excel parsing (xlsx)

## Step 2: Set Up Supabase

Follow the instructions in [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) to:
1. Create your Supabase project
2. Get your API keys
3. Set up the storage bucket
4. Run the PostgreSQL schema

**Important**: After running the schema, make sure to:
- Copy your Supabase URL and keys to `.env.local`
- Create the `activity-photos` storage bucket
- Set up RLS policies (instructions in setup doc)

## Step 3: Initialize DuckDB

Create and initialize the DuckDB database for analytics:

```bash
npm run tsx scripts/init-duckdb.ts
```

Or if you have tsx installed globally:

```bash
tsx scripts/init-duckdb.ts
```

This will:
- Create the `data/analytics.duckdb` file
- Run the DuckDB schema to create all analytics tables
- Verify tables were created

## Step 4: Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values:
- Supabase URL and keys (from Step 2)
- Mapbox token (get from [mapbox.com](https://mapbox.com))
- Texas.gov API token (optional but recommended)
- DuckDB path (default: `./data/analytics.duckdb`)

## Step 5: Run Data Ingestion

### Option A: Run All Ingestion Scripts (Recommended)

```bash
npm run ingest:all
```

This runs all ingestion scripts in the correct order:
1. Counties (required)
2. Metroplexes (required)
3. Sales Tax (optional)
4. Enrichments (optional)
5. Beverage Receipts (required)

### Option B: Run Individual Scripts

If you prefer to run scripts individually:

```bash
# Counties (must run first)
npm run ingest:counties

# Metroplexes (must run second)
npm run ingest:metroplexes

# Sales Tax (optional)
npm run ingest:sales-tax

# Enrichments (optional)
npm run ingest:enrichments

# Beverage Receipts (requires counties and metroplexes)
npm run ingest:beverage-receipts
```

## Step 6: Verify Data Load

After ingestion completes, verify the data:

### Check DuckDB Tables

You can use DuckDB CLI or create a simple verification script:

```sql
-- Check record counts
SELECT 'mixed_beverage_receipts' as table_name, COUNT(*) as count FROM mixed_beverage_receipts
UNION ALL
SELECT 'location_enrichments', COUNT(*) FROM location_enrichments
UNION ALL
SELECT 'counties', COUNT(*) FROM counties
UNION ALL
SELECT 'metroplexes', COUNT(*) FROM metroplexes
UNION ALL
SELECT 'general_sales_tax', COUNT(*) FROM general_sales_tax;
```

### Expected Results

- **Counties**: ~254 records (one per Texas county)
- **Metroplexes**: ~1,000+ records (ZIP codes mapped to metro areas)
- **Sales Tax**: Varies (county-level sales tax data)
- **Enrichments**: Varies (your proprietary location data)
- **Beverage Receipts**: ~850k+ records (37 months × ~23k/month)

## Troubleshooting

### Issue: "Cannot find module 'xlsx'"

**Solution**: Make sure you ran `npm install`. The xlsx package is in devDependencies.

### Issue: "DuckDB database file not found"

**Solution**: Run `npm run tsx scripts/init-duckdb.ts` first to create the database.

### Issue: "Texas.gov API rate limiting"

**Solution**: 
- Add your `TEXAS_GOV_APP_TOKEN` to `.env.local`
- The script includes retry logic, but you may need to wait between runs
- For initial load, consider running during off-peak hours

### Issue: "County mapping failed"

**Solution**: Make sure counties are ingested before sales tax or beverage receipts. Counties must be loaded first.

### Issue: "Excel file not found"

**Solution**: Ensure your data files are in the `data/` directory:
- `data/Texas_Counties.csv`
- `data/Metroplex.xlsx`
- `data/ProprietaryData.xlsx`
- `data/Sales_Tax.csv`

## Next Steps

After Phase 1 is complete:

1. ✅ Supabase project created and configured
2. ✅ PostgreSQL schema deployed
3. ✅ DuckDB initialized with analytics schema
4. ✅ All data ingested (37 months for staging)

You're ready to move to **Phase 2: Auth & Core UI**!

## Notes

- **Initial Load**: The beverage receipts script loads 37 months of data for staging
- **Monthly Updates**: After initial load, monthly updates will be ~23k new records
- **Storage**: Photos are stored in Supabase Storage, not DuckDB
- **Performance**: DuckDB is optimized for read-only analytical queries
