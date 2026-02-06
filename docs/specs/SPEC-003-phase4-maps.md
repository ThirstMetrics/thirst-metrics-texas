# SPEC-003: Phase 4 — Maps Integration (Mapbox GL JS)

**Priority**: After Phase 5 (SPEC-002)
**Phase**: 4
**Dependencies**: Mapbox token already configured in `.env.local`

---

## Objective

Add a map view to the customer list page so sales reps can see customer locations geographically. Implement lazy geocoding to conserve the Mapbox free tier (100k geocodes/month).

---

## Task 1: Geocoding Data Layer

**Files**: NEW `lib/mapbox/geocode.ts`, update `lib/duckdb/connection.ts` queries

### Requirements

1. **Create `lib/mapbox/geocode.ts`**:
   ```typescript
   interface GeocodeResult {
     latitude: number;
     longitude: number;
     quality: 'exact' | 'approximate' | 'failed';
     source: 'mapbox';
   }

   export async function geocodeAddress(
     address: string, city: string, state: string, zip: string
   ): Promise<GeocodeResult>

   export async function batchGeocode(
     locations: Array<{ permitNumber: string; address: string; city: string; state: string; zip: string }>
   ): Promise<Map<string, GeocodeResult>>
   ```

2. **Lazy geocoding pattern**:
   - When a customer detail page is viewed, check `location_coordinates` table in DuckDB
   - If no coordinates exist, geocode on-the-fly and store the result
   - Never geocode the same permit number twice (check before calling Mapbox API)
   - Rate limit: max 50 geocode calls per minute (Mapbox free tier limit)

3. **API endpoint**: `app/api/geocode/route.ts`
   - POST with `{ permitNumber, address, city, state, zip }`
   - Returns `{ latitude, longitude, quality }`
   - Stores result in DuckDB `location_coordinates` table
   - Auth required

4. **Batch geocode script**: `scripts/geocode-locations.ts`
   - Geocode all locations that don't have coordinates yet
   - Process in batches of 50 with 1-second delay between batches
   - Progress bar with cli-progress
   - Log: total geocoded, exact matches, approximate, failed
   - Add to `package.json` scripts: `"geocode": "tsx scripts/geocode-locations.ts"`

### Acceptance Criteria
- [ ] Single geocode returns result in < 500ms
- [ ] Batch geocode respects rate limits
- [ ] Results stored in DuckDB `location_coordinates` table
- [ ] Duplicate geocode requests are skipped (check before API call)

---

## Task 2: Customer Map Component

**Files**: NEW `components/customer-map.tsx`

### Requirements

1. **Map component using Mapbox GL JS**:
   - Full-width container, height 500px (desktop) / 300px (mobile)
   - Default center: Texas center (31.9686, -99.9018), zoom 6
   - Map style: `mapbox://styles/mapbox/streets-v12` (light theme)
   - Load Mapbox GL CSS from CDN (add to `app/layout.tsx` or component-level import)

2. **Markers**:
   - One marker per customer location (only for customers with coordinates)
   - Marker color based on total revenue:
     - Green (#16a34a): > $100k
     - Blue (#667eea): $10k–$100k
     - Gray (#999): < $10k
   - Cluster markers when zoomed out (use Mapbox GL clustering)

3. **Marker popup** (click to show):
   - Customer name (bold)
   - Address (one line)
   - Total revenue (formatted currency)
   - "View Details →" link to `/customers/[permit]`

4. **Map controls**:
   - Zoom buttons (built-in Mapbox control)
   - Fullscreen toggle
   - "Fit to markers" button that adjusts bounds to show all visible markers

### Props
```typescript
interface CustomerMapProps {
  customers: Array<{
    tabc_permit_number: string;
    location_name: string;
    location_address: string;
    location_city: string;
    total_revenue: number;
    latitude?: number;
    longitude?: number;
  }>;
  onCustomerClick?: (permitNumber: string) => void;
}
```

### Acceptance Criteria
- [ ] Map renders with Texas-centered view
- [ ] Markers appear for customers with coordinates
- [ ] Clicking marker shows popup with customer info
- [ ] "View Details" link navigates to customer detail page
- [ ] Clusters form when markers overlap at low zoom levels
- [ ] Map is responsive (fills container width on mobile and desktop)

---

## Task 3: Integrate Map into Customer List Page

**Files**: `app/customers/page.tsx`, `components/customer-list-client.tsx`

### Requirements

1. **Toggle between list and map view**:
   - Add a view toggle button group at the top of the customer page: [List] [Map]
   - Default: List view (current behavior)
   - Map view: show the CustomerMap component with filtered customers
   - The same filters (county, metroplex, search, revenue) apply to both views
   - Switching views preserves filter state

2. **Map data loading**:
   - When map view is active, fetch customer coordinates from a new endpoint
   - `GET /api/customers/coordinates` — returns customers with lat/lon from DuckDB join
   - Only return customers that have been geocoded (skip those without coordinates)
   - Apply the same filters as the list view

3. **Performance**:
   - Don't load map assets (Mapbox GL JS, CSS) until the user clicks the Map toggle
   - Use `dynamic(() => import('./customer-map'), { ssr: false })` for code splitting
   - Limit map to showing max 500 markers at a time (use server-side pagination/limits)

### Acceptance Criteria
- [ ] List/Map toggle switches views without losing filter state
- [ ] Map shows filtered customers only
- [ ] Mapbox assets are lazy-loaded (not in initial bundle)
- [ ] Map doesn't exceed 500 markers (performance guard)

---

## Task 4: Map on Customer Detail Page

**Files**: `components/customer-detail-client.tsx`

### Requirements

1. **Small embedded map** on the customer detail page:
   - Below the customer info card (or beside it on desktop)
   - Height: 200px
   - Centered on the customer's coordinates (if available)
   - Single marker at the customer's location
   - Zoom level 15 (street-level)
   - If no coordinates: show a "Location not mapped" message with a "Geocode" button
   - "Geocode" button calls `/api/geocode` and updates the map on success

2. **GPS verification view** (manager role only):
   - If the customer has activities with GPS data, show a second marker (red) for the most recent GPS capture
   - Draw a line between the business location and the GPS location
   - Show distance in meters between the two points
   - This helps managers verify that sales reps actually visited the location

### Acceptance Criteria
- [ ] Map renders on customer detail page with correct pin
- [ ] "Geocode" button works for un-geocoded locations
- [ ] Manager GPS verification shows both pins and distance
- [ ] Non-managers don't see GPS verification layer

---

## Technical Notes

### Mapbox GL JS in Next.js
- Import `mapbox-gl` dynamically (it uses `window` and can't be server-rendered)
- The `next.config.js` already has IgnorePlugin for @mapbox HTML parsing
- Use `mapbox-gl/dist/mapbox-gl.css` for styles

### DuckDB Coordinates Table
The schema already exists in `docs/duckdb_schema.sql`:
```sql
CREATE TABLE location_coordinates (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geocoded_at TIMESTAMP,
  geocode_source VARCHAR(20),
  geocode_quality VARCHAR(20)
);
```

### Mapbox Token
Already in `.env.local`:
- `NEXT_PUBLIC_MAPBOX_TOKEN` — client-side (for map rendering)
- `MAPBOX_ACCESS_TOKEN` — server-side (for geocoding API calls)

---

## Files Modified/Created (expected)
- `lib/mapbox/geocode.ts` — NEW
- `app/api/geocode/route.ts` — NEW
- `app/api/customers/coordinates/route.ts` — NEW
- `components/customer-map.tsx` — NEW
- `scripts/geocode-locations.ts` — NEW
- `components/customer-list-client.tsx` — add list/map toggle
- `components/customer-detail-client.tsx` — add embedded map
- `app/customers/page.tsx` — support map view
- `package.json` — add geocode script

## Out of Scope
- Heat map overlay (post-beta)
- Route planning for sales reps (post-beta)
- Geofencing alerts (post-beta)
- Drawing territory boundaries on map (post-beta)
