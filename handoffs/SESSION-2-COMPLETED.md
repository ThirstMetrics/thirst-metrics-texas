# Session 2 COMPLETED: Mobile Map & Activity Capture

## Quick Start
```bash
cd C:\thirst-metrics-texas
npm run dev
```
Test mobile at: http://localhost:3000/customers (Chrome DevTools mobile emulation)
Production: https://thirstmetrics.com/customers (mobile browser)

---

## Project Context
**App:** Thirst Metrics Texas - Sales CRM for beverage distribution
**Stack:** Next.js 14, TypeScript, Supabase, DuckDB, MapLibre GL JS
**Repo:** `C:\thirst-metrics-texas` | GitHub: ThirstMetrics/thirst-metrics-texas

## Server
- **Host:** 167.71.242.157 | **User:** master_nrbudqgaus
- **SSH:** `ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157`
- **App Path:** ~/applications/gnhezcjyuk/public_html
- **Node:** 18.x (should upgrade to 20.x)

---

## What Was Done This Session

### 1. Switched from Mapbox GL to MapLibre GL (FREE)
**Problem:** The Mapbox public token (`pk.eyJ1IjoicGluZzUyODAi...`) was completely invalid — returned 401 on ALL Mapbox APIs. Mapbox GL v3 requires a paid token even for basic map rendering.

**Solution:** Replaced `mapbox-gl` with `maplibre-gl` + OpenFreeMap tiles.
- **Zero API cost** — no token, no key, no account needed
- OpenFreeMap uses OpenStreetMap data, free forever
- API is nearly identical to Mapbox GL (drop-in replacement)
- File: `components/customer-map.tsx` — completely rewritten

### 2. Geocoded All 29,664 Customer Locations
**Problem:** DuckDB `location_coordinates` table was completely empty (0 records). The map API does `INNER JOIN location_coordinates` which returned 0 results.

**Solution:** Created `scripts/geocode-locations.ts` using free geocoding APIs:
- **Primary:** US Census Bureau Geocoder (free, no API key, designed for US addresses)
- **Fallback:** Nominatim/OpenStreetMap (free, 1 req/sec)
- **Results:** 27,398 with valid coordinates, 2,266 failed (~7.6% failure rate)
- Enriched customers geocoded first, ordered by revenue
- Script has checkpoint/resume for reliability

### 3. Built Mobile Map with Rich Features
- **Category filter pills** (All / Beer / Wine / Spirits) at top of mobile map
- **Pareto-style tier-colored pins** — green (top 25% revenue), lightgreen (25-50%), yellow (50-60%), orange (60-80%), red (bottom 20%)
- **Pin tap action sheet** with:
  - Revenue breakdown (Wine / Beer / Spirits dollar amounts)
  - Tier badge (e.g., "Top 25%")
  - Lazy-loaded last activity (contact name, phone, date, notes, outcome)
  - Tappable phone links
  - "Record Activity" button
- **Inline activity capture** — slide-up sheet with type/notes/photo/GPS/outcome/contact/products
- **Non-geocoded customer list** below map with count badge

### 4. Fixed DuckDB DECIMAL Serialization
**Problem:** DuckDB returns `DECIMAL(10,8)` as objects `{width:10, scale:8, value:2975200458n}` instead of plain numbers. Lat/lng values were not usable.

**Solution:** Added handler in `lib/duckdb/connection.ts` `convertBigIntToNumber()` to convert `value / 10^scale`.

### 5. Extended Coordinates API
- File: `app/api/customers/coordinates/route.ts`
- Added revenue aggregation (beer/wine/liquor/total) from last 12 months
- Added `category` filter param (all/beer/wine/spirits)
- Added Pareto-style tier color assignment
- Returns both geocoded customers (map pins) and non-geocoded (list)

### 6. New API Endpoints
- `GET /api/customers/[permit]/last-activity` — lazy-loads most recent sales_activity for a permit
- `GET /api/geocode` — single-address geocoding endpoint

### 7. New Hooks & Components
- `lib/hooks/use-activity-submit.ts` — GPS capture + activity POST + sequential photo upload
- `lib/hooks/use-media-query.ts` — `useIsMobile()` responsive hook
- `components/map-activity-sheet.tsx` — slide-up activity form for mobile
- `components/skeleton.tsx` — loading skeletons for map, table, etc.
- `components/error-fallback.tsx` — graceful error display

---

## Commits This Session
```
9381a96 Prioritize enriched customers in geocoding script ordering
f8c85b6 Fix DuckDB DECIMAL type serialization for lat/lng coordinates
ad9889f Session 2: Mobile map with MapLibre, tier-colored pins, activity capture
```

---

## Current Production Status
- **Last deployed:** Commit `f8c85b6` (DECIMAL fix)
- **DuckDB on server:** Has 471 geocoded records (from first batch)
- **DuckDB local:** Has ALL 29,664 records geocoded (27,398 good)
- **ACTION NEEDED:** Upload local DuckDB to server (see deploy commands below)

---

## Key Files Modified/Created

| File | What Changed |
|------|-------------|
| `components/customer-map.tsx` | **Rewritten** — Mapbox GL → MapLibre GL + OpenFreeMap |
| `components/mobile-customer-view.tsx` | **Major rewrite** — category filters, rich action sheet, activity capture |
| `components/map-activity-sheet.tsx` | **NEW** — slide-up activity form |
| `components/customer-list-client.tsx` | Added `userId` prop passthrough |
| `app/api/customers/coordinates/route.ts` | **NEW** — revenue + tier colors + non-geocoded list |
| `app/api/customers/[permit]/last-activity/route.ts` | **NEW** — lazy-load last activity |
| `app/customers/page.tsx` | Added `userId={user.id}` to client component |
| `lib/duckdb/connection.ts` | Fixed DECIMAL type serialization |
| `lib/hooks/use-activity-submit.ts` | **NEW** — GPS + activity + photo upload hook |
| `lib/hooks/use-media-query.ts` | **NEW** — `useIsMobile()` hook |
| `lib/mapbox/geocode.ts` | **NEW** — Mapbox geocoding lib (for future use if valid token obtained) |
| `scripts/geocode-locations.ts` | **NEW** — batch geocoding with Census Bureau + Nominatim |
| `package.json` | Added `maplibre-gl` dependency |

---

## Deploy Commands

### Upload geocoded DuckDB to server (REQUIRED — server only has 471 records):
```powershell
# 1. Kill server to release DuckDB lock
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "fuser -k 3000/tcp"

# 2. Upload local DuckDB (274MB, takes ~1 min)
scp -i $env:USERPROFILE\.ssh\id_ed25519 "C:\thirst-metrics-texas\data\analytics.duckdb" master_nrbudqgaus@167.71.242.157:~/applications/gnhezcjyuk/public_html/data/analytics.duckdb

# 3. Pull latest code, build, restart
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "cd ~/applications/gnhezcjyuk/public_html && source ~/.nvm/nvm.sh && git pull && npm run build && nohup npx next start -p 3000 > /tmp/next.log 2>&1 &"
```

### Quick restart only (no code changes):
```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "fuser -k 3000/tcp; sleep 2; cd ~/applications/gnhezcjyuk/public_html && source ~/.nvm/nvm.sh && nohup npx next start -p 3000 > /tmp/next.log 2>&1 &"
```

---

## Known Issues & Limitations

1. **Mapbox token is invalid** — `pk.eyJ1IjoicGluZzUyODAi...` returns 401. Doesn't matter now since we use MapLibre, but `lib/mapbox/geocode.ts` still references it. If user obtains a valid Mapbox token, update `.env.local`.

2. **2,266 failed geocodes (~7.6%)** — These are unusual addresses the Census Bureau and Nominatim couldn't resolve. Stored as `geocode_quality = 'failed'` in DuckDB. Could be retried with a paid geocoder later.

3. **Server DuckDB is stale** — Production server only has 471 geocoded records. The local DuckDB has all 29,664. Must SCP the file to production (see deploy commands above).

4. **Activity submission untested end-to-end** — The `MapActivitySheet` and `useActivitySubmit` hook are built but haven't been tested with real Supabase writes on production. The `/api/activities` POST endpoint exists from prior sessions.

5. **Photo upload may still have issues** — Previous sessions noted a 500 error ("Unexpected end of multipart data") on photo upload. The `useActivitySubmit` hook compresses photos client-side before uploading.

6. **Desktop map view** — Desktop still shows the old customer table. The map is mobile-only right now. Desktop could be enhanced to also show the map view.

---

## Geocoding Script Reference

```bash
# Run all remaining (if any fail and need retry):
npx tsx scripts/geocode-locations.ts

# Limit to N records:
npx tsx scripts/geocode-locations.ts --limit 5000

# Resume from checkpoint after interruption:
npx tsx scripts/geocode-locations.ts --resume

# Dry run (no API calls, no DB writes):
npx tsx scripts/geocode-locations.ts --dry-run --limit 100
```

**IMPORTANT:** Next.js dev/prod server must NOT be running when geocoding — both need DuckDB access and the script requires READ_WRITE mode.

---

## Architecture Notes

### Map Rendering Stack
```
MapLibre GL JS (free, open-source)
  └── OpenFreeMap tiles (free, no key, OSM data)
       └── Rendered in components/customer-map.tsx
            └── Dynamic import with ssr: false (no SSR for map)
```

### Data Flow for Map
```
Mobile Customer View
  → GET /api/customers/coordinates?category=all&monthsBack=12
    → DuckDB: JOIN mixed_beverage_receipts + location_coordinates + location_enrichments
    → Server-side: assignTierColors() (Pareto cumulative revenue)
    → Response: { customers: [...with lat/lng/revenue/tier], nonGeocodedCustomers: [...] }
  → Pin tap → action sheet with revenue data
  → "Record Activity" → MapActivitySheet → useActivitySubmit hook
    → Browser GPS capture
    → POST /api/activities (Supabase)
    → Sequential photo uploads to /api/photos
```

### Geocoding Stack (for batch processing)
```
scripts/geocode-locations.ts
  → Primary: US Census Bureau Geocoder (free, no key)
  → Fallback: Nominatim/OpenStreetMap (free, 1 req/sec)
  → Writes to: DuckDB location_coordinates table (READ_WRITE mode)
  → Checkpoint: data/.ingestion-checkpoint-geocode.json
```
