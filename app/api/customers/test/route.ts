/**
 * Test Customers API Route
 * Simple test to verify DuckDB connection and basic query
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/duckdb/connection';

export async function GET() {
  try {
    // Test 1: Simple count query
    const countResult = await query<{ count: bigint }>('SELECT COUNT(*) as count FROM mixed_beverage_receipts');

    // Test 2: Simple aggregation query
    const aggResult = await query(`
      SELECT 
        tabc_permit_number,
        SUM(total_receipts) as total_revenue,
        COUNT(*) as receipt_count
      FROM mixed_beverage_receipts
      GROUP BY tabc_permit_number
      LIMIT 5
    `);

    // Test 3: Query with LIKE
    const searchResult = await query(`
      SELECT 
        tabc_permit_number,
        location_name
      FROM mixed_beverage_receipts
      WHERE location_name LIKE ?
      LIMIT 5
    `, ['%hooters%']);

    return NextResponse.json({
      success: true,
      count: Number(countResult[0]?.count || 0),
      sampleAggregation: aggResult,
      sampleSearch: searchResult,
    });
  } catch (error: any) {
    console.error('[TEST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
