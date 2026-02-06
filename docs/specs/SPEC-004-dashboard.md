# SPEC-004: Dashboard — Admin Ingestion & Salesperson Metrics

**Priority**: After Maps (SPEC-003)
**Phase**: Dashboard build-out
**Roles**: Admin-only features + Salesperson view

---

## Objective

The dashboard is currently a placeholder (`"Dashboard content coming soon..."`). Build it into two views:
1. **Salesperson dashboard**: Activity metrics, upcoming follow-ups, recent activity feed
2. **Admin dashboard**: All salesperson metrics PLUS data ingestion controls, location flagging, and enrichment management

---

## Task 1: Salesperson Dashboard

**File**: `app/dashboard/page.tsx` → refactor into `components/dashboard-salesperson.tsx`

### Requirements

1. **Welcome header** (already exists, keep it):
   - "Welcome, {email}" + Role badge

2. **Metrics cards row** (4 cards):
   - **Activities This Month**: count of user's activities in current month
   - **Activities This Week**: count of user's activities in current week
   - **Customers Visited**: distinct permit numbers with activities this month
   - **Upcoming Follow-ups**: count of activities where `next_followup_date` is within next 7 days

   Card design:
   - White card with subtle shadow
   - Large number (32px, bold, primary color)
   - Label below (14px, gray)
   - Arrange in a 2×2 grid on mobile, 4-across on desktop

3. **Upcoming Follow-ups list** (below metrics):
   - Table/list of activities where `next_followup_date >= today AND next_followup_date <= today + 7`
   - Columns: Customer Name, Activity Type, Date Logged, Follow-up Date
   - Click row → navigate to customer detail page
   - Max 10 items, "View all" link if more

4. **Recent Activity feed** (below follow-ups):
   - Last 10 activities by this user
   - Same card layout as activity timeline (reuse ActivityTimeline component or similar)
   - Each card links to the customer detail page

### Data Sources
- Activities: Supabase `sales_activities` table filtered by `user_id`
- Customer names: JOIN with DuckDB `mixed_beverage_receipts` via `tabc_permit_number`
- This requires a new API endpoint: `GET /api/dashboard/metrics?userId=XXX`

### Acceptance Criteria
- [ ] Metrics cards show correct counts
- [ ] Follow-up list shows upcoming items sorted by date
- [ ] Recent activity feed shows last 10 activities
- [ ] All links navigate correctly
- [ ] Page loads in < 2 seconds

---

## Task 2: Admin Dashboard — Data Ingestion Panel

**File**: NEW `components/dashboard-admin.tsx`

### Requirements

The admin dashboard includes EVERYTHING from the salesperson dashboard PLUS an "Admin Tools" section below.

1. **Admin Tools section header**: "Data Management" with a lock icon

2. **Ingestion Status panel**:
   - Show last ingestion date and record counts for each data source:
     - Beverage Receipts: {count} records, last updated {date}
     - Counties: {count} records
     - Metroplexes: {count} records
     - Sales Tax: {count} records
     - Enrichments: {count} records
   - Query these counts from DuckDB on page load

3. **Ingestion Action buttons** (admin only):
   Each button triggers a server-side API call that runs the ingestion script:

   - **"Update Beverage Receipts"** — Fetches new data from Texas.gov API
     - Hits `POST /api/admin/ingest/beverage-receipts`
     - Shows progress: "Fetching..." → "Processing {n} records..." → "Done! Added {x}, modified {y}"
     - The API route should call the ingestion logic from `scripts/ingest-beverage-receipts.ts` (refactor the script to export a callable function, not just a CLI entry point)

   - **"Upload Sales Tax CSV"** — File upload
     - Drag-and-drop zone or file picker for CSV
     - Hits `POST /api/admin/ingest/sales-tax` with the file
     - Parses and ingests server-side

   - **"Upload Enrichments"** — File upload
     - Drag-and-drop zone or file picker for XLSX
     - Hits `POST /api/admin/ingest/enrichments` with the file
     - Parses and ingests server-side

4. **Ingestion history log** (nice-to-have for beta):
   - Table showing recent ingestion runs: date, type, records added/modified, duration, status
   - Store in a new Supabase table: `ingestion_log`
   ```sql
   CREATE TABLE ingestion_log (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     ingestion_type VARCHAR(50) NOT NULL,
     started_at TIMESTAMP NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMP,
     status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
     records_added INTEGER DEFAULT 0,
     records_modified INTEGER DEFAULT 0,
     records_failed INTEGER DEFAULT 0,
     error_message TEXT,
     triggered_by UUID REFERENCES users(id)
   );
   ```

### API Endpoints (all admin-only)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/admin/ingest/status | Get record counts and last ingestion dates |
| POST | /api/admin/ingest/beverage-receipts | Trigger beverage receipts update |
| POST | /api/admin/ingest/sales-tax | Upload and ingest sales tax CSV |
| POST | /api/admin/ingest/enrichments | Upload and ingest enrichments XLSX |
| GET | /api/admin/ingest/log | Get ingestion history |

All admin endpoints must:
- Verify user role is 'admin' (check `users.role` via Supabase)
- Return 403 if not admin
- Log to `ingestion_log` table

### Cron-Ready Architecture
Design the ingestion API routes so they can be called by an external cron service (Azure Functions timer trigger, or a simple cron job) without the admin UI:
- Accept an optional `Authorization: Bearer {service_role_key}` header
- If service role key matches `SUPABASE_SERVICE_ROLE_KEY`, skip the user role check
- This allows automated monthly ingestion without a human clicking the button

### Acceptance Criteria
- [ ] Admin sees all salesperson metrics PLUS admin tools
- [ ] Non-admin users don't see admin tools section (verify with salesperson role)
- [ ] "Update Beverage Receipts" button triggers ingestion and shows progress
- [ ] CSV/XLSX upload works via drag-and-drop or file picker
- [ ] Ingestion results show record counts
- [ ] API endpoints return 403 for non-admin users
- [ ] API endpoints accept service role key for cron automation

---

## Task 3: Location Flagging

**File**: NEW `components/location-flagger.tsx`, integrate into admin dashboard

### Requirements

1. **New locations detection**:
   - After beverage receipt ingestion, compare permit numbers in `mixed_beverage_receipts` against `location_enrichments`
   - Any permit number in receipts but NOT in enrichments = "new location"
   - Show a count badge on the admin dashboard: "12 new locations need review"

2. **Location review UI**:
   - Table of new/unflagged locations
   - Columns: Permit #, DBA Name, Address, City, County, Total Revenue (last 12mo)
   - Sort by revenue descending (highest-revenue new locations first)
   - For each row, admin can:
     - Enter `clean_dba_name` (the corrected/clean business name)
     - Enter `ownership_group` (chain/group name if applicable)
     - Select `industry_segment` from dropdown (bar, restaurant, hotel, club, etc.)
     - Add `clean_up_notes` (free text)
     - Click "Save" to insert into `location_enrichments` table
   - Pagination (50 per page)

3. **Bulk actions** (nice-to-have):
   - Select multiple locations
   - Set the same ownership_group for all selected
   - Set the same industry_segment for all selected

### Acceptance Criteria
- [ ] New locations are correctly identified (receipts minus enrichments)
- [ ] Admin can enrich a location and it saves to DuckDB
- [ ] Enriched locations no longer appear in the "new locations" list
- [ ] Revenue sort works correctly

---

## Task 4: Dashboard Routing by Role

**File**: `app/dashboard/page.tsx`

### Requirements

1. The dashboard page should:
   - Fetch the user and their role (already does this)
   - If role is 'admin', render `DashboardAdmin` (which includes salesperson metrics + admin tools)
   - If role is 'salesperson' or 'manager', render `DashboardSalesperson`
   - Pass user info (id, email, role) as props to the dashboard component

2. Server component data fetching:
   - Fetch metrics data server-side and pass as props (avoid client-side fetch waterfalls)
   - Activity counts, follow-ups, recent activities all fetched in parallel using `Promise.all()`

### Acceptance Criteria
- [ ] Admin user sees admin dashboard
- [ ] Salesperson user sees salesperson dashboard
- [ ] No client-side fetch waterfalls — all data loaded server-side

---

## Files Modified/Created (expected)
- `app/dashboard/page.tsx` — refactor to role-based rendering
- `components/dashboard-salesperson.tsx` — NEW
- `components/dashboard-admin.tsx` — NEW
- `components/location-flagger.tsx` — NEW
- `app/api/admin/ingest/status/route.ts` — NEW
- `app/api/admin/ingest/beverage-receipts/route.ts` — NEW
- `app/api/admin/ingest/sales-tax/route.ts` — NEW
- `app/api/admin/ingest/enrichments/route.ts` — NEW
- `app/api/admin/ingest/log/route.ts` — NEW
- `app/api/dashboard/metrics/route.ts` — NEW
- `scripts/ingest-beverage-receipts.ts` — refactor to export callable function
- `scripts/ingest-sales-tax.ts` — refactor to export callable function
- `scripts/ingest-enrichments.ts` — refactor to export callable function
- `docs/schema.sql` — add `ingestion_log` table
- `lib/data/dashboard.ts` — NEW (dashboard queries)

## Out of Scope
- Manager dashboard (team-level metrics, view team activities) — Post-beta
- Automated cron setup (Azure Functions) — Post-beta (architecture is ready)
- Email notifications for new locations — Post-beta
- Data export (CSV download of filtered customers) — Post-beta
