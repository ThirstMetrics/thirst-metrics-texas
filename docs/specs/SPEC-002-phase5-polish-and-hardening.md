# SPEC-002: Phase 5 — UI/UX Polish, Stress Testing & Bug Hardening

**Priority**: After Phase 3 Polish (SPEC-001)
**Phase**: 5

---

## Objective

Make the app production-ready for real sales reps. Polish every page for mobile-first use, add loading states and error boundaries, remove debug console.logs, and stress test the critical paths.

---

## Task 1: Global Navigation Bar

**Files**: `app/layout.tsx` (new nav component)

### Problem
There is no navigation. Users can only reach pages by typing URLs or clicking links buried in page content. The root layout is bare (`<html><body>{children}</body></html>`).

### Requirements

1. Create `components/nav-bar.tsx`:
   - Sticky top bar (height: 56px on mobile, 64px on desktop)
   - Logo/brand: "Thirst Metrics" text on the left
   - Nav links: Dashboard, Customers (always visible)
   - Right side: user email (truncated if long) + Logout button
   - On mobile (< 768px): hamburger menu that slides in from right
   - Active page indicator (underline or highlight)
   - Only render the nav bar for authenticated users (check session)
   - If not authenticated, show nothing (login/signup pages have their own layout)

2. Update `app/layout.tsx`:
   - Import and render `NavBar` component
   - Add `padding-top` to body content equal to nav height so content doesn't hide behind sticky nav

3. **Logout flow**:
   - Call `supabase.auth.signOut()`
   - Clear the auth cookie (hit `/api/auth/sync` with a logout action, or delete the cookie directly)
   - Redirect to `/login`

### Acceptance Criteria
- [ ] Nav appears on /dashboard, /customers, /customers/[permit]
- [ ] Nav does NOT appear on /login, /signup, /
- [ ] Logout clears session and redirects to login
- [ ] On mobile, hamburger menu works with smooth animation
- [ ] Active link is visually distinguished

---

## Task 2: Loading States

**Files**: All page components

### Requirements

Add loading states to every async operation:

1. **Customer list page** (`components/customer-list-client.tsx`):
   - Skeleton rows (gray pulsing bars) while loading — not a spinner
   - Show skeleton for 50 rows matching the table layout
   - "Loading customers..." text above skeleton

2. **Customer detail page** (`components/customer-detail-client.tsx`):
   - Skeleton for customer info card (left column)
   - Skeleton for activities panel (right column)
   - Skeleton for revenue chart area

3. **Activity form** (`components/activity-form.tsx`):
   - Disable all inputs and show overlay spinner during submission
   - "Saving activity..." → "Uploading photos (1/3)..." → "Done!" progression text

4. **Revenue chart** (`components/revenue-chart.tsx`):
   - Show a placeholder rectangle with pulsing animation while data loads
   - Remove the `console.log('Chart received data:', data)` at line 29

### Skeleton Component
Create `components/skeleton.tsx`:
```
Props: { width?: string, height?: string, variant?: 'text' | 'rectangular' | 'circular' }
```
- CSS animation: background gradient sliding left-to-right (shimmer effect)
- Use inline styles consistent with the rest of the codebase (no CSS modules)

### Acceptance Criteria
- [ ] No page shows a blank white screen during data fetching
- [ ] Every loading state is visible for at least 200ms (prevent flash of loading state for fast responses — use a minimum display time)
- [ ] Revenue chart console.log removed

---

## Task 3: Error Handling

**Files**: Multiple

### Requirements

1. **Global error boundary**: Create `app/error.tsx` (Next.js App Router convention)
   - Friendly message: "Something went wrong"
   - "Try again" button that calls `reset()`
   - Log the error to console (no external error service for beta)

2. **API error handling** in client components:
   - Customer list: If `/api/customers` fails, show inline error with retry button (not a full-page error)
   - Customer detail: If customer not found, show "Customer not found" with back link
   - Activity form: If submission fails, show error message above form (already exists but verify it works)
   - Photo upload: If upload fails, show which photo failed and offer retry for that specific photo (currently uses `alert()` — replace with inline error)

3. **Network error detection**:
   - If `fetch()` throws (network down), show "Network error — check your connection" instead of generic error
   - Distinguish between 401 (redirect to login), 403 (access denied), 404 (not found), 500 (server error)

### Acceptance Criteria
- [ ] Turning off network (airplane mode) on any page shows a clear error, not a white screen
- [ ] Expired session (401) redirects to login automatically
- [ ] No `alert()` calls anywhere in the codebase — all errors are inline UI

---

## Task 4: Remove Debug Logging

**Files**: Multiple (search for `console.log`)

### Requirements

Do a sweep of all files and remove or gate debug logging:

1. **Remove entirely**:
   - `revenue-chart.tsx:29` — `console.log('Chart received data:', data)`
   - Any `console.log` in `login/page.tsx` that exposes auth flow details (there are reportedly 8)

2. **Keep but reduce**:
   - `middleware.ts` — keep `console.error` for actual errors, remove the `console.log` statements that log every request (lines 59, 68, 91-93, 100)
   - API routes — keep `console.error` for catch blocks, remove any `console.log`

3. **Rule**: After this task, the only `console.*` calls should be `console.error` in catch blocks. No `console.log` or `console.warn` in production code.

### Acceptance Criteria
- [ ] `grep -r "console.log" --include="*.tsx" --include="*.ts" app/ components/ lib/ middleware.ts` returns zero results (excluding node_modules)
- [ ] App still functions correctly after removal (no accidental deletion of logic)

---

## Task 5: Mobile Responsive Pass

**Files**: All page components and the styles objects

### Requirements

Test and fix every page at these breakpoints:
- 375px (iPhone SE)
- 390px (iPhone 14)
- 768px (iPad portrait)
- 1024px (iPad landscape / small laptop)
- 1440px (desktop)

### Page-specific fixes:

1. **Customer list** (`customer-list-client.tsx`):
   - Filter bar: stack filters vertically on mobile (currently a horizontal row that overflows)
   - Table: make horizontally scrollable with sticky first column (customer name)
   - Pagination: center on mobile, reduce button count (show 3 page numbers max on mobile)

2. **Customer detail** (`customer-detail-client.tsx`):
   - Two-column layout → single column on mobile (activities below customer info)
   - Current CSS: `maxWidth: '50%'` on each column — change to `maxWidth: '100%'` on mobile
   - Revenue chart: ensure `ResponsiveContainer` works at narrow widths (it should, but verify)

3. **Activity form** (`activity-form.tsx`):
   - Covered in SPEC-001 Task 2 — verify the changes from that spec work here
   - Verify photo grid doesn't overflow on small screens

4. **Login page** (`login/page.tsx`):
   - Center the form vertically and horizontally
   - Max-width: 400px, full padding on mobile
   - Input fields: full width, 44px height minimum

### Implementation Approach
Since the project uses inline styles (not CSS modules or Tailwind), responsive behavior needs one of:
- A `useMediaQuery` hook that returns breakpoint state
- OR CSS media queries in a `<style>` tag injected by components
- Recommendation: **Create `lib/use-media-query.ts`** hook, then use conditional styles

```typescript
// lib/use-media-query.ts
export function useIsMobile(): boolean {
  // Returns true for < 768px
  // Uses window.matchMedia with SSR safety
}
```

### Acceptance Criteria
- [ ] Every page is usable on iPhone SE (375px) — no horizontal scroll, no overlapping elements
- [ ] Every page is usable on iPad (768px) — appropriate use of space
- [ ] No content is cut off or hidden at any breakpoint
- [ ] Touch targets meet 44px minimum on all interactive elements

---

## Task 6: Activity Improvements (Non-UX)

**Files**: `components/customer-detail-client.tsx`, `components/activity-timeline.tsx`

### Requirements

1. **Replace `window.location.reload()`** in `customer-detail-client.tsx:129`:
   - After activity creation, call `/api/activities?permitNumber=XXX` to refetch activities
   - Update the activities state without a full page reload
   - This requires lifting the activities state to allow updates

2. **Photo viewer in timeline**:
   - Clicking a photo thumbnail in the timeline should open a lightbox/modal
   - Show full-size image with close button
   - Show OCR text below the image if available
   - Simple implementation — no need for a carousel, just one photo at a time

3. **Activity count badge**:
   - In the Activities section header, show count: "Activities (3)"
   - If no activities, show "Activities (0)"

### Acceptance Criteria
- [ ] Creating an activity updates the timeline without page reload
- [ ] Photo thumbnails in timeline are clickable and show full-size image
- [ ] OCR text displays below photo in viewer (if available)
- [ ] Activity count shows in section header

---

## Task 7: Stress Testing Checklist

This is a manual testing script. Run through each scenario and note any failures.

### Auth Stress Tests
- [ ] Login with valid credentials → redirects to dashboard
- [ ] Login with invalid credentials → shows error message
- [ ] Visit /customers while logged out → redirects to /login with ?redirect=/customers
- [ ] After login with redirect param → lands on /customers (not /dashboard)
- [ ] Logout → session cleared, can't access protected pages
- [ ] Open two tabs, logout in one → other tab should redirect to login on next navigation

### Customer List Stress Tests
- [ ] Load with no filters → shows first 50 customers, correct total count
- [ ] Search for a known permit number → returns exact match
- [ ] Search for partial name → returns fuzzy matches
- [ ] Filter by county → only shows customers in that county
- [ ] Filter by metroplex → only shows customers in that metroplex
- [ ] Set minimum revenue filter → all shown customers meet threshold
- [ ] Combine multiple filters → results satisfy ALL filters
- [ ] Page through results → all pages load, no duplicates
- [ ] Sort by revenue desc → highest revenue first
- [ ] Sort by name asc → alphabetical order
- [ ] 50+ rapid filter changes → no race conditions, final state matches last selection

### Customer Detail Stress Tests
- [ ] Navigate to customer with rich data → all fields render, charts populate
- [ ] Navigate to customer with minimal data → graceful empty states, no errors
- [ ] Revenue chart renders 12+ months of data
- [ ] Revenue chart handles months with $0 revenue

### Activity Flow Stress Tests
- [ ] Create activity with all fields filled → saves correctly, appears in timeline
- [ ] Create activity with only required fields (Quick Log) → saves correctly
- [ ] Create activity with 5 photos → all upload, all show in timeline
- [ ] Create activity with GPS → coordinates stored in database
- [ ] Create activity without GPS (denied permission) → saves without coordinates, shows warning
- [ ] Rapid double-click submit → only one activity created (disable button after first click)
- [ ] Submit with network error → shows error, can retry
- [ ] Submit with expired session → redirects to login

### Performance Spot Checks
- [ ] Customer list loads in < 2 seconds
- [ ] Customer detail loads in < 1 second
- [ ] Activity form submission (no photos) < 1 second
- [ ] Photo upload (single 500KB photo) < 3 seconds

---

## Files Modified (expected)
- `app/layout.tsx` — add NavBar
- `components/nav-bar.tsx` — NEW
- `components/skeleton.tsx` — NEW
- `lib/use-media-query.ts` — NEW
- `app/error.tsx` — NEW
- `components/customer-list-client.tsx` — loading states, mobile responsive
- `components/customer-detail-client.tsx` — loading states, mobile responsive, remove reload
- `components/activity-form.tsx` — loading states (verify SPEC-001 changes)
- `components/activity-timeline.tsx` — photo viewer, activity count
- `components/revenue-chart.tsx` — remove console.log, loading state
- `middleware.ts` — remove debug console.logs
- `app/login/page.tsx` — remove console.logs, mobile responsive
- Multiple API routes — remove console.logs

## Out of Scope
- Activity editing (update/delete) — Post-beta
- Goal tracking UI — Post-beta
- Territory management — Post-beta
- Advanced analytics page — Post-beta
- Priority scoring algorithm — Post-beta (data layer exists, UI doesn't)
