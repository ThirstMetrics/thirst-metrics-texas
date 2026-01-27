# Technical Review - Thirst Metrics Texas

## Schema Review: No Major Corner-Painting Issues ✅

The schema is solid. Here are a few refinements and one design decision to confirm:

---

## Issue 1: Contact Info Duplication

**Current**: Contact fields (name, phone, email, availability) are on `sales_activities`.

**Problem**: If a salesperson visits "Joe's Bar" 5 times, they either:
- Re-enter contact info each time (tedious)
- You pre-populate from the last activity (better)

**Options**:

**Option A (Recommended for Beta)**: Keep as-is, auto-populate from most recent activity
```typescript
// When creating new activity, fetch last contact info for this permit
const lastActivity = await getLatestActivity(permit);
form.setDefaults({
  contact_name: lastActivity?.contact_name,
  contact_cell_phone: lastActivity?.contact_cell_phone,
  // etc.
});
```

**Option B (V2)**: Create separate `location_contacts` table
```sql
CREATE TABLE location_contacts (
  id UUID PRIMARY KEY,
  tabc_permit_number VARCHAR(20) NOT NULL,
  contact_name VARCHAR(255),
  contact_cell_phone VARCHAR(20),
  contact_email VARCHAR(255),
  contact_preferred_method VARCHAR(20),
  is_decision_maker BOOLEAN,
  -- availability fields --
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**My Recommendation**: Go with Option A for beta. It's simpler and you can refactor to Option B later if users request contact management features.

---

## Issue 2: Cross-Database Joins

**Situation**: User activities in PostgreSQL (Supabase), beverage receipts in DuckDB.

**Potential Problem**: When showing "customer detail" page, you need:
- Revenue data (DuckDB)
- Activity history (PostgreSQL)
- Both joined on `tabc_permit_number`

**Solution**: Query both databases separately, merge in application code.

```typescript
// lib/data/locations.ts
async function getCustomerDetail(permit: string) {
  const [receipts, activities, enrichment, coordinates] = await Promise.all([
    duckdb.query(`SELECT * FROM mixed_beverage_receipts WHERE tabc_permit_number = ?`, [permit]),
    supabase.from('sales_activities').select('*').eq('tabc_permit_number', permit),
    duckdb.query(`SELECT * FROM location_enrichments WHERE tabc_permit_number = ?`, [permit]),
    duckdb.query(`SELECT * FROM location_coordinates WHERE tabc_permit_number = ?`, [permit])
  ]);
  
  return { receipts, activities, enrichment, coordinates };
}
```

This is fine. The parallel queries keep it fast.

---

## Issue 3: GPS Verification Display

**Need**: Managers compare phone GPS vs business location.

**Current Schema**: 
- Phone GPS: `sales_activities.gps_latitude/longitude`
- Business location: `location_coordinates.latitude/longitude`

**Works**: Just need to join them in the UI. Add a "distance from business" calculation:

```typescript
// Calculate distance between phone GPS and business location
function getDistanceMeters(phone: {lat, lng}, business: {lat, lng}): number {
  // Haversine formula
  // If > 500 meters, flag as "remote entry"
}
```

**UI Suggestion**: Show a badge on activity records:
- 🟢 "On-site" (< 100m)
- 🟡 "Nearby" (100m - 500m)  
- 🔴 "Remote" (> 500m)

---

## Issue 4: OCR Language Packs

**Plan**: Use Tesseract.js for OCR with French, Spanish, Italian, German support.

**Trade-off**: Each language pack is ~15-30MB. Loading all client-side is heavy.

**Options**:

**Option A**: Client-side Tesseract.js, lazy-load language packs
```typescript
// Only load languages when needed
const worker = await createWorker(['eng', 'spa', 'fra']);  // ~60MB
```

**Option B (Recommended)**: Server-side OCR via API route
```typescript
// /api/photos/upload processes OCR server-side
// User uploads → server compresses, OCRs, stores
// No language pack bloat on client
```

**My Recommendation**: Option B. Do OCR server-side. Better UX, no client bloat, can use more powerful Tesseract settings.

---

## Issue 5: Lazy Geocoding UX

**Plan**: Geocode locations only when user first views them.

**Problem**: First viewer experiences a delay while Mapbox API is called.

**Better Approach**: 
1. Show map immediately with a "Locating..." marker
2. Fire geocoding request in background
3. Update marker position when complete
4. Cache result in `location_coordinates`

```typescript
// Optimistic UI
function CustomerMap({ permit }) {
  const [coords, setCoords] = useState(null);
  
  useEffect(() => {
    // Check cache first
    const cached = await getCoordinates(permit);
    if (cached) {
      setCoords(cached);
    } else {
      // Show approximate location based on ZIP centroid while geocoding
      const zip = customer.location_zip;
      setCoords(ZIP_CENTROIDS[zip]);  // Rough location
      
      // Geocode in background
      const precise = await geocodeAddress(customer.address);
      setCoords(precise);
      await saveCoordinates(permit, precise);
    }
  }, [permit]);
}
```

---

## Issue 6: Ingestion Idempotency

**Situation**: Monthly ingestion adds ~23k records.

**Important**: Script must handle re-runs gracefully (idempotent).

**Current key**: `location_month_key = {permit}_{obligation_end_date}`

**Approach**: Use UPSERT (INSERT ... ON CONFLICT UPDATE)
```sql
INSERT INTO mixed_beverage_receipts (location_month_key, ...)
VALUES (?, ...)
ON CONFLICT (location_month_key) 
DO UPDATE SET 
  total_receipts = EXCLUDED.total_receipts,
  -- etc
```

**Tracking modified records**: 
```typescript
let added = 0, modified = 0;

for (const record of records) {
  const result = await db.upsert(record);
  if (result.inserted) added++;
  if (result.updated) modified++;
  
  if ((added + modified) % 50 === 0) {
    console.log(`🔄 Processing: ${added + modified} records...`);
  }
}

console.log(`✅ Added: ${added}, Modified: ${modified}`);
```

---

## Confirmed Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Contact info storage | On activity record | Simpler for beta, can refactor |
| OCR processing | Server-side | Avoids client bloat |
| Geocoding | Lazy with optimistic UI | Saves Mapbox credits |
| Cross-DB queries | Parallel queries, merge in app | Simple and fast |
| Ingestion | Idempotent upserts | Safe re-runs |

---

## Schema Additions Based on Review

None required. The claude.md schema is good.

**One optional addition** for V1.1:
```sql
-- Add to sales_activities for GPS verification display
ALTER TABLE sales_activities ADD COLUMN gps_distance_from_business DECIMAL(10,2);
-- Pre-calculated during activity creation if business is geocoded
```

---

## Final Verdict

**Ready to build.** No architectural blockers. The hybrid DuckDB/Supabase approach is solid for your query patterns:
- Heavy analytics (aggregations, time series) → DuckDB
- User data with auth (activities, photos) → Supabase
- Maps → Mapbox with lazy geocoding

The 5-week timeline to beta is tight but achievable if you focus on:
1. Core customer list + detail views
2. Activity logging with photos + GPS
3. Basic map view
4. Skip advanced analytics for beta

Good luck! 🚀
