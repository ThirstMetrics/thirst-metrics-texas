# SPEC-001: Phase 3 Polish — Activity Form UX + End-to-End Testing

**Priority**: IMMEDIATE (tomorrow)
**Phase**: 3 (Polish)
**Tag after completion**: `phase3-complete`

---

## Objective

The activity form works but is clunky. All 60+ fields display at once, the layout is cramped on mobile, and the workflow requires too many steps for a sales rep logging a quick visit from their phone. Polish the UX and verify the full activity → photo → timeline flow works end-to-end.

---

## Task 1: Activity Form — Progressive Disclosure Redesign

**File**: `components/activity-form.tsx`

### Problem
The form renders all 6 sections simultaneously (Basic Info, Contact, Sales Intel, Availability, Photos, Submit). A field sales rep on a phone sees a wall of inputs. Most visits only need: type, date, outcome, notes, and maybe a photo.

### Requirements

1. **Collapsible sections with accordion behavior**:
   - **Always visible** (cannot collapse): Basic Information (type, date, outcome, follow-up date, notes)
   - **Collapsed by default**: Contact Information, Sales Intelligence, Availability
   - **Always visible**: Photos, Submit buttons
   - Each collapsible section gets a header row that toggles open/closed with a chevron indicator (▸ collapsed, ▾ expanded)
   - Sections remember their open/closed state within the session (useState, no persistence needed)

2. **Section headers show summary when collapsed**:
   - Contact: show contact name if filled, otherwise "No contact info"
   - Sales Intel: show count of filled fields (e.g., "3 fields filled") or "No intel yet"
   - Availability: show count of checked slots (e.g., "5 slots selected") or "No availability set"

3. **Quick-log mode**:
   - Add a toggle at the top: "Quick Log" / "Full Form"
   - Quick Log shows ONLY: Activity Type, Date, Outcome, Notes, Photos, Submit
   - Full Form shows everything (with collapsible sections as described above)
   - Default to Quick Log mode

### Acceptance Criteria
- [ ] On mobile (< 768px), the form is usable with one hand — no horizontal scrolling
- [ ] A "quick visit" log (type + date + outcome + notes) can be completed in under 30 seconds
- [ ] Expanding a collapsed section does NOT reset any previously entered data
- [ ] All existing form submission logic (handleSubmit) remains unchanged
- [ ] GPS capture still fires on mount regardless of mode

---

## Task 2: Activity Form — Layout & Spacing Fixes

**File**: `components/activity-form.tsx` (styles object)

### Requirements

1. **Mobile-first grid**:
   - `fieldGrid` should be `grid-template-columns: 1fr` on screens < 768px (use a media query or min-width check)
   - Currently uses `repeat(auto-fit, minmax(200px, 1fr))` which can create awkward 2-column layouts on mid-size phones
   - On desktop (≥ 768px), keep the current 2-column auto-fit behavior

2. **Touch targets**:
   - All buttons must be minimum 44px × 44px (iOS Human Interface Guidelines)
   - Checkbox hit areas: wrap entire label in a larger clickable area (padding: 8px minimum around the checkbox + label text)
   - Select dropdowns: minimum height 44px with adequate padding

3. **Spacing**:
   - Section gap: 24px (currently 32px — tighten to reduce scroll)
   - Field gap within sections: 12px (currently 16px)
   - Remove `borderBottom` on sections when in Quick Log mode (fewer visual dividers)

4. **Submit button area**:
   - Make sticky at bottom of viewport on mobile (position: sticky, bottom: 0, with white background and subtle top shadow)
   - Ensure the Save button is full-width on mobile
   - Cancel button should be secondary style (outlined, not filled)

### Acceptance Criteria
- [ ] No horizontal scroll on iPhone SE (375px width)
- [ ] All interactive elements pass 44px minimum touch target
- [ ] Submit buttons are always visible (sticky) on mobile without scrolling to bottom

---

## Task 3: Test Photo Upload End-to-End

**Files**: `components/activity-form.tsx`, `lib/activity-photos.ts`

### Test Script (manual)

1. Navigate to a customer detail page → click "Log Activity"
2. Fill in: Type=Visit, Date=today, Outcome=Positive, Notes="Test visit"
3. In Photos section, select a photo from device (try both camera capture and file picker on mobile)
4. Verify: photo preview appears with file size in KB
5. Select a second photo — verify both show in the grid
6. Remove first photo — verify it disappears and second remains
7. Set photo type to "Receipt"
8. Click "Save Activity"
9. Verify:
   - Activity creation succeeds (no console errors)
   - Photo upload progress shows ("Photo 1 of 2...")
   - Photos appear in Supabase Storage bucket `activity-photos/activities/`
   - `activity_photos` table has 2 rows with correct `activity_id`, `photo_url`, `photo_type`
   - OCR runs (check `ocr_text` column — may be empty for non-text photos, that's OK)
   - Activity appears in the timeline on the customer detail page
   - Photo thumbnails show in the timeline entry

### Known Issues to Watch For
- **Tesseract.js client-side**: The `createWorker('eng')` call downloads ~15MB of language data on first use. If this stalls or errors, we may need to make OCR optional/deferred. Watch the network tab.
- **Supabase Storage RLS**: The bucket was just created. Verify the RLS policy allows authenticated users to upload. If uploads fail with 403, check `docs/SUPABASE_SETUP.md` for the required policies.
- **Photo URL format**: `getPublicUrl()` returns the URL but the bucket must have public access enabled OR we need signed URLs. Test that the `photo_url` stored in the database actually loads in an `<img>` tag.

### If Upload Fails
Check these in order:
1. Browser console for error messages
2. Supabase Dashboard → Storage → `activity-photos` bucket → check if bucket exists and has correct policies
3. Network tab for the upload request — check status code and response body
4. Verify `.env.local` has correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Task 4: Test GPS Capture

**File**: `components/activity-form.tsx` (useEffect on mount)

### Test Script (manual)

1. Open customer detail → Log Activity on a device with GPS (phone or laptop with location services)
2. Verify the GPS status bar shows one of:
   - "✓ GPS captured: XX.XXXXXX, XX.XXXXXX (accuracy: Xm)" — success
   - "⚠ GPS error: ..." — failure with reason
   - "Capturing GPS location..." — loading state
3. Submit the activity
4. In Supabase → `sales_activities` table, verify:
   - `gps_latitude` is populated (not null)
   - `gps_longitude` is populated (not null)
   - `gps_accuracy_meters` is populated
5. Test with location services DISABLED — verify graceful error message

### GPS UX Improvement (if time permits)
- The green color `#43e97b` for GPS success is too bright and hard to read on white. Change to `#16a34a` (darker green).
- Show a small map pin icon instead of just "✓"
- If accuracy > 100m, show a warning: "Low GPS accuracy — location may be approximate"

---

## Task 5: Test Activity Timeline Display

**Files**: `components/activity-timeline.tsx`, `components/customer-detail-client.tsx`

### Test Script (manual)

1. After creating a test activity (Task 3), return to the customer detail page
2. Verify the activity appears in the Activities panel (right column)
3. Check that all displayed fields render correctly:
   - Activity type icon (📍 for visit)
   - Date formatted as "Jan 27, 2026"
   - Outcome badge with correct color
   - Notes text
   - Conversation summary (if filled)
   - Product interest tags
   - Next action text
   - Contact info
   - Follow-up date
   - Photo thumbnails (should link to full-size image)
4. Create a second activity — verify chronological ordering (newest first)
5. Test the empty state: find a customer with no activities, verify "No activities recorded yet" + "Log first activity" button

### Known Issue
- `customer-detail-client.tsx:129` uses `window.location.reload()` after activity creation. This works but is jarring — the entire page reloads. A better UX would be to refetch activities via API and update state. **Flag for Phase 5 polish** — do not fix now, just verify it works.

---

## Task 6: Commit and Tag

After all tests pass:

```bash
git add -A
git commit -m "Phase 3 polish: activity form UX, photo upload tested, GPS verified"
git tag phase3-polished
```

---

## Files Modified (expected)
- `components/activity-form.tsx` — major UX changes (accordion, quick-log mode, mobile layout)
- No changes expected to: `lib/activity-photos.ts`, `lib/data/activities.ts`, `app/api/activities/route.ts`, `components/activity-timeline.tsx`, `components/customer-detail-client.tsx`

## Dependencies
- None — all required infrastructure (Supabase auth, Storage bucket, DuckDB) is already in place

## Out of Scope
- Activity editing (update/delete from UI) — Phase 5
- Photo viewer with OCR text toggle — Phase 5
- Refetching activities without page reload — Phase 5
- Manager GPS verification view — Phase 5
