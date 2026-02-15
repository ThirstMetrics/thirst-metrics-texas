/**
 * Customer Coordinates API Route
 * Bulk coordinates endpoint for customer map display with revenue + tier colors
 *
 * GET /api/customers/coordinates
 * Query params: county, city, metroplex, search, limit (max 500), category, monthsBack
 * Returns: { customers: Array<{ id, name, permit_number, lat, lng, address, revenues, tier_color }> }
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/duckdb/connection';

// Revenue tier color type
type TierColor = 'green' | 'lightgreen' | 'yellow' | 'orange' | 'red';
type Category = 'all' | 'beer' | 'wine' | 'spirits';

// Types for the response
interface CustomerCoordinate {
  id: string;
  name: string;
  permit_number: string;
  trade_name?: string;
  lat: number;
  lng: number;
  address: string;
  // Revenue fields
  total_revenue: number;
  beer_revenue: number;
  wine_revenue: number;
  liquor_revenue: number;
  // Tier color based on Pareto revenue ranking
  tier_color: TierColor;
  tier_label: string;
}

// Customer without coordinates (for list display)
interface CustomerWithoutCoords {
  id: string;
  name: string;
  permit_number: string;
  address: string;
}

interface CoordinatesResponse {
  customers: CustomerCoordinate[];
  total: number;
  filtered: number;
  category: Category;
  // Non-geocoded customers
  nonGeocodedCount: number;
  nonGeocodedCustomers: CustomerWithoutCoords[];
}

interface CoordinatesErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

// Database row type from DuckDB query
interface CustomerCoordinateRow {
  tabc_permit_number: string;
  location_name: string | null;
  clean_dba_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  latitude: number | null;
  longitude: number | null;
  total_revenue: number;
  beer_revenue: number;
  wine_revenue: number;
  liquor_revenue: number;
}

// Max customers to return for map performance
const MAX_MAP_MARKERS = 500;

/**
 * Assign Pareto-style tier colors based on cumulative revenue
 * Top accounts generating 0-25% of revenue = green
 * 25-50% = lightgreen, 50-60% = yellow, 60-80% = orange, 80%+ = red
 */
function assignTierColors(
  customers: CustomerCoordinate[],
  category: Category
): CustomerCoordinate[] {
  const revenueKey = {
    all: 'total_revenue',
    beer: 'beer_revenue',
    wine: 'wine_revenue',
    spirits: 'liquor_revenue',
  }[category] as 'total_revenue' | 'beer_revenue' | 'wine_revenue' | 'liquor_revenue';

  // Sort descending by selected revenue
  const sorted = [...customers].sort(
    (a, b) => b[revenueKey] - a[revenueKey]
  );

  const totalRevenue = sorted.reduce((sum, c) => sum + c[revenueKey], 0);

  if (totalRevenue === 0) {
    return sorted.map((c) => ({ ...c, tier_color: 'red' as TierColor, tier_label: 'No Revenue' }));
  }

  let cumulative = 0;
  return sorted.map((c) => {
    cumulative += c[revenueKey];
    const pct = cumulative / totalRevenue;

    let tier_color: TierColor;
    let tier_label: string;

    if (pct <= 0.25) {
      tier_color = 'green';
      tier_label = 'Top 25%';
    } else if (pct <= 0.50) {
      tier_color = 'lightgreen';
      tier_label = 'Top 50%';
    } else if (pct <= 0.60) {
      tier_color = 'yellow';
      tier_label = 'Top 60%';
    } else if (pct <= 0.80) {
      tier_color = 'orange';
      tier_label = 'Top 80%';
    } else {
      tier_color = 'red';
      tier_label = 'Bottom 20%';
    }

    return { ...c, tier_color, tier_label };
  });
}

/**
 * GET /api/customers/coordinates
 * Returns all customers with their coordinates, revenue, and tier colors for map display
 */
export async function GET(
  request: Request
): Promise<NextResponse<CoordinatesResponse | CoordinatesErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const county = searchParams.get('county') || undefined;
    const city = searchParams.get('city') || undefined;
    const metroplex = searchParams.get('metroplex') || undefined;
    const search = searchParams.get('search') || undefined;
    const category = (searchParams.get('category') || 'all') as Category;
    const monthsBack = parseInt(searchParams.get('monthsBack') || '12', 10);
    const limitParam = searchParams.get('limit');
    const limit = Math.min(
      parseInt(limitParam || String(MAX_MAP_MARKERS), 10),
      MAX_MAP_MARKERS
    );

    // Validate category
    const validCategories: Category[] = ['all', 'beer', 'wine', 'spirits'];
    const safeCategory = validCategories.includes(category) ? category : 'all';

    // Calculate date filter
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - monthsBack);
    const dateStr = dateThreshold.toISOString().split('T')[0]; // YYYY-MM-DD

    // Build SQL query joining customers with coordinates + revenue aggregations
    let sql = `
      SELECT DISTINCT
        m.tabc_permit_number,
        COALESCE(e.clean_dba_name, MAX(m.location_name)) as location_name,
        e.clean_dba_name,
        MAX(m.location_address) as location_address,
        MAX(m.location_city) as location_city,
        MAX(m.location_state) as location_state,
        MAX(m.location_zip) as location_zip,
        c.latitude,
        c.longitude,
        CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) as total_revenue,
        CAST(COALESCE(SUM(m.beer_receipts), 0) AS DOUBLE) as beer_revenue,
        CAST(COALESCE(SUM(m.wine_receipts), 0) AS DOUBLE) as wine_revenue,
        CAST(COALESCE(SUM(m.liquor_receipts), 0) AS DOUBLE) as liquor_revenue
      FROM mixed_beverage_receipts m
      LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
      INNER JOIN location_coordinates c ON m.tabc_permit_number = c.tabc_permit_number
      WHERE c.latitude IS NOT NULL
        AND c.longitude IS NOT NULL
        AND c.geocode_quality != 'failed'
        AND m.obligation_end_date >= ?
    `;

    const params: (string | number)[] = [dateStr];

    // Apply filters
    if (county) {
      sql += ` AND m.location_county_code = ?`;
      params.push(county);
    }

    if (city) {
      sql += ` AND LOWER(m.location_city) LIKE ?`;
      params.push(`%${city.toLowerCase()}%`);
    }

    if (metroplex) {
      sql += ` AND m.location_zip IS NOT NULL AND SUBSTR(m.location_zip, 1, 5) IN (SELECT zip FROM metroplexes WHERE metroplex = ?)`;
      params.push(metroplex);
    }

    if (search) {
      sql += ` AND (
        UPPER(m.tabc_permit_number) LIKE ? OR
        LOWER(COALESCE(e.clean_dba_name, m.location_name)) LIKE ? OR
        LOWER(m.location_address) LIKE ?
      )`;
      const permitSearch = `%${search.toUpperCase()}%`;
      const textSearch = `%${search.toLowerCase()}%`;
      params.push(permitSearch, textSearch, textSearch);
    }

    // Group by permit number
    sql += ` GROUP BY m.tabc_permit_number, e.clean_dba_name, c.latitude, c.longitude`;

    // If filtering by category, exclude zero-revenue customers in that category
    if (safeCategory === 'beer') {
      sql += ` HAVING SUM(m.beer_receipts) > 0`;
    } else if (safeCategory === 'wine') {
      sql += ` HAVING SUM(m.wine_receipts) > 0`;
    } else if (safeCategory === 'spirits') {
      sql += ` HAVING SUM(m.liquor_receipts) > 0`;
    }

    sql += ` ORDER BY total_revenue DESC`;

    // Limit results for map performance
    sql += ` LIMIT ?`;
    params.push(limit);

    const rows = await query<CustomerCoordinateRow>(sql, params);

    // Transform rows to response format
    let customers: CustomerCoordinate[] = rows
      .filter((row) => row.latitude != null && row.longitude != null)
      .map((row) => {
        // Build full address string
        const addressParts = [
          row.location_address,
          row.location_city,
          row.location_state,
          row.location_zip,
        ].filter(Boolean);

        return {
          id: row.tabc_permit_number,
          name: row.location_name || row.clean_dba_name || 'Unknown',
          permit_number: row.tabc_permit_number,
          trade_name: row.clean_dba_name || undefined,
          lat: row.latitude!,
          lng: row.longitude!,
          address: addressParts.join(', '),
          total_revenue: Number(row.total_revenue) || 0,
          beer_revenue: Number(row.beer_revenue) || 0,
          wine_revenue: Number(row.wine_revenue) || 0,
          liquor_revenue: Number(row.liquor_revenue) || 0,
          tier_color: 'red' as TierColor,  // placeholder, assigned below
          tier_label: '',
        };
      });

    // Assign Pareto-style tier colors
    customers = assignTierColors(customers, safeCategory);

    // Get total count of customers with coordinates (for pagination info)
    const countSql = `
      SELECT COUNT(DISTINCT m.tabc_permit_number) as total
      FROM mixed_beverage_receipts m
      INNER JOIN location_coordinates c ON m.tabc_permit_number = c.tabc_permit_number
      WHERE c.latitude IS NOT NULL
        AND c.longitude IS NOT NULL
        AND c.geocode_quality != 'failed'
    `;

    const countResult = await query<{ total: number | bigint }>(countSql, []);
    const total = countResult.length > 0
      ? (typeof countResult[0].total === 'bigint'
          ? Number(countResult[0].total)
          : countResult[0].total)
      : 0;

    // Query for customers WITHOUT coordinates (non-geocoded)
    // These will be shown in a separate list on mobile
    let nonGeocodedSql = `
      SELECT DISTINCT
        m.tabc_permit_number,
        COALESCE(e.clean_dba_name, MAX(m.location_name)) as location_name,
        MAX(m.location_address) as location_address,
        MAX(m.location_city) as location_city,
        MAX(m.location_state) as location_state,
        MAX(m.location_zip) as location_zip
      FROM mixed_beverage_receipts m
      LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
      LEFT JOIN location_coordinates c ON m.tabc_permit_number = c.tabc_permit_number
      WHERE (c.tabc_permit_number IS NULL OR c.latitude IS NULL OR c.longitude IS NULL OR c.geocode_quality = 'failed')
    `;

    const nonGeoParams: (string | number)[] = [];

    // Apply same filters to non-geocoded query
    if (county) {
      nonGeocodedSql += ` AND m.location_county_code = ?`;
      nonGeoParams.push(county);
    }

    if (city) {
      nonGeocodedSql += ` AND LOWER(m.location_city) LIKE ?`;
      nonGeoParams.push(`%${city.toLowerCase()}%`);
    }

    if (metroplex) {
      nonGeocodedSql += ` AND m.location_zip IS NOT NULL AND SUBSTR(m.location_zip, 1, 5) IN (SELECT zip FROM metroplexes WHERE metroplex = ?)`;
      nonGeoParams.push(metroplex);
    }

    if (search) {
      nonGeocodedSql += ` AND (
        UPPER(m.tabc_permit_number) LIKE ? OR
        LOWER(COALESCE(e.clean_dba_name, m.location_name)) LIKE ? OR
        LOWER(m.location_address) LIKE ?
      )`;
      const permitSearch = `%${search.toUpperCase()}%`;
      const textSearch = `%${search.toLowerCase()}%`;
      nonGeoParams.push(permitSearch, textSearch, textSearch);
    }

    nonGeocodedSql += ` GROUP BY m.tabc_permit_number, e.clean_dba_name`;
    nonGeocodedSql += ` ORDER BY location_name ASC`;
    nonGeocodedSql += ` LIMIT 100`; // Limit non-geocoded list for performance

    const nonGeocodedRows = await query<CustomerCoordinateRow>(nonGeocodedSql, nonGeoParams);

    const nonGeocodedCustomers: CustomerWithoutCoords[] = nonGeocodedRows.map((row) => {
      const addressParts = [
        row.location_address,
        row.location_city,
        row.location_state,
        row.location_zip,
      ].filter(Boolean);

      return {
        id: row.tabc_permit_number,
        name: row.location_name || 'Unknown',
        permit_number: row.tabc_permit_number,
        address: addressParts.join(', '),
      };
    });

    // Get total count of non-geocoded customers
    const nonGeoCountSql = `
      SELECT COUNT(DISTINCT m.tabc_permit_number) as total
      FROM mixed_beverage_receipts m
      LEFT JOIN location_coordinates c ON m.tabc_permit_number = c.tabc_permit_number
      WHERE c.tabc_permit_number IS NULL OR c.latitude IS NULL OR c.longitude IS NULL OR c.geocode_quality = 'failed'
    `;
    const nonGeoCountResult = await query<{ total: number | bigint }>(nonGeoCountSql, []);
    const nonGeocodedCount = nonGeoCountResult.length > 0
      ? (typeof nonGeoCountResult[0].total === 'bigint'
          ? Number(nonGeoCountResult[0].total)
          : nonGeoCountResult[0].total)
      : 0;

    const response: CoordinatesResponse = {
      customers,
      total,
      filtered: customers.length,
      category: safeCategory,
      nonGeocodedCount,
      nonGeocodedCustomers,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[API Coordinates] Error:', errorMessage);
    console.error('[API Coordinates] Stack:', errorStack);

    // Check for database connection errors
    if (errorMessage.includes('DuckDB') || errorMessage.includes('database')) {
      return NextResponse.json(
        {
          error: 'Database Error',
          message: 'Unable to fetch customer coordinates',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
