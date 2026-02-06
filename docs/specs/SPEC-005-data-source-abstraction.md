# SPEC-005: Data Source Abstraction Layer

**Priority**: Start now, implement incrementally alongside other specs
**Phase**: Architecture (cross-cutting)
**Rationale**: Post-production, the Texas beverage receipt data will be replaced with Google Maps Places data for a generic sales activity tracker. Design the data layer now so this swap is a configuration change, not a rewrite.

---

## Objective

Create an interface layer between the UI/API routes and the underlying data sources. The UI should never know whether customer data comes from Texas.gov, Google Places, or any other source. All Texas-specific naming (TABC permit, county codes, beverage receipts) should be abstracted behind generic interfaces.

---

## Task 1: Define Generic Customer Interface

**File**: NEW `lib/data/interfaces/customer.ts`

### Requirements

```typescript
/**
 * Generic customer interface — data-source agnostic.
 * Texas implementation: backed by DuckDB mixed_beverage_receipts + location_enrichments
 * Future implementation: backed by Google Maps Places API
 */
export interface Customer {
  /** Unique identifier for this location. Texas: TABC permit number. Google: place_id. */
  id: string;

  /** Display name (prefer enriched/clean name) */
  name: string;

  /** Street address */
  address: string;

  /** City */
  city: string;

  /** State/province/region */
  state: string;

  /** Postal code */
  postalCode: string;

  /** Geographic region (Texas: county. Generic: region/district) */
  region: string;

  /** Market area (Texas: metroplex. Generic: metro area) */
  marketArea?: string;

  /** Coordinates if available */
  latitude?: number;
  longitude?: number;

  /** Business category/type */
  businessType?: string;

  /** Ownership group or chain name */
  ownershipGroup?: string;

  /** Industry segment */
  industrySegment?: string;
}

export interface CustomerRevenueSummary {
  customerId: string;
  totalRevenue: number;
  revenueBreakdown: Record<string, number>;  // Texas: { liquor, wine, beer, cover_charge }. Generic: flexible.
  lastActivityDate?: string;
  activityCount: number;
}

export interface MonthlyRevenueData {
  month: string;  // YYYY-MM
  total: number;
  breakdown: Record<string, number>;
}

export interface CustomerFilter {
  search?: string;
  region?: string;       // Texas: county. Generic: region
  city?: string;
  marketArea?: string;   // Texas: metroplex. Generic: metro
  minRevenue?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface CustomerListResult {
  customers: (Customer & CustomerRevenueSummary)[];
  totalCount: number;
  page: number;
  limit: number;
}
```

### Acceptance Criteria
- [ ] Interfaces defined with JSDoc explaining Texas vs generic mapping
- [ ] No Texas-specific field names in the interfaces (no `tabc_permit_number`, no `county_code`, no `beverage_receipts`)

---

## Task 2: Create Data Source Provider Interface

**File**: NEW `lib/data/interfaces/data-provider.ts`

### Requirements

```typescript
import { Customer, CustomerFilter, CustomerListResult, MonthlyRevenueData, CustomerRevenueSummary } from './customer';

/**
 * Interface for a location/customer data provider.
 * Implementations:
 *   - TexasDataProvider (DuckDB, Texas.gov API)
 *   - GooglePlacesDataProvider (future)
 */
export interface DataProvider {
  /** Unique name for this provider */
  readonly name: string;

  /** Get filtered, paginated customer list */
  getCustomers(filters: CustomerFilter): Promise<CustomerListResult>;

  /** Get single customer by ID */
  getCustomerById(id: string): Promise<(Customer & CustomerRevenueSummary) | null>;

  /** Get monthly revenue history for a customer */
  getMonthlyRevenue(customerId: string, months?: number): Promise<MonthlyRevenueData[]>;

  /** Get total customer count (for pagination) */
  getCustomerCount(filters?: CustomerFilter): Promise<number>;

  /** Get available regions for filter dropdown */
  getRegions(): Promise<Array<{ code: string; name: string }>>;

  /** Get available market areas for filter dropdown */
  getMarketAreas(): Promise<Array<{ name: string }>>;

  /** Search customers by text */
  searchCustomers(query: string, limit?: number): Promise<Customer[]>;
}
```

### Acceptance Criteria
- [ ] Interface is complete and covers all current data access patterns
- [ ] No implementation details leak into the interface

---

## Task 3: Implement Texas Data Provider

**File**: NEW `lib/data/providers/texas-provider.ts`

### Requirements

1. Implement `DataProvider` interface using the existing DuckDB queries
2. Map between generic interfaces and Texas-specific data:
   - `Customer.id` ← `tabc_permit_number`
   - `Customer.name` ← `clean_dba_name || location_name`
   - `Customer.region` ← `location_county` (county name, not code)
   - `Customer.marketArea` ← metroplex name
   - `CustomerRevenueSummary.revenueBreakdown` ← `{ liquor: liquor_receipts, wine: wine_receipts, beer: beer_receipts, cover_charge: cover_charge_receipts }`
   - `MonthlyRevenueData.breakdown` ← same mapping

3. Reuse existing query functions from `lib/data/beverage-receipts.ts` internally
   - Don't duplicate SQL — call the existing functions and map the results
   - Over time, the existing functions can be refactored to use the provider directly

4. Export a singleton instance:
   ```typescript
   export const texasProvider = new TexasDataProvider();
   ```

### Acceptance Criteria
- [ ] All DataProvider methods implemented
- [ ] Existing DuckDB queries reused (no SQL duplication)
- [ ] Type mapping is correct (no Texas-specific fields leak through)
- [ ] Unit test: call each method and verify return types match interfaces

---

## Task 4: Provider Registry

**File**: NEW `lib/data/providers/index.ts`

### Requirements

```typescript
import { DataProvider } from '../interfaces/data-provider';
import { texasProvider } from './texas-provider';

const providers: Record<string, DataProvider> = {
  texas: texasProvider,
  // future: googlePlacesProvider
};

/**
 * Get the active data provider.
 * Configured via DATA_PROVIDER env var. Default: 'texas'.
 */
export function getDataProvider(): DataProvider {
  const providerName = process.env.DATA_PROVIDER || 'texas';
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown data provider: ${providerName}. Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}
```

Add to `.env.example`:
```
# Data provider (texas | google_places)
DATA_PROVIDER=texas
```

### Acceptance Criteria
- [ ] `getDataProvider()` returns the Texas provider by default
- [ ] Setting `DATA_PROVIDER=unknown` throws a clear error
- [ ] Future providers can be added by implementing the interface and registering here

---

## Task 5: Migrate API Routes to Use Provider (Incremental)

**Files**: `app/api/customers/route.ts`, `app/api/counties/route.ts`, `app/api/metroplexes/route.ts`

### Requirements

This is an incremental migration. Do NOT rewrite all routes at once. Start with the customer list endpoint as a proof of concept:

1. **`app/api/customers/route.ts`**:
   - Import `getDataProvider()`
   - Replace direct DuckDB query calls with `provider.getCustomers(filters)`
   - Map the `CustomerFilter` from query params
   - Return the `CustomerListResult` as JSON

2. **`app/api/counties/route.ts`** → rename to `app/api/regions/route.ts`:
   - Use `provider.getRegions()`
   - Keep `/api/counties` as an alias that redirects to `/api/regions` for backwards compatibility during migration

3. **`app/api/metroplexes/route.ts`** → rename to `app/api/market-areas/route.ts`:
   - Use `provider.getMarketAreas()`
   - Keep `/api/metroplexes` as an alias during migration

### Migration Strategy
- Phase A (now): Create interfaces + Texas provider + migrate `/api/customers`
- Phase B (later): Migrate remaining routes one at a time
- Phase C (post-production): Implement Google Places provider, set `DATA_PROVIDER=google_places`

### Acceptance Criteria
- [ ] `/api/customers` works identically before and after migration (same response shape)
- [ ] No breaking changes to the frontend
- [ ] Provider abstraction is tested with Texas data

---

## Important: What NOT to Change Yet

- **Do NOT rename database columns** — the DuckDB schema stays Texas-specific
- **Do NOT rename UI labels** — "County" and "Metroplex" are fine for the Texas deployment
- **Do NOT create the Google Places provider** — just design the interface so it can be built later
- **Do NOT change the component prop types** — the mapping happens in the API layer, not the UI layer

The abstraction boundary is at the API route level. Components receive generic-enough data via the API response. The Texas-specific naming in components (if any) can be swapped via config labels in a future spec.

---

## Files Modified/Created (expected)
- `lib/data/interfaces/customer.ts` — NEW
- `lib/data/interfaces/data-provider.ts` — NEW
- `lib/data/providers/texas-provider.ts` — NEW
- `lib/data/providers/index.ts` — NEW
- `app/api/customers/route.ts` — refactor to use provider
- `.env.example` — add DATA_PROVIDER

## Out of Scope
- Google Places provider implementation — future
- UI label configuration (county → region) — future
- Database schema changes — future
- Frontend component refactoring — future
