# Thirst Metrics Texas

Sales intelligence platform for beverage distributors in Texas. Combines state liquor license data with CRM functionality to help sales teams prioritize accounts, track activities, and prove field presence via GPS verification.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Up Environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase and Mapbox credentials
   ```

3. **Set Up Supabase**
   - Follow instructions in [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md)
   - Run the PostgreSQL schema from `docs/schema.sql`

4. **Initialize DuckDB**
   ```bash
   npm run init:duckdb
   ```

5. **Ingest Data**
   ```bash
   npm run ingest:all
   ```

6. **Start Development Server**
   ```bash
   npm run dev
   ```

## Project Structure

```
thirst-metrics-texas/
├── app/                    # Next.js app directory
├── components/              # React components
├── lib/                    # Utility libraries
├── scripts/                # Data ingestion scripts
├── docs/                   # Documentation
├── data/                   # Data files and DuckDB database
└── claude.md              # Project specification
```

## Documentation

- [`docs/PHASE1_SETUP.md`](./docs/PHASE1_SETUP.md) - Phase 1 setup guide
- [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md) - Supabase configuration
- [`docs/schema.sql`](./docs/schema.sql) - PostgreSQL schema
- [`docs/duckdb_schema.sql`](./docs/duckdb_schema.sql) - DuckDB schema
- [`claude.md`](./claude.md) - Complete project specification

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run init:duckdb` - Initialize DuckDB database
- `npm run ingest:all` - Run all data ingestion scripts
- `npm run ingest:counties` - Ingest counties data
- `npm run ingest:metroplexes` - Ingest metroplexes data
- `npm run ingest:sales-tax` - Ingest sales tax data
- `npm run ingest:enrichments` - Ingest location enrichments
- `npm run ingest:beverage-receipts` - Ingest beverage receipts from API

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Analytics**: DuckDB
- **Maps**: Mapbox GL JS
- **Charts**: Recharts

## Beta Launch

- **Target Date**: March 1, 2026
- **Paid Subscriptions**: April 1, 2026

## License

Proprietary - All rights reserved
