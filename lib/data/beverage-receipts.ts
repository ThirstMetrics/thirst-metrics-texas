/**
 * Beverage Receipts Data Access
 * Queries DuckDB for customer revenue data
 */

import { query, queryOne } from '../duckdb/connection';

export interface CustomerRevenue {
  tabc_permit_number: string;
  location_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  location_county: string | null;
  location_county_code: string | null;
  ownership_group: string | null;
  industry_segment: string | null;
  total_revenue: number;
  wine_revenue: number;
  beer_revenue: number;
  liquor_revenue: number;
  cover_charge_revenue: number;
  last_receipt_date: string;
  receipt_count: number;
}

export interface MonthlyRevenue {
  month: string; // YYYY-MM format
  total_receipts: number;
  liquor_receipts: number;
  wine_receipts: number;
  beer_receipts: number;
  cover_charge_receipts: number;
}

/**
 * Get list of customers with aggregated revenue
 */
export async function getCustomers(filters?: {
  county?: string;
  city?: string;
  zip?: string;
  metroplex?: string;
  minRevenue?: number;
  monthsBack?: number;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'revenue' | 'name' | 'last_receipt';
  sortOrder?: 'asc' | 'desc';
  sortByRevenue?: 'total' | 'wine' | 'beer' | 'liquor' | 'cover_charge';
  topN?: number;
}): Promise<CustomerRevenue[]> {
  let sql = `
    SELECT 
      m.tabc_permit_number,
      COALESCE(e.clean_dba_name, MAX(m.location_name)) as location_name,
      MAX(m.location_address) as location_address,
      MAX(m.location_city) as location_city,
      MAX(m.location_state) as location_state,
      MAX(m.location_zip) as location_zip,
      COALESCE(MAX(c.county_name), MAX(m.location_county)) as location_county,
      MAX(m.location_county_code) as location_county_code,
      CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) as total_revenue,
      CAST(COALESCE(SUM(m.wine_receipts), 0) AS DOUBLE) as wine_revenue,
      CAST(COALESCE(SUM(m.beer_receipts), 0) AS DOUBLE) as beer_revenue,
      CAST(COALESCE(SUM(m.liquor_receipts), 0) AS DOUBLE) as liquor_revenue,
      CAST(COALESCE(SUM(m.cover_charge_receipts), 0) AS DOUBLE) as cover_charge_revenue,
      CAST(MAX(m.obligation_end_date) AS VARCHAR) as last_receipt_date,
      CAST(COUNT(*) AS INTEGER) as receipt_count,
      MAX(e.ownership_group) as ownership_group,
      MAX(e.industry_segment) as industry_segment
    FROM mixed_beverage_receipts m
    LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
    LEFT JOIN counties c ON m.location_county_code = c.county_code
    WHERE 1=1
  `;

  const params: any[] = [];

  // Time period filter - calculate cutoff date
  if (filters?.monthsBack) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - filters.monthsBack);
    const cutoffStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    sql += ` AND m.obligation_end_date >= ?`;
    params.push(cutoffStr);
  }

  if (filters?.county) {
    sql += ` AND m.location_county_code = ?`;
    params.push(filters.county);
  }
  
  if (filters?.city) {
    sql += ` AND LOWER(m.location_city) LIKE ?`;
    params.push(`%${filters.city.toLowerCase()}%`);
  }
  
  if (filters?.zip) {
    sql += ` AND m.location_zip = ?`;
    params.push(filters.zip);
  }
  
  if (filters?.metroplex) {
    sql += ` AND m.location_zip IS NOT NULL AND SUBSTR(m.location_zip, 1, 5) IN (SELECT zip FROM metroplexes WHERE metroplex = ?)`;
    params.push(filters.metroplex);
  }
  
  if (filters?.search) {
    sql += ` AND (
      UPPER(m.tabc_permit_number) LIKE ? OR
      LOWER(COALESCE(e.clean_dba_name, m.location_name)) LIKE ? OR
      LOWER(m.location_address) LIKE ?
    )`;
    const permitSearch = `%${filters.search.toUpperCase()}%`;
    const textSearch = `%${filters.search.toLowerCase()}%`;
    params.push(permitSearch, textSearch, textSearch);
  }
  
  sql += ` GROUP BY m.tabc_permit_number, e.clean_dba_name`;
  
  if (filters?.minRevenue) {
    sql += ` HAVING SUM(m.total_receipts) >= ?`;
    params.push(filters.minRevenue);
  }
  
  // Sorting
  const sortBy = filters?.sortBy || 'revenue';
  const sortOrder = filters?.sortOrder || 'desc';
  const sortByRevenue = filters?.sortByRevenue || 'total';

  if (sortBy === 'revenue') {
    // Use sortByRevenue to determine which column to sort by
    const revenueColumnMap: Record<string, string> = {
      'total': 'total_revenue',
      'wine': 'wine_revenue',
      'beer': 'beer_revenue',
      'liquor': 'liquor_revenue',
      'cover_charge': 'cover_charge_revenue',
    };
    const revenueColumn = revenueColumnMap[sortByRevenue] || 'total_revenue';
    sql += ` ORDER BY ${revenueColumn} ${sortOrder.toUpperCase()} NULLS LAST`;
  } else if (sortBy === 'name') {
    sql += ` ORDER BY location_name ${sortOrder.toUpperCase()} NULLS LAST`;
  } else if (sortBy === 'last_receipt') {
    sql += ` ORDER BY last_receipt_date ${sortOrder.toUpperCase()} NULLS LAST`;
  }
  
  // Pagination
  if (filters?.limit) {
    sql += ` LIMIT ?`;
    params.push(filters.limit);
    
    if (filters?.offset) {
      sql += ` OFFSET ?`;
      params.push(filters.offset);
    }
  }

  const results = await query<CustomerRevenue>(sql, params);
  return results;
}

/**
 * Get customer detail by permit number
 * Uses exact match instead of search to avoid false positives
 */
export async function getCustomerByPermit(permitNumber: string): Promise<CustomerRevenue | null> {
  const sql = `
    SELECT 
      m.tabc_permit_number,
      COALESCE(e.clean_dba_name, MAX(m.location_name)) as location_name,
      MAX(m.location_address) as location_address,
      MAX(m.location_city) as location_city,
      MAX(m.location_state) as location_state,
      MAX(m.location_zip) as location_zip,
      COALESCE(MAX(c.county_name), MAX(m.location_county)) as location_county,
      MAX(m.location_county_code) as location_county_code,
      CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) as total_revenue,
      CAST(COALESCE(SUM(m.wine_receipts), 0) AS DOUBLE) as wine_revenue,
      CAST(COALESCE(SUM(m.beer_receipts), 0) AS DOUBLE) as beer_revenue,
      CAST(COALESCE(SUM(m.liquor_receipts), 0) AS DOUBLE) as liquor_revenue,
      CAST(COALESCE(SUM(m.cover_charge_receipts), 0) AS DOUBLE) as cover_charge_revenue,
      CAST(MAX(m.obligation_end_date) AS VARCHAR) as last_receipt_date,
      CAST(COUNT(*) AS INTEGER) as receipt_count,
      MAX(e.ownership_group) as ownership_group,
      MAX(e.industry_segment) as industry_segment
    FROM mixed_beverage_receipts m
    LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
    LEFT JOIN counties c ON m.location_county_code = c.county_code
    WHERE m.tabc_permit_number = ?
    GROUP BY m.tabc_permit_number, e.clean_dba_name
    LIMIT 1
  `;

  const result = await queryOne<CustomerRevenue>(sql, [permitNumber]);
  return result;
}

/**
 * Get monthly revenue history for a customer.
 * Uses location_month_key format {tabc_permit_number}_{YYYYMM} (e.g. MB722028_202512).
 */
export async function getCustomerMonthlyRevenue(
  permitNumber: string,
  months: number = 12
): Promise<MonthlyRevenue[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - months);
  const cutoffYYYYMM =
    cutoffDate.getFullYear().toString() +
    (cutoffDate.getMonth() + 1).toString().padStart(2, '0');

  const sql = `
    SELECT 
      right(location_month_key, 6) as month_raw,
      left(right(location_month_key, 6), 4) || '-' || right(location_month_key, 2) as month,
      CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE) as total_receipts,
      CAST(COALESCE(SUM(liquor_receipts), 0) AS DOUBLE) as liquor_receipts,
      CAST(COALESCE(SUM(wine_receipts), 0) AS DOUBLE) as wine_receipts,
      CAST(COALESCE(SUM(beer_receipts), 0) AS DOUBLE) as beer_receipts,
      CAST(COALESCE(SUM(cover_charge_receipts), 0) AS DOUBLE) as cover_charge_receipts
    FROM mixed_beverage_receipts
    WHERE tabc_permit_number = ?
      AND right(location_month_key, 6) >= ?
    GROUP BY right(location_month_key, 6), left(right(location_month_key, 6), 4) || '-' || right(location_month_key, 2)
    ORDER BY right(location_month_key, 6) ASC
  `;

  const results = await query<MonthlyRevenue & { month_raw?: string }>(sql, [permitNumber, cutoffYYYYMM]);
  return results as MonthlyRevenue[];
}

/**
 * Get customer count for pagination
 */
export async function getCustomerCount(filters?: {
  county?: string;
  city?: string;
  zip?: string;
  metroplex?: string;
  minRevenue?: number;
  monthsBack?: number;
  search?: string;
}): Promise<number> {
  let sql = `
    SELECT COUNT(*) as count
    FROM (
      SELECT m.tabc_permit_number
      FROM mixed_beverage_receipts m
      LEFT JOIN location_enrichments e ON m.tabc_permit_number = e.tabc_permit_number
      WHERE 1=1
  `;

  const params: any[] = [];

  // Time period filter - calculate cutoff date
  if (filters?.monthsBack) {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - filters.monthsBack);
    const cutoffStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    sql += ` AND m.obligation_end_date >= ?`;
    params.push(cutoffStr);
  }

  if (filters?.county) {
    sql += ` AND m.location_county_code = ?`;
    params.push(filters.county);
  }

  if (filters?.city) {
    sql += ` AND m.location_city IS NOT NULL AND LOWER(m.location_city) LIKE ?`;
    params.push(`%${filters.city.toLowerCase()}%`);
  }

  if (filters?.zip) {
    sql += ` AND m.location_zip = ?`;
    params.push(filters.zip);
  }

  if (filters?.metroplex) {
    sql += ` AND m.location_zip IS NOT NULL AND SUBSTR(m.location_zip, 1, 5) IN (SELECT zip FROM metroplexes WHERE metroplex = ?)`;
    params.push(filters.metroplex);
  }

  if (filters?.search) {
    sql += ` AND (
      UPPER(m.tabc_permit_number) LIKE ? OR
      LOWER(COALESCE(e.clean_dba_name, m.location_name)) LIKE ? OR
      LOWER(m.location_address) LIKE ?
    )`;
    const permitSearch = `%${filters.search.toUpperCase()}%`;
    const textSearch = `%${filters.search.toLowerCase()}%`;
    params.push(permitSearch, textSearch, textSearch);
  }
  
  sql += ` GROUP BY m.tabc_permit_number, e.clean_dba_name`;
  
  if (filters?.minRevenue) {
    sql += ` HAVING SUM(m.total_receipts) >= ?`;
    params.push(filters.minRevenue);
  }
  
  sql += `) sub`;
  
  const result = await queryOne<{ count: number | bigint }>(sql, params);
  // Convert BigInt to number if needed
  const count = result?.count;
  if (typeof count === 'bigint') {
    return Number(count);
  }
  return count || 0;
}

/**
 * Get list of counties with customers
 */
export async function getCountyList(): Promise<{ county_code: string; county_name: string }[]> {
  const sql = `
    SELECT DISTINCT c.county_code, c.county_name
    FROM counties c
    INNER JOIN mixed_beverage_receipts m ON c.county_code = m.location_county_code
    ORDER BY c.county_name
  `;
  return query<{ county_code: string; county_name: string }>(sql);
}

/**
 * Get list of metroplexes
 */
export async function getMetroplexList(): Promise<{ metroplex: string }[]> {
  const sql = `
    SELECT DISTINCT metroplex
    FROM metroplexes
    WHERE metroplex IS NOT NULL
    ORDER BY metroplex
  `;
  return query<{ metroplex: string }>(sql);
}
