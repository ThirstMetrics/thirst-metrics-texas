# Pricing Strategy — Thirst Metrics Texas

**Status:** DRAFT — Pending validation through beta feedback
**Last Updated:** March 7, 2026
**Target Revenue:** $5,000/month gross (1 FTE) by end of Year 1

---

## Platform Infrastructure Costs

### Per-Team Cost to Serve (9-seat team, 5 days/week, 10 visits/day, 5 photos/visit)

| Service | Monthly Cost | Notes |
|---|---|---|
| Mapbox Geocoding | $0 | ~1,000 unique locations/mo, 100k free tier |
| Supabase Pro | $25 | 9 MAUs, ~5 GB photos/mo, well within limits |
| Azure App Service (B1) | $55 | 1 vCPU, 1.75 GB RAM ($0 with startup credits) |
| Tesseract.js (local) | $0 | ~15 min/day OCR processing, open source |
| **Total** | **$25-80/mo** | $25 with Azure credits, $80 without |

### Cost at Scale

| Teams | Users | Photos/mo | Storage Growth | Monthly Cost |
|---|---|---|---|---|
| 1 team (9) | 9 | 9,900 | 5 GB/mo | $80 |
| 10 teams (60) | 60 | 66,000 | 33 GB/mo | $80 |
| 50 teams (300) | 300 | 330,000 | 165 GB/mo | $135-160 |
| 100 teams (600) | 600 | 660,000 | 330 GB/mo | $160-185 |

**Key insight:** Infrastructure costs are nearly flat up to 100 teams. The marginal cost of adding a free team is approximately **$0.50-2.00/month** in storage. Giving the platform away is financially viable.

---

## Competitive Landscape

### Texas Data Viewers (No CRM)

| Product | Price | What They Offer | Limitation |
|---|---|---|---|
| Texas Open Data Portal | Free | Raw mixed beverage receipts, 3.66M records | No analysis, no enrichment, no mobile, messy names |
| TABS Report | $25/mo flat | Search, filter, graphs, export, watchlists | Pure data viewer — no CRM, no GPS, no field tools |
| Bar Savvy | ~$10/mo+ | Maps, chain analytics, mobile app | Same — data viewer only |
| LiquorTX | Free / paid annual | 60k+ TABC locations, 15yr history, mobile | Same — no CRM |
| MyBarSales | ~$25/mo | Basic receipts viewer | Dated interface, data only |
| yDrink | Contact sales | Brand volume tracking, market analysis | Supplier-focused, no CRM |

### National Beverage CRM Platforms (No TX Data)

| Product | Price | What They Offer | Limitation |
|---|---|---|---|
| Lilypad (Fintech) | $65/user/mo, 5-seat min ($325/mo min) | Placement tracking, activity scoring, mobile CRM | No TX govt data, $325 minimum |
| GreatVines (Andavi) | $75-200/user/mo | Full CRM on Salesforce, depletion data, AI | Enterprise pricing, requires Salesforce |
| VIP KARMA | ERP bundle | Full CRM + route accounting | Locked to VIP ecosystem |
| Encompass | Enterprise custom | Full ERP: warehouse, logistics, CRM | Way overkill for small distributors |
| Overproof | Contact sales | AI-powered sales execution, 1.5M venues | Supplier-focused, not distributor CRM |
| Ohanafy | Contact sales | Salesforce-based, AI, order management | Enterprise, Salesforce required |

### The White Space Thirst Metrics Occupies

**No competitor combines all three:**
1. Texas government sales data (enriched, cleaned, with DBA names + metroplex filters)
2. Field CRM (activity logging, contacts, photos + OCR, GPS verification)
3. Multi-level management (statewide → regional → street rep)

Data viewers are cheap ($10-25/mo) but have zero CRM. CRM platforms ($65-200/user/mo) have zero Texas data. We bridge the gap at a fraction of the CRM price.

---

## Target Market Size

| Segment | Count | Avg Team Size | Total Users |
|---|---|---|---|
| Licensed TX beer/wine/spirits wholesalers | ~900 | varies | — |
| Distributors with dedicated sales teams (3+ reps) | ~200-300 | 5-15 | 1,000-4,500 |
| Small distributors (2-10 reps) | ~150-200 | 5 | 750-1,000 |
| Mid-size distributors (10-50 reps) | ~50-80 | 25 | 1,250-2,000 |
| Large distributors (50+ reps) | ~15-20 | 100+ | 1,500+ |
| **Addressable users** | | | **3,500-7,500** |

**Additional market factors:**
- Constellation Brands restructuring displacing experienced sales reps into smaller operations
- These reps are used to enterprise tools and will seek alternatives
- 15,000-20,000 active mixed beverage permit holders = plenty of accounts to cover

---

## Year 1 Customer Acquisition Estimate

### Assumptions
- Beta launch March 2026, paid subscriptions available April 2026
- Most prospects locked into annual contracts with TABS/Lilypad/GreatVines
- Subscription renewals cluster around Jan and July (fiscal year / mid-year resets)
- Word-of-mouth is primary acquisition channel in Year 1
- Constellation layoffs create a wave of tool-shopping in Q2-Q3 2026

### Quarterly Projections

| Quarter | New Teams | Cumulative Teams | Est. Total Users | Driver |
|---|---|---|---|---|
| Q2 2026 (Apr-Jun) | 8-12 | 8-12 | 40-70 | Beta converts, early adopters, word of mouth |
| Q3 2026 (Jul-Sep) | 10-15 | 18-27 | 100-160 | Mid-year contract sunsets, Constellation ripple |
| Q4 2026 (Oct-Dec) | 12-18 | 30-45 | 170-270 | Referrals, initial marketing, pre-renewal shopping |
| Q1 2027 (Jan-Mar) | 15-25 | 45-70 | 250-420 | January renewal wave, year-end budget resets |

**Conservative Year 1 target: 40-50 teams, 220-300 users**
**Optimistic Year 1 target: 60-70 teams, 350-420 users**

---

## Recommended Pricing Model

### Philosophy
- **Free tier maximizes adoption = maximizes data collection**
- **Paid tier monetizes the insight layer, not the data entry**
- Reps logging visits, snapping menus, noting competitors = free (they're generating value for us)
- Managers analyzing trends, verifying field presence, running reports = paid (they're consuming value)
- Goal: every rep in Texas using the platform, whether they pay or not

### Tier Structure

| | Free | Pro |
|---|---|---|
| **Price** | $0 | $199/mo per organization |
| **Seats** | Up to 10 | Unlimited |
| **CRM** | Full access — activities, contacts, notes, outcomes | Same |
| **Photos + OCR** | Unlimited uploads, full OCR text extraction | Same |
| **GPS verification** | Full capture on every visit | Same |
| **Map view** | Full interactive map with account pins | Same |
| **Revenue data** | Current month + 3 months history | Full history (37+ months) |
| **Priority scoring** | Basic (high/medium/low) | Advanced (numeric score, custom weights) |
| **General sales tax comparison** | — | Full access |
| **Metroplex filters** | Basic (select metroplex) | Advanced (custom territory drawing) |
| **Ownership/chain analysis** | — | Full chain roll-ups, group analytics |
| **Manager dashboard** | — | Team activity feed, GPS verification review, goal tracking |
| **Data exports** | — | CSV, PDF reports |
| **Advanced analytics** | — | YoY trends, growth rates, market share, segment analysis |
| **Saved watchlists** | 5 accounts | Unlimited |
| **Support** | Community / email | Priority email, onboarding call |

### Why $199/mo Per Organization (Not Per Seat)

1. **Undercuts every CRM competitor massively:**
   - Lilypad: 5 seats × $65 = $325/mo minimum
   - GreatVines: 5 seats × $75 = $375/mo minimum
   - At 10 seats: Lilypad = $650/mo, GreatVines = $750/mo, **us = $199/mo**

2. **Per-org pricing removes friction:**
   - Manager doesn't have to justify per-head cost to ownership
   - Adding the 11th rep doesn't trigger a pricing conversation
   - Flat fee is easier to budget and approve

3. **Aligns incentives with data collection:**
   - We WANT them to add more reps (more data sensors)
   - Per-seat pricing discourages adding users
   - Per-org pricing encourages maximum team coverage

4. **Revenue math works:**
   - Need $5,000/mo gross = 26 paying teams
   - Conservative Year 1: 40-50 teams
   - Need ~55-65% conversion to Pro to hit target
   - This is achievable if manager dashboard + analytics are genuinely valuable

### Conversion Path: Free → Pro

The hook is the **manager dashboard and analytics**. Flow:

1. Owner/manager signs up, adds their reps to the free tier
2. Reps start logging visits, uploading menu photos, capturing GPS
3. After 2-4 weeks, manager wants to:
   - See which reps actually visited which accounts (GPS verification) → **Pro**
   - Compare their accounts' revenue trends over time → **Pro**
   - Export a report for their supplier meeting → **Pro**
   - Set goals and track team progress → **Pro**
   - See which competitor is showing up at their accounts → **Pro**
4. The data their reps already collected makes Pro immediately valuable

**Critical:** The free tier must be useful enough that reps keep logging. If the free tier is too limited, reps stop using it, and the data pipeline dries up.

### Features That Gate Behind Pro — Design Criteria

**Safe to gate (doesn't reduce data collection):**
- Historical data beyond 3 months (reps don't need YoY to log a visit)
- Manager-only views (team dashboard, GPS verification panel)
- Export/reporting (managers need this, reps don't)
- Advanced analytics (trend analysis, market share, growth scoring)
- General sales tax comparisons (strategic analysis, not field work)
- Chain/ownership roll-ups (management reporting)
- Custom territory management (admin feature)

**Must remain free (drives data collection):**
- Activity logging (visits, calls, emails, notes) — this IS the data
- Photo uploads + OCR — this IS the data
- GPS capture — this IS the data
- Contact management — this IS the data
- Basic revenue lookup (current + 3 months) — reps need this for pre-call prep
- Map view — reps need this to plan routes
- Basic priority indicators — reps need to know where to go

---

## Revenue Projections — Year 1

### Scenario A: Conservative (40 teams, 50% conversion)

| Quarter | Total Teams | Paying Teams | Monthly Revenue | Quarterly Revenue |
|---|---|---|---|---|
| Q2 2026 | 10 | 3 | $597 | $1,791 |
| Q3 2026 | 23 | 9 | $1,791 | $5,373 |
| Q4 2026 | 38 | 17 | $3,383 | $10,149 |
| Q1 2027 | 50 | 25 | $4,975 | $14,925 |
| **Year 1 Total** | | | | **$32,238** |

Hits $5k/mo run rate by Q1 2027. Year 1 average: ~$2,700/mo.

### Scenario B: Moderate (55 teams, 55% conversion)

| Quarter | Total Teams | Paying Teams | Monthly Revenue | Quarterly Revenue |
|---|---|---|---|---|
| Q2 2026 | 12 | 4 | $796 | $2,388 |
| Q3 2026 | 27 | 12 | $2,388 | $7,164 |
| Q4 2026 | 42 | 21 | $4,179 | $12,537 |
| Q1 2027 | 55 | 30 | $5,970 | $17,910 |
| **Year 1 Total** | | | | **$39,999** |

Hits $5k/mo run rate mid-Q4 2026. Year 1 average: ~$3,300/mo.

### Scenario C: Optimistic (70 teams, 55% conversion)

| Quarter | Total Teams | Paying Teams | Monthly Revenue | Quarterly Revenue |
|---|---|---|---|---|
| Q2 2026 | 15 | 5 | $995 | $2,985 |
| Q3 2026 | 35 | 16 | $3,184 | $9,552 |
| Q4 2026 | 52 | 27 | $5,373 | $16,119 |
| Q1 2027 | 70 | 39 | $7,761 | $23,283 |
| **Year 1 Total** | | | | **$51,939** |

Hits $5k/mo in Q4 2026. Year 1 average: ~$4,300/mo.

### Revenue Gap Analysis

To pay for 1 FTE at $5k/mo gross + $80-160/mo infra = **~$5,100-5,200/mo needed**

| Scenario | Month Target Hit | Shortfall Months | Cumulative Gap |
|---|---|---|---|
| Conservative | Month 11-12 | 10 months | ~$24,000 |
| Moderate | Month 8-9 | 7 months | ~$13,000 |
| Optimistic | Month 7-8 | 6 months | ~$8,000 |

**Options to close the gap:**
1. Delay the FTE hire until revenue supports it (Month 8-12)
2. Land 1-2 early data partnership contracts to supplement subscription revenue
3. Offer annual billing at $1,990/year (2 months free) to pull revenue forward
4. Part-time contractor ($2,500/mo) until revenue scales

---

## Data Contract Revenue (Future — Year 2+)

The long-term business model. Every free user is a data sensor.

### What We Can Sell (Aggregated + Anonymized)

| Data Product | Potential Buyers | Est. Value |
|---|---|---|
| Competitive placement reports (who carries what) | Brands, suppliers | $10-25k/mo |
| Market velocity dashboards (growth/decline by segment) | Distributors, analysts | $5-15k/mo |
| Street pricing intelligence (OCR'd menu data) | Brands, pricing teams | $15-30k/mo |
| Territory coverage gap analysis | Distributors expanding | $5-10k/mo |
| New account / closure alerts | Real estate, investors | $3-5k/mo |

### Data Volume Required

These contracts become viable when we have:
- 200+ active reps logging daily
- 50,000+ photos with OCR text
- 12+ months of activity history
- Coverage across multiple Texas metros

**Estimated timeline:** Late Year 2 (Q3-Q4 2027) for first data contracts

---

## Implementation Plan

### Phase 1: Stripe Integration (DONE — March 2026)
- Stripe checkout, webhook, portal routes ✅
- Organization + subscription schema ✅
- Billing page with tier selection ✅
- Middleware subscription gating ✅

### Phase 2: Update for Free + Pro Model (Post Beta Testing)
1. Update Stripe to single $199/mo "Pro" price (one product, one price, per-org)
2. Add `subscription_status = 'free'` as valid status
3. Update billing page to show Free vs Pro comparison
4. Implement feature gates:
   - Historical data depth limit (3 months for free)
   - Manager dashboard access gate
   - Export/download gate
   - Advanced analytics gate
   - Watchlist limit (5 for free)
5. Update middleware to allow `free` status through (with feature restrictions at component level)
6. Beta user migration: set all existing users to `free` with org

### Phase 3: Annual Billing Option
- Add $1,990/year price in Stripe (save $398 vs monthly)
- Update billing page with monthly/annual toggle

### Phase 4: Data Partnership Infrastructure (Year 2)
- Aggregation pipeline for anonymized market reports
- Data export API for partners
- ToS update covering anonymized data usage rights

---

## Open Questions

1. **$199 or $149?** Lower price = more conversions but need more teams. $149 needs 35 paying teams for $5k/mo vs 26 at $199.
2. **Annual discount?** 2 months free (standard) or more aggressive?
3. **Early adopter pricing?** Lock in beta converters at $149/mo for life?
4. **Free trial of Pro?** 14 days? 30 days? Or let managers see grayed-out Pro features to drive FOMO?
5. **Data usage ToS** — needs legal review before launch
6. **When to sunset unlimited free?** Never (if data contracts work) or cap at some point?

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-07 | Free for teams up to 10 seats | Maximize data collection; marginal cost ~$2/team |
| 2026-03-07 | Per-org pricing, not per-seat | Aligns incentives — we want more reps, not fewer |
| 2026-03-07 | Gate analytics/manager tools, not CRM/photos | Protect data collection pipeline |
| 2026-03-07 | Target: $199/mo Pro tier | Undercuts Lilypad 40%, GreatVines 75% |
