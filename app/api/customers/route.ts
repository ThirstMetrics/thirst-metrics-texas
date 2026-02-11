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
    
    const limit = 50;
    const offset = (page - 1) * limit;
    
    console.log('[API] Fetching customers with filters:', {
      search,
      county,
      city,
      minRevenue,
      monthsBack,
      sortBy,
      sortOrder,
      page,
      limit,
      offset,
    });
    
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
    
    console.log('[API] Found customers:', customers.length, 'Total:', totalCount);
    
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
