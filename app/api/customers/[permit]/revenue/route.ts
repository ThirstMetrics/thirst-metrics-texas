/**
 * Customer Revenue API Route
 * Fetches monthly revenue data for a specific customer with configurable time period
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCustomerMonthlyRevenue } from '@/lib/data/beverage-receipts';

export async function GET(
  request: NextRequest,
  { params }: { params: { permit: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const months = parseInt(searchParams.get('months') || '12', 10);
    const permitNumber = decodeURIComponent(params.permit);

    const data = await getCustomerMonthlyRevenue(permitNumber, months);

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Revenue API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch revenue data' },
      { status: 500 }
    );
  }
}
