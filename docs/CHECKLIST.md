# Phase 1 Setup Checklist

Use this checklist to verify Phase 1 is complete before moving to Phase 2.

## Pre-requisites
- [ ] Node.js 18+ installed
- [ ] npm or yarn installed
- [ ] Supabase account created
- [ ] Mapbox account created (for Phase 2+)

## Environment Setup
- [ ] `.env.local` file created from `.env.example`
- [ ] `TEXAS_APP_TOKEN` added to `.env.local`
- [ ] Supabase credentials added to `.env.local`
- [ ] Mapbox token added to `.env.local` (for Phase 2+)

## Supabase Setup
- [ ] Supabase project created
- [ ] PostgreSQL schema run (`docs/schema.sql`)
- [ ] Storage bucket `activity-photos` created
- [ ] RLS policies configured (see `docs/SUPABASE_SETUP.md`)
- [ ] Test connection to Supabase works

## DuckDB Setup
- [ ] Dependencies installed (`npm install`)
- [ ] DuckDB initialized (`npm run init:duckdb`)
- [ ] All tables created successfully
- [ ] Verified table count matches schema

## Data Files
- [ ] `data/Texas_Counties.csv` present
- [ ] `data/Metroplex.xlsx` present
- [ ] `data/ProprietaryData.xlsx` present
- [ ] `data/Sales_Tax.csv` present

## Data Ingestion
- [ ] Counties ingested (`npm run ingest:counties`)
- [ ] Metroplexes ingested (`npm run ingest:metroplexes`)
- [ ] Sales tax ingested (`npm run ingest:sales-tax`) - Optional
- [ ] Enrichments ingested (`npm run ingest:enrichments`) - Optional
- [ ] Beverage receipts ingested (`npm run ingest:beverage-receipts`)

## Verification
- [ ] County count: ~254 records
- [ ] Metroplex count: ~1,000+ records
- [ ] Beverage receipts: ~850k+ records (37 months)
- [ ] No critical errors in ingestion logs

## Documentation
- [ ] Read `docs/PHASE1_SETUP.md`
- [ ] Read `docs/SUPABASE_SETUP.md`
- [ ] Read `docs/INGESTION_NOTES.md`
- [ ] Read `claude.md` for project overview

## Ready for Phase 2?
- [ ] All items above checked
- [ ] Can query DuckDB successfully
- [ ] Can connect to Supabase successfully
- [ ] Data ingestion completed without critical errors

---

**Next Steps**: Proceed to Phase 2: Auth & Core UI
