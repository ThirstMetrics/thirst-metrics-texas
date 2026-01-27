/**
 * Counties API Route
 * Returns list of counties with customers
 */

import { NextResponse } from 'next/server';
import { getCountyList } from '@/lib/data/beverage-receipts';

export async function GET() {
  try {
    const counties = await getCountyList();
    return NextResponse.json({ counties });
  } catch (error: any) {
    console.error('[API] Error fetching counties:', error);
    return NextResponse.json(
      { error: 'Failed to fetch counties', message: error.message },
      { status: 500 }
    );
  }
}
