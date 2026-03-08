# Thirst Metrics Texas - Project Claude.md

## Purpose
Sales intelligence platform for beverage distributors in Texas. Combines state liquor license data with CRM functionality to help sales teams prioritize accounts, track activities, and prove field presence via GPS verification.

**Beta Launch: March 1, 2026 | Paid Subscriptions: April 1, 2026**

---

## Project Requirements & Constraints

### Platform & Hosting
- **Hosting**: Cloudways (167.71.242.157), Azure planned for scale
- **Database**: Supabase (PostgreSQL + Auth) + DuckDB (analytics)
- **Storage**: Supabase Storage for photos
- **Maps**: Mapbox (100k free geocodes/month)

### Technical Environment
- Browser-based (mobile + desktop)
- Mobile-first for field sales reps
- No offline mode for beta
- Native app conversion planned for V2

### Data Sources
- **Texas.gov API**: Mixed beverage receipts (3.66M records, ~23k/month new)
- **CSV imports**: Counties, metroplexes, sales tax, location enrichments
- **User-generated**: Activities, photos, contacts

### User Roles
- **Salesperson**: View customers, log activities, see own data
- **Manager**: All salesperson access + team analytics + edit enrichments
- **Admin**: Full access including user management

### Timeline
- **Now → March 1**: Beta with core features
- **April 1**: Paid subscriptions launch
- **Post-200 subscribers**: Hire first employee, add advanced analytics

---

## Tech Stack

```
Frontend:     Next.js 15 (App Router) + TypeScript
Backend:      Supabase (PostgreSQL + Auth + Storage)
Analytics:    DuckDB (read-only analytical queries)
Maps:         Mapbox GL JS + Mapbox Geocoding API
Charts:       Recharts
OCR:          Tesseract.js (client-side) or node-tesseract-ocr (server-side)
Excel:        ExcelJS (for ingestion scripts — replaced xlsx due to CVE)
Progress:     cli-progress + chalk (for ingestion scripts)
Compression:  browser-image-compression (client-side photo compression)
Billing:      Stripe (checkout, subscriptions, webhooks)
```

---

## Database Schema

### PostgreSQL (Supabase) - User/CRM Data

```sql
-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role VARCHAR(20) NOT NULL DEFAULT 'salesperson' CHECK (role IN ('salesperson', 'manager', 'admin')),
  territory_id UUID REFERENCES territories(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  county_codes TEXT[],
  zip_codes TEXT[],
  assigned_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SALES ACTIVITIES (CRM)
-- ============================================

CREATE TABLE sales_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tabc_permit_number VARCHAR(20) NOT NULL,
  
  -- Activity basics
  activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('visit', 'call', 'email', 'note')),
  activity_date DATE NOT NULL,
  notes TEXT,
  outcome VARCHAR(20) CHECK (outcome IN ('positive', 'neutral', 'negative', 'no_contact')),
  next_followup_date DATE,
  
  -- Contact info (customer's contact person)
  contact_name VARCHAR(255),
  contact_cell_phone VARCHAR(20),
  contact_email VARCHAR(255),
  contact_preferred_method VARCHAR(20) CHECK (contact_preferred_method IN ('text', 'call', 'email', 'in_person')),
  decision_maker BOOLEAN DEFAULT false,
  
  -- Availability (customer's availability for meetings)
  avail_monday_am BOOLEAN DEFAULT false,
  avail_monday_pm BOOLEAN DEFAULT false,
  avail_tuesday_am BOOLEAN DEFAULT false,
  avail_tuesday_pm BOOLEAN DEFAULT false,
  avail_wednesday_am BOOLEAN DEFAULT false,
  avail_wednesday_pm BOOLEAN DEFAULT false,
  avail_thursday_am BOOLEAN DEFAULT false,
  avail_thursday_pm BOOLEAN DEFAULT false,
  avail_friday_am BOOLEAN DEFAULT false,
  avail_friday_pm BOOLEAN DEFAULT false,
  avail_saturday_am BOOLEAN DEFAULT false,
  avail_saturday_pm BOOLEAN DEFAULT false,
  avail_sunday_am BOOLEAN DEFAULT false,
  avail_sunday_pm BOOLEAN DEFAULT false,
  
  -- Sales intel
  conversation_summary TEXT,
  product_interest TEXT[],  -- array: beer, wine, spirits, equipment
  current_products_carried TEXT,
  objections TEXT,
  competitors_mentioned TEXT[],
  next_action TEXT,
  
  -- GPS verification (phone location when record created)
  gps_latitude DECIMAL(10, 8),
  gps_longitude DECIMAL(11, 8),
  gps_accuracy_meters DECIMAL(8, 2),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activities_user ON sales_activities(user_id);
CREATE INDEX idx_activities_permit ON sales_activities(tabc_permit_number);
CREATE INDEX idx_activities_date ON sales_activities(activity_date DESC);
CREATE INDEX idx_activities_outcome ON sales_activities(outcome);
CREATE INDEX idx_activities_followup ON sales_activities(next_followup_date);

-- ============================================
-- ACTIVITY PHOTOS
-- ============================================

CREATE TABLE activity_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES sales_activities(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  photo_type VARCHAR(50) CHECK (photo_type IN ('receipt', 'menu', 'product_display', 'shelf', 'other')),
  
  -- OCR extracted text (for future search)
  ocr_text TEXT,
  ocr_processed_at TIMESTAMP,
  ocr_language VARCHAR(10),  -- detected language: en, es, fr, de, it
  
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_photos_activity ON activity_photos(activity_id);
CREATE INDEX idx_photos_ocr ON activity_photos USING gin(to_tsvector('english', ocr_text));

-- ============================================
-- GOALS
-- ============================================

CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  goal_type VARCHAR(30) NOT NULL CHECK (goal_type IN ('revenue', 'growth', 'new_accounts', 'visits')),
  target_value DECIMAL(15, 2) NOT NULL,
  target_date DATE NOT NULL,
  current_value DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'missed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_goals_user ON goals(user_id);
CREATE INDEX idx_goals_status ON goals(status);

-- ============================================
-- CUSTOMER PRIORITIES (cached/computed)
-- ============================================

CREATE TABLE customer_priorities (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  priority_score DECIMAL(5, 2),
  revenue_rank INTEGER,
  growth_rate DECIMAL(8, 4),
  last_activity_date DATE,
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_priorities_score ON customer_priorities(priority_score DESC);
```

### DuckDB - Analytics Data (Read-Only)

**IMPORTANT: DuckDB Integration Fix (Jan 2026)**

We migrated from `duckdb` and `duckdb-async` packages to the official `@duckdb/node-api` package to resolve file locking issues in Next.js.

**Key Implementation Details:**
- **Package**: `@duckdb/node-api` and `@duckdb/node-bindings`
- **Connection Pattern**: Uses `DuckDBInstanceCache` singleton to manage database instances (single file open)
- **API Pattern**: 
  - No params: `connection.runAndReadAll(sql)` → `result.getRowObjects()`
  - With params: `connection.prepare(sql)` → bind params → `prepared.run()` → `result.getRowObjects()`
- **No pending/waitUntilReady**: The `prepared.run()` method returns `DuckDBQueryResult` directly
- **Path Resolution**: Tries `Data/analytics.duckdb` (Windows) then `data/analytics.duckdb`, or uses `DUCKDB_PATH` env var

**File Location**: `lib/duckdb/connection.ts`

**Next.js Config**: Added to `serverExternalPackages` in `next.config.js` to prevent webpack bundling issues.

```sql
-- ============================================
-- MIXED BEVERAGE RECEIPTS (from Texas.gov API)
-- ============================================

CREATE TABLE mixed_beverage_receipts (
  location_month_key VARCHAR(30) PRIMARY KEY,  -- {tabc_permit_number}_{obligation_end_date}
  tabc_permit_number VARCHAR(20) NOT NULL,
  location_name VARCHAR(255),
  location_address VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_zip VARCHAR(10),
  location_county VARCHAR(100),
  location_county_code VARCHAR(3),
  obligation_end_date DATE NOT NULL,
  liquor_receipts DECIMAL(15, 2),
  wine_receipts DECIMAL(15, 2),
  beer_receipts DECIMAL(15, 2),
  cover_charge_receipts DECIMAL(15, 2),
  total_receipts DECIMAL(15, 2),
  responsibility_begin_date DATE,
  responsibility_end_date DATE
);

CREATE INDEX idx_receipts_permit ON mixed_beverage_receipts(tabc_permit_number);
CREATE INDEX idx_receipts_date ON mixed_beverage_receipts(obligation_end_date DESC);
CREATE INDEX idx_receipts_county ON mixed_beverage_receipts(location_county_code);
CREATE INDEX idx_receipts_zip ON mixed_beverage_receipts(location_zip);
CREATE INDEX idx_receipts_filter ON mixed_beverage_receipts(obligation_end_date, location_county_code, location_zip);
CREATE INDEX idx_receipts_history ON mixed_beverage_receipts(tabc_permit_number, obligation_end_date DESC);

-- ============================================
-- LOCATION ENRICHMENTS
-- ============================================

CREATE TABLE location_enrichments (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  clean_dba_name VARCHAR(255),
  ownership_group VARCHAR(255),
  industry_segment VARCHAR(100),
  clean_up_notes TEXT,
  last_updated TIMESTAMP
);

CREATE INDEX idx_enrichments_ownership ON location_enrichments(ownership_group);
CREATE INDEX idx_enrichments_segment ON location_enrichments(industry_segment);

-- ============================================
-- LOCATION COORDINATES (for maps)
-- ============================================

CREATE TABLE location_coordinates (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geocoded_at TIMESTAMP,
  geocode_source VARCHAR(20),  -- mapbox, google, manual
  geocode_quality VARCHAR(20)  -- exact, approximate, failed
);

CREATE INDEX idx_coordinates_quality ON location_coordinates(geocode_quality);

-- ============================================
-- REFERENCE TABLES
-- ============================================

CREATE TABLE counties (
  county_code VARCHAR(3) PRIMARY KEY,  -- zero-padded Texas county number
  county_name VARCHAR(100) NOT NULL,   -- WITHOUT "County" suffix
  county_number SMALLINT NOT NULL      -- raw number 1-254
);

CREATE INDEX idx_counties_name ON counties(county_name);

CREATE TABLE metroplexes (
  zip VARCHAR(5) PRIMARY KEY,
  city_town VARCHAR(100),
  county VARCHAR(100),
  metroplex VARCHAR(100)
);

CREATE INDEX idx_metroplexes_metro ON metroplexes(metroplex);
CREATE INDEX idx_metroplexes_county ON metroplexes(county);

CREATE TABLE general_sales_tax (
  type VARCHAR(10) NOT NULL,           -- COUNTY, MTA, SPD
  name VARCHAR(100) NOT NULL,
  report_year SMALLINT NOT NULL,
  report_month TINYINT NOT NULL,
  report_period_type VARCHAR(20) NOT NULL,
  current_rate DECIMAL(6, 4),
  net_payment_this_period DECIMAL(15, 2),
  comparable_payment_prior_year DECIMAL(15, 2),
  percent_change_from_prior_year DECIMAL(8, 2),
  payments_to_date DECIMAL(15, 2),
  previous_payments_to_date DECIMAL(15, 2),
  percent_change_to_date DECIMAL(8, 2),
  month VARCHAR(7),                    -- YYYY-MM format
  county_code VARCHAR(3),              -- only for type='COUNTY'
  PRIMARY KEY (type, name, report_year, report_month, report_period_type)
);

CREATE INDEX idx_sales_tax_county ON general_sales_tax(county_code);
CREATE INDEX idx_sales_tax_month ON general_sales_tax(month);
CREATE INDEX idx_sales_tax_type ON general_sales_tax(type);
```

---

## File Structure

```
thirst-metrics-texas/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Landing/redirect
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── dashboard/page.tsx
│   ├── customers/
│   │   ├── page.tsx                # Customer list
│   │   └── [permit]/page.tsx       # Customer detail
│   ├── activities/page.tsx
│   ├── analytics/page.tsx          # Advanced analytics (manager/admin)
│   ├── goals/page.tsx              # Goal tracking
│   ├── chains/page.tsx             # Chain/ownership analysis
│   ├── territories/page.tsx        # Territory management (manager/admin)
│   ├── billing/page.tsx            # Stripe billing/subscription
│   ├── admin/page.tsx              # Admin portal
│   └── api/
│       ├── activities/route.ts
│       ├── activities/[activityId]/route.ts  # PATCH/DELETE
│       ├── analytics/route.ts
│       ├── chains/route.ts
│       ├── chains/[ownershipGroup]/route.ts
│       ├── customers/route.ts
│       ├── dashboard/route.ts
│       ├── goals/route.ts
│       ├── goals/[goalId]/route.ts
│       ├── territories/route.ts
│       ├── territories/[territoryId]/route.ts
│       ├── territories/users/route.ts
│       ├── stripe/checkout/route.ts
│       ├── stripe/portal/route.ts
│       ├── stripe/subscription/route.ts
│       └── stripe/webhook/route.ts
├── components/
│   ├── ui/                         # Shadcn components
│   ├── navbar.tsx                  # Global nav bar
│   ├── customer-list-client.tsx
│   ├── customer-detail-client.tsx
│   ├── customer-map.tsx
│   ├── activity-form.tsx           # Create + edit mode
│   ├── activity-timeline.tsx       # With inline edit/delete
│   ├── analytics-client.tsx        # Recharts dashboards
│   ├── goal-form.tsx               # Create/edit goal modal
│   ├── goals-widget.tsx            # Dashboard progress bars
│   ├── territory-form.tsx          # Create/edit territory modal
│   ├── dashboard-client.tsx
│   ├── photo-upload.tsx
│   ├── photo-viewer.tsx
│   ├── revenue-chart.tsx
│   ├── priority-badge.tsx
│   └── location-name.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   ├── server.ts               # Server client (createServerClient + createServiceClient)
│   │   └── middleware.ts            # Middleware client
│   ├── duckdb/
│   │   └── connection.ts           # DuckDB singleton connection
│   ├── mapbox/
│   │   └── geocode.ts
│   ├── data/
│   │   ├── beverage-receipts.ts
│   │   ├── enrichments.ts
│   │   ├── activities.ts
│   │   ├── priorities.ts
│   │   ├── goals.ts
│   │   ├── territories.ts
│   │   ├── organizations.ts
│   │   └── locations.ts
│   ├── stripe/
│   │   ├── client.ts
│   │   └── prices.ts
│   ├── billing.ts
│   ├── hooks/
│   │   └── use-media-query.ts      # useIsMobile(), useIsTablet()
│   └── auth.ts
├── scripts/
│   ├── ingest-all.ts
│   ├── ingest-beverage-receipts.ts
│   ├── ingest-enrichments.ts       # Uses ExcelJS
│   ├── ingest-sales-tax.ts
│   ├── ingest-metroplexes.ts       # Uses ExcelJS
│   ├── ingest-counties.ts
│   └── geocode-locations.ts
├── docs/
│   ├── schema.sql
│   ├── migration-stripe.sql
│   └── specs/
├── data/
│   └── analytics.duckdb
├── middleware.ts                   # Role-based + subscription gating
├── next.config.js
├── tsconfig.json
├── package.json
├── .env.local
├── .env.example
└── CLAUDE.md                       # This file
```

---

## Environment Variables

```env
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=
MAPBOX_ACCESS_TOKEN=

# Texas.gov API
TEXAS_API_BASE_URL=https://data.texas.gov/resource/naix-2893.json

# DuckDB
DUCKDB_PATH=./data/analytics.duckdb

# Feature flags
MAX_PHOTOS_PER_ACTIVITY=5
PHOTO_MAX_SIZE_MB=0.5
PHOTO_MAX_DIMENSION=1920
```

---

## Implementation Phases

### Phase 1–5: Core Platform (COMPLETE)
- [x] Database setup (Supabase + DuckDB), ingestion scripts
- [x] Auth, login/signup, role-based middleware
- [x] Customer list/detail, activity logging, photo upload + OCR, GPS
- [x] Mapbox maps, lazy geocoding, customer map view
- [x] Mobile responsive, error handling, priority scoring, beta launch

### Post-Beta Features (V1.1) — COMPLETE (March 2026)
- [x] Goal tracking UI — CRUD API, dashboard widget, progress bars, visit auto-count
- [x] Activity editing — PATCH/DELETE with ownership verification, inline edit/delete in timeline
- [x] Territory management — CRUD API, admin page, user assignment (manager/admin only)
- [x] Chain/ownership analysis — DuckDB aggregation, searchable table, detail panel with charts
- [x] Advanced analytics — Multi-tab dashboard (overview, trends, segments, geography) with Recharts
- [x] Stripe billing — Checkout, subscriptions, webhooks, subscription gating in middleware

### Remaining (V1.2)
- [ ] OCR search dashboard (needs more OCR data first)

---

## Key Technical Decisions

### Photo Handling
1. Compress client-side before upload (500KB max, 1920px max dimension)
2. Store in Supabase Storage
3. Run Tesseract OCR on upload, store extracted text in `activity_photos.ocr_text`
4. UI: Toggle between photo view and OCR text view

### Geocoding Strategy
1. Use Mapbox (100k free/month)
2. **Lazy geocoding**: Only geocode when user first interacts with a location
3. Store in `location_coordinates` table
4. Use spare monthly credits to geocode other states (future expansion)

### GPS Verification
1. Capture browser geolocation when creating activity record
2. Store in `sales_activities.gps_latitude`, `gps_longitude`, `gps_accuracy_meters`
3. Managers can compare phone GPS vs business location

### Location Display Logic
```typescript
// Always prefer enriched name, fallback to raw Texas data
const displayName = enrichment?.clean_dba_name || receipt.location_name;
```

### Data Ingestion
1. Run manually via terminal scripts
2. Echo record count every 50 records
3. Show totals on completion (added, modified, duration)
4. Initial load: 37 months (staging) → full history (production)
5. Monthly updates: ~23k new records

---

## Data Ingestion Rules

**Critical memory management rules for all ingestion scripts:**

1. **Stream/chunk any dataset over 10k records** - Never load entire large datasets into memory
2. **Insert to database after each batch (50k max)** - Process and persist each batch before fetching the next
3. **Release memory before fetching next batch** - Don't accumulate records across batches
4. **Assume any API could return millions of records** - Design for scale from the start

**Implementation pattern:**
- Fetch batch (e.g., 50k records)
- Process and insert immediately
- Release memory
- Fetch next batch
- Repeat until complete

---

## Ingestion Script Output Format

```
📥 Starting beverage receipts ingestion...
⏳ Fetching from Texas.gov API...
🔄 Processing: 50 records...
🔄 Processing: 100 records...
🔄 Processing: 150 records...
...
✅ INGESTION COMPLETE
   Added:    23,450 records
   Modified: 127 records
   Errors:   0
   Duration: 4m 32s
```

---

## Best Practices

### Version Control
- Commit regularly with clear messages
- Keep main branch stable
- Use feature branches for new work

### Naming Conventions
- **Files**: kebab-case (`customer-table.tsx`)
- **Components**: PascalCase (`CustomerTable`)
- **Functions/Variables**: camelCase (`getCustomerData`)
- **Database**: snake_case (`activity_photos`)

### Code Quality
- Keep components focused and small
- Extract reusable logic to lib/
- Handle errors gracefully with user-friendly messages
- Add loading states for async operations

### Security
- Never commit `.env.local`
- Use Supabase RLS policies
- Validate all user input
- Sanitize OCR text before storing

### Dependencies
- Use latest stable versions
- Document all external dependencies in package.json
- Test after any dependency updates

---

## Dependencies (package.json)

```json
{
  "dependencies": {
    "next": "^15.5.x",
    "@supabase/supabase-js": "^2.x",
    "@supabase/ssr": "^0.x",
    "stripe": "^17.x",
    "mapbox-gl": "^3.x",
    "@mapbox/mapbox-sdk": "^0.15.x",
    "tesseract.js": "^5.x",
    "browser-image-compression": "^2.x",
    "recharts": "^2.x",
    "date-fns": "^3.x"
  },
  "devDependencies": {
    "@duckdb/node-api": "^1.x",
    "exceljs": "^4.x",
    "cli-progress": "^3.x",
    "chalk": "^5.x"
  }
}
```

---

## API Endpoints

```
# Customers
GET  /api/customers                     - List customers (with filters)
GET  /api/customers/[permit]/revenue    - Monthly revenue data
GET  /api/customers/[permit]/last-activity - Most recent activity
GET  /api/priorities                    - Ranked customer list

# Activities
GET  /api/activities                    - List activities (with filters)
POST /api/activities                    - Create activity
PATCH /api/activities/[activityId]      - Update activity
DELETE /api/activities/[activityId]     - Delete activity

# Goals
GET  /api/goals                         - List goals (?status= filter)
POST /api/goals                         - Create goal
PATCH /api/goals/[goalId]               - Update goal
DELETE /api/goals/[goalId]              - Delete goal

# Territories (manager/admin)
GET  /api/territories                   - List territories
POST /api/territories                   - Create territory (admin)
GET  /api/territories/[id]              - Territory detail
PATCH /api/territories/[id]             - Update territory (admin)
DELETE /api/territories/[id]            - Delete territory (admin)
GET  /api/territories/users             - List users for assignment

# Analytics & Chains
GET  /api/analytics                     - Analytics data (?view=overview|trends|segments|geography)
GET  /api/chains                        - Chain list (?sort=&segment=&search=)
GET  /api/chains/[ownershipGroup]       - Chain detail with locations

# Photos & OCR
POST /api/photos                        - Upload + OCR photo
GET  /api/photos/[id]/sections          - Photo OCR sections

# Billing (Stripe)
POST /api/stripe/checkout               - Create checkout session
POST /api/stripe/portal                 - Create billing portal session
GET  /api/stripe/subscription           - Get subscription status
POST /api/stripe/webhook                - Stripe webhook handler

# Other
GET  /api/dashboard                     - Dashboard aggregated stats + goals
POST /api/geocode                       - Geocode a location (lazy)
```

---

## Notes

- **Texas-specific**: The data source is unique to Texas, but the CRM/GPS features could become a standalone product
- **Mapbox budget**: Track monthly usage, use spare credits for mapping other states
- **V2 features**: OCR search dashboard, native mobile app

---

## Lessons Learned (Do Not Repeat)

### Deployment & Ingestion Issues (Feb 2026)

**1. NEVER run large ingestions without batch commits**
- Problem: 850k record ingestion ran as single in-memory operation, risking total data loss on failure
- Solution: Always use batched inserts with commits every 1,000-5,000 records
- See: `docs/specs/SPEC-006-ingestion-best-practices.md`

**2. Environment-specific batch sizes are mandatory**
- Cloudways (shared hosting): 1,000 records max per batch
- Azure/AWS (dedicated): 10,000 records per batch
- Local dev: 5,000 records per batch
- Add `DEPLOYMENT_ENV` to all `.env` files

**3. Checkpoint/resume capability for any ingestion over 10k records**
- Save progress to `data/.ingestion-checkpoint-{script}.json`
- On restart, resume from last checkpoint, don't start over
- Delete checkpoint file only on successful completion

**4. Screen sessions for long-running server tasks**
- Always use `screen -S <name>` before running ingestion on remote servers
- Detach with `Ctrl+A` then `D`
- Reattach with `screen -r <name>`
- Verify screen is active with `screen -ls`

**5. Verify file paths and case sensitivity**
- Windows: case-insensitive (`Data/` == `data/`)
- Linux (Cloudways/Azure): case-sensitive (`Data/` != `data/`)
- Always verify paths match exactly on Linux deployments

**6. DuckDB package naming**
- Old package: `duckdb` (used by ingestion scripts)
- New package: `@duckdb/node-api` (used by Next.js app)
- Both may need to be installed depending on scripts

**7. npm install on constrained servers can take hours**
- Compiling native modules (like DuckDB) on low-memory servers is slow
- Run in screen session, expect 1-2+ hours
- Don't assume it failed just because it's slow

**8. Next.js 15 async params and searchParams (March 2026)**
- Route handler `params` must be `Promise<>`: `{ params }: { params: Promise<{ id: string }> }` then `const { id } = await params`
- Page `searchParams` must be `Promise<>`: `{ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }`
- `ssr: false` in `next/dynamic` is NOT allowed in Server Components — must use `'use client'` or move dynamic import to a client component
- `serverComponentsExternalPackages` moved to `serverExternalPackages` in `next.config.js`

**9. xlsx package is abandoned — use ExcelJS instead**
- The `xlsx` npm package has unfixed prototype pollution and ReDoS CVEs
- Replaced with `exceljs` in ingestion scripts (March 2026)
- ExcelJS API: `new ExcelJS.Workbook()` → `await workbook.xlsx.readFile(path)` → `worksheet.eachRow()` to iterate rows

---

## Review Schedule
- Review this file: Weekly during active development
- Last updated: March 7, 2026
- Updated by: Sprint implementation session with Claude
