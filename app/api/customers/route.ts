/**
 * Customers API Route
 * Returns customer list with filtering and pagination
 */

import { NextResponse } from 'next/server';
import { getCustomers, getCustomerCount } from '@/lib/data/beverage-receipts';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search') || undefined;
    const county = searchParams.get('county') || undefined;
    const city = searchParams.get('city') || undefined;
    const metroplex = searchParams.get('metroplex') || undefined;
    const sortBy = (searchParams.get('sortBy') as 'revenue' | 'name' | 'last_receipt') || 'revenue';
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
    const minRevenue = searchParams.get('minRevenue') ? parseFloat(searchParams.get('minRevenue')!) : undefined;
    const monthsBack = searchParams.get('monthsBack') ? parseInt(searchParams.get('monthsBack')!) : 12;
    const sortByRevenue = (searchParams.get('sortByRevenue') as 'total' | 'wine' | 'beer' | 'liquor' | 'cover_charge') || 'total';
    const topN = searchParams.get('topN') ? parseInt(searchParams.get('topN')!) : undefined;

    const limit = topN || 50;
    const offset = topN ? 0 : (page - 1) * 50;
    
    const [customers, totalCount] = await Promise.all([
      getCustomers({
        search,
        county,
        city,
        metroplex,
        minRevenue,
        monthsBack,
        sortBy,
        sortOrder,
        sortByRevenue,
        topN,
        limit,
        offset,
      }),
      getCustomerCount({
        search,
        county,
        city,
        metroplex,
        minRevenue,
        monthsBack,
      }),
    ]);
    
    return NextResponse.json({
      customers,
      totalCount,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[API] Error fetching customers:', error);
    console.error('[API] Error stack:', error.stack);
    return NextResponse.json(
      { 
        error: 'Failed to fetch customers',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
