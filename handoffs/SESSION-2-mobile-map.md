# Claude Code Session: Mobile Map & Customer View

## Quick Start
```bash
cd C:\thirst-metrics-texas
npm run dev
```
Test mobile at: http://localhost:3000/customers (use Chrome DevTools mobile emulation)

---

## Project Context
**App:** Thirst Metrics Texas - Sales CRM for beverage distribution
**Stack:** Next.js 14, TypeScript, Supabase, Mapbox GL JS
**Repo:** `C:\thirst-metrics-texas`

## Server (only deploy after local verification)
- **Host:** 167.71.242.157 | **User:** master_nrbudqgaus
- **SSH:** `ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157`
- **App Path:** ~/applications/gnhezcjyuk/public_html

---

## Session Rules
1. **Test locally first** - `npm run dev` before any deployment
2. **On 3rd failed fix** - STOP and research (GitHub issues, Stack Overflow, Reddit)
3. **Ask for DevTools** - Request Network/Console output immediately on errors
4. **Add build timestamp** - So user can verify correct build is live

---

## THE ISSUES

### Issue A: Mobile "Something went wrong" Error
**Status:** Fix applied, needs verification

**Root Cause:** SSR error - `window?.innerHeight` referenced in dynamic import loading state

**Fix Applied:**
File: `components/mobile-customer-view.tsx` line 17
```typescript
// Changed FROM:
loading: () => <MapSkeleton height={window?.innerHeight ? window.innerHeight - 60 : 600} />

// Changed TO:
loading: () => <MapSkeleton height={600} />
```

### Issue B: Map Shows Only Geocoded Customers
**Status:** Code exists but may have issues

**User Expectation:** Show ALL open accounts, even those without coordinates (in a separate list below map)

**Implementation Added:**
- `/api/customers/coordinates` returns `nonGeocodedCustomers[]` and `nonGeocodedCount`
- `mobile-customer-view.tsx` has collapsible panel at bottom for non-geocoded customers

---

## Key Files

| File | Purpose |
|------|---------|
| `components/mobile-customer-view.tsx` | Main mobile view with map + search + action sheet |
| `components/customer-map.tsx` | Mapbox GL map component |
| `app/api/customers/coordinates/route.ts` | API returning customers with lat/lng + non-geocoded list |
| `app/customers/page.tsx` | Page that switches between desktop/mobile views |

---

## Verification Steps

1. **Start local dev server:** `npm run dev`
2. **Open Chrome DevTools** → Toggle device toolbar (mobile view)
3. **Go to** http://localhost:3000/customers
4. **Should see:**
   - Map loading without "Something went wrong"
   - Search bar at top
   - Customer markers on map
   - Badge showing "X on map • Y without location"
   - Collapsible panel at bottom for non-geocoded customers
5. **Tap a marker** → Action sheet should appear with "Log Activity" and "View Details"

---

## If Still Broken

1. **Check Console for errors** - especially hydration mismatches
2. **Check Network tab** - is `/api/customers/coordinates` returning data?
3. **Mapbox token valid?** - Check `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`
4. **Try without mobile emulation** - does desktop /customers work?

---

## Enhancement TODO: Quick Activity from Map
**Not started** - Add inline activity logging without leaving map view

Planned approach:
1. Create `components/mobile-activity-sheet.tsx` - slide-up form
2. When user taps "Log Activity" on marker, show sheet instead of navigating
3. Simplified form: Activity type, notes, photo, GPS auto-capture
4. Submit without leaving map

---

## Deploy Command (only after local works)
```powershell
git add . && git commit -m "Fix mobile map" && git push
ssh -i $env:USERPROFILE\.ssh\id_ed25519 master_nrbudqgaus@167.71.242.157 "cd ~/applications/gnhezcjyuk/public_html && git pull && source ~/.nvm/nvm.sh && npm run build && pkill -9 -f 'node.*next'; nohup npm start > /tmp/next.log 2>&1 &"
```
