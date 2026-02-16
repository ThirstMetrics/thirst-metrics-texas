# Session Handoff - February 16, 2026

## Last Session: Session 2 (Mobile Map & Activity Capture)

### Current State: DEPLOYED but DuckDB needs upload
- **Production server** is running commit `f8c85b6` with 471 geocoded records
- **Local DuckDB** has ALL 29,664 records geocoded (27,398 good, 2,266 failed)
- **FIRST ACTION:** Upload local DuckDB to server (see deploy commands below)

---

## Master Checklist

### ✅ DONE — Session 1 (Photo Upload & Fixes)
- [x] Photo upload multipart fix (Blob → File conversion)
- [x] Mobile SSR error fix (removed `window?.innerHeight` from dynamic import)
- [x] Login Suspense wrapper restored
- [x] SSH key configured
- [x] Build timestamp pattern established

### ✅ DONE — Session 2 (Mobile Map & Activity Capture)
- [x] **Mapbox → MapLibre GL** — switched to free map rendering (no API key needed)
- [x] **Geocoded all 29,664 customer locations** — Census Bureau + Nominatim
- [x] **Category filter pills** — All / Beer / Wine / Spirits on mobile map
- [x] **Pareto tier-colored pins** — green/lightgreen/yellow/orange/red by revenue rank
- [x] **Rich pin tap action sheet** — revenue breakdown, contact, last activity, phone links
- [x] **Inline activity capture** — slide-up sheet with type/notes/photo/GPS/outcome/contact/products
- [x] **Non-geocoded customer list** — shown below map with count badge
- [x] **Coordinates API with revenue** — `/api/customers/coordinates` with tier colors
- [x] **Last activity API** — `/api/customers/[permit]/last-activity` (lazy-loaded on pin tap)
- [x] **DuckDB DECIMAL fix** — lat/lng now serialize as proper floating-point numbers
- [x] **useActivitySubmit hook** — GPS capture + activity POST + photo upload
- [x] **useIsMobile hook** — responsive breakpoint detection
- [x] **Geocoding script** — `scripts/geocode-locations.ts` with checkpoint/resume
- [x] **Deployed to production** (code only — DuckDB still needs upload)

### ❌ NOT DONE — Needs Next Session

#### Critical (deploy blockers)
- [ ] **Upload local DuckDB to production server** — server only has 471 of 29,664 records
- [ ] **Verify mobile map renders on production** with all pins after DuckDB upload

#### Testing needed
- [ ] **Test activity submission end-to-end** — MapActivitySheet → Supabase write on production
- [ ] **Test photo upload on production** — may still have 500 error from prior sessions
- [ ] **Test mobile login flow** — was looping in prior session, may be fixed now
- [ ] **Test desktop view** — ensure MapLibre switch didn't break desktop /customers page

#### Enhancements (future sessions)
- [ ] **Desktop map view** — desktop still shows table only, no map
- [ ] **Retry failed geocodes** — 2,266 addresses (7.6%) failed; could try paid geocoder
- [ ] **OCR search dashboard** — V1.1 feature
- [ ] **Goal tracking UI** — V1.1 feature
- [ ] **Territory management** — V1.1 feature
- [ ] **Upgrade server Node 18 → 20** — Supabase SDK warnings
- [ ] **Get valid Mapbox token** — if user wants Mapbox-quality tiles instead of OpenFreeMap
- [ ] **Run remaining geocodes on server** — or continue SCP approach for DuckDB updates
- [ ] **GitHub Dependabot vulnerabilities** — 3 high, 1 moderate

---

## Deploy Commands

### Upload geocoded DuckDB (REQUIRED FIRST):
```powershell
# Kill server to release DuckDB lock
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "fuser -k 3000/tcp"

# Upload DuckDB (274MB)
scp -i $env:USERPROFILE\.ssh\id_ed25519 "C:\thirst-metrics-texas\data\analytics.duckdb" master_nrbudqgaus@167.71.242.157:~/applications/gnhezcjyuk/public_html/data/analytics.duckdb

# Pull latest code, build, restart
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "cd ~/applications/gnhezcjyuk/public_html && source ~/.nvm/nvm.sh && git pull && npm run build && nohup npx next start -p 3000 > /tmp/next.log 2>&1 &"
```

### Quick restart (no code changes):
```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "fuser -k 3000/tcp; sleep 2; cd ~/applications/gnhezcjyuk/public_html && source ~/.nvm/nvm.sh && nohup npx next start -p 3000 > /tmp/next.log 2>&1 &"
```

---

## Git State
- **Branch:** master
- **Latest commit:** `9381a96` — Prioritize enriched customers in geocoding script ordering
- **All changes committed and pushed** — clean working tree
- **Remote:** https://github.com/ThirstMetrics/thirst-metrics-texas.git

---

## Key Architecture Decisions Made

1. **MapLibre GL JS over Mapbox GL** — free, no token, OSM-based tiles via OpenFreeMap
2. **Census Bureau Geocoder as primary** — free, no API key, excellent for US addresses (~92% hit rate)
3. **Geocoding stored in DuckDB** (not Supabase) — matches existing location_coordinates schema
4. **DuckDB is READ_ONLY in app** — geocoding script opens separately in READ_WRITE mode
5. **Pareto tier calculation is server-side** — done in coordinates API, not client
6. **Lazy-load last activity** — fetched on pin tap, not bulk-loaded with coordinates

---

## Lessons Learned (add to CLAUDE.md)

1. **Mapbox GL v3 requires a valid paid token** — even for basic rendering. MapLibre is the free alternative.
2. **DuckDB DECIMAL types return objects** — `{width, scale, value}` not plain numbers. Must convert: `value / 10^scale`.
3. **Census Bureau Geocoder is surprisingly good** — free, no API key, 92% hit rate on Texas addresses.
4. **Kill Next.js before running DuckDB scripts** — the app holds a READ_ONLY lock that blocks READ_WRITE.
5. **SCP the DuckDB file for deployment** — faster than running geocoding on the constrained server.
6. **Use `fuser -k 3000/tcp`** to reliably free the port on Linux — `pkill` can kill the SSH session too.
