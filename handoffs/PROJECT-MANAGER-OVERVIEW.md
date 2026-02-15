# Thirst Metrics Texas - Project Manager Overview

**Last Updated:** February 15, 2026
**Project Status:** Active Development (MVP functional, bugs in progress)

---

## Executive Summary

Thirst Metrics Texas is a sales CRM for beverage distribution, specifically designed for field sales reps in Texas. The app allows reps to manage customer accounts, log sales activities, capture photos of menus/coolers, and track their territory via mobile map.

**Live URL:** https://thirstmetrics.com
**Repository:** GitHub - ThirstMetrics/thirst-metrics-texas

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), TypeScript, React |
| Backend | Next.js API Routes (serverless) |
| Database | Supabase (PostgreSQL) + DuckDB (analytics) |
| Auth | Supabase Auth (email/password, cookie sessions) |
| Storage | Supabase Storage (photo uploads) |
| Maps | Mapbox GL JS |
| Hosting | Cloudways (DigitalOcean droplet) |
| OCR | Tesseract.js (server-side) |

---

## Core Features

### ✅ Implemented & Working
| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | ✅ Working | Email/password login via Supabase |
| Customer Database | ✅ Working | TABC permit data for Texas liquor licensees |
| Customer Search/Filter | ✅ Working | By name, county, city, metroplex |
| Activity Logging | ✅ Working | Visit types, notes, outcomes, contact info |
| Dashboard | ✅ Working | Activity metrics, recent visits |
| Desktop UI | ✅ Working | Full-featured customer management |

### 🔧 Implemented, Has Bugs
| Feature | Status | Issue |
|---------|--------|-------|
| Photo Upload | 🔧 Bug | 500 error "Unexpected end of multipart data" |
| Mobile Map View | 🔧 Bug | SSR error on load |
| Mobile Login | 🔧 Bug | Login loop (may be stale server process) |
| OCR Text Extraction | 🔧 Blocked | Depends on photo upload working |

### 📋 Planned / Not Started
| Feature | Priority | Notes |
|---------|----------|-------|
| Quick Activity from Map | Medium | Log activity without leaving map view |
| Batch Geocoding | Low | Geocode customers missing coordinates |
| Push Notifications | Low | Reminders for follow-ups |
| Offline Mode | Low | Work without connectivity |

---

## Current Sprint Issues

### 🔴 Critical: Photo Upload Broken
**Impact:** Reps cannot attach photos to activities
**Root Cause:** Image compression library returns Blob instead of File, breaking multipart upload
**Fix Status:** Code written, needs local testing before deploy
**Files:** `components/activity-form.tsx`, `app/api/photos/route.ts`

### 🟡 High: Mobile Login Loop
**Impact:** Mobile users stuck in login redirect loop
**Root Cause:** Possibly stale server process or cookie handling
**Fix Status:** Server process killed, needs fresh deploy and testing
**Files:** `app/login/page.tsx`, `middleware.ts`

### 🟡 High: Mobile Map Error
**Impact:** Mobile customer view shows "Something went wrong"
**Root Cause:** SSR error referencing `window` during server render
**Fix Status:** Code fixed, needs local testing before deploy
**Files:** `components/mobile-customer-view.tsx`

---

## Infrastructure

### Server Details
- **Provider:** Cloudways (managed DigitalOcean)
- **IP:** 167.71.242.157
- **SSH User:** master_nrbudqgaus
- **App Path:** ~/applications/gnhezcjyuk/public_html
- **Node Version:** 18.x (needs upgrade to 20.x per Supabase warnings)

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_APP_URL
```

### Deployment Process
1. Push to GitHub `master` branch
2. SSH to server, `git pull`
3. Run `npm run build`
4. Restart Next.js: `pkill -9 -f 'node.*next' && npm start`

---

## Database Schema (Key Tables)

### Supabase (PostgreSQL)
| Table | Purpose |
|-------|---------|
| `users` | Auth users (managed by Supabase Auth) |
| `activities` | Sales activity logs |
| `activity_photos` | Photos attached to activities |
| `location_coordinates` | Geocoded lat/lng for customers |

### DuckDB (Analytics - Read Only)
| Table | Purpose |
|-------|---------|
| `mixed_beverage_receipts` | TABC sales data |
| `counties` | Texas county reference |
| `metroplexes` | Metro area groupings |

---

## Team & Workflow

### Development Sessions
Development is organized into focused sessions to manage context:
- **Session 1:** Photo upload pipeline
- **Session 2:** Mobile map & geolocation
- **Session 3:** Authentication flow

### Handoff Files
Located in `/handoffs/`:
- `SESSION-1-photo-upload.md`
- `SESSION-2-mobile-map.md`
- `SESSION-3-auth-login.md`
- `CLAUDE_SESSION_PROMPT.md` (master prompt for all sessions)

### Development Rules
1. **Local-first testing** - Never deploy without local verification
2. **Build timestamps** - Add visible indicator to verify correct build
3. **3-strike research rule** - If 3 fixes fail, stop and research before continuing
4. **Parallel debugging** - Multiple issues = multiple focused sessions

---

## Metrics & Monitoring

### Current Server Health (as of Feb 15, 2026)
- **CPU:** Was pegged at 87% (runaway process killed)
- **RAM:** 2.55 GB / 3.82 GB
- **Disk:** 20.27 GB / 49.05 GB
- **Bandwidth:** 8246 MB this month

### Known Performance Issues
- DuckDB file locking during concurrent builds
- Node 18 deprecation warnings from Supabase SDK

---

## Risks & Blockers

| Risk | Severity | Mitigation |
|------|----------|------------|
| Server CPU spikes | High | Monitor processes, implement proper error handling |
| Photo upload blocking OCR | High | Prioritize photo fix |
| Node 18 deprecation | Medium | Schedule upgrade to Node 20 |
| Single server | Medium | Consider load balancing for scale |

---

## Next Milestones

### Immediate (This Week)
- [ ] Fix photo upload
- [ ] Fix mobile login
- [ ] Fix mobile map view
- [ ] Verify OCR working

### Short Term (Next 2 Weeks)
- [ ] Quick activity logging from mobile map
- [ ] Build timestamp indicator
- [ ] Upgrade Node to 20.x

### Medium Term (Next Month)
- [ ] Performance optimization
- [ ] Batch geocoding for missing coordinates
- [ ] User onboarding flow

---

## Contact & Access

### Repository
- GitHub: ThirstMetrics/thirst-metrics-texas
- Branch: `master` (production)

### Server Access
```bash
ssh -i ~/.ssh/id_ed25519 master_nrbudqgaus@167.71.242.157
```

### Services
- **Supabase Dashboard:** (credentials in team vault)
- **Cloudways Dashboard:** (credentials in team vault)
- **Mapbox Dashboard:** (credentials in team vault)

---

## Appendix: File Structure

```
thirst-metrics-texas/
├── app/
│   ├── api/              # API routes
│   │   ├── activities/
│   │   ├── auth/
│   │   ├── customers/
│   │   ├── photos/
│   │   └── ocr/
│   ├── customers/        # Customer pages
│   ├── dashboard/        # Dashboard page
│   └── login/            # Auth pages
├── components/           # React components
│   ├── activity-form.tsx
│   ├── customer-map.tsx
│   └── mobile-customer-view.tsx
├── lib/
│   ├── supabase/         # Supabase clients
│   ├── duckdb/           # DuckDB connection
│   └── ocr/              # OCR utilities
├── handoffs/             # Session handoff files
└── data/                 # DuckDB database file
```
