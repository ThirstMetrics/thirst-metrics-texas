/**
 * Metroplexes API Route
 * Returns list of metroplexes
 */

import { NextResponse } from 'next/server';
import { getMetroplexList } from '@/lib/data/beverage-receipts';

export async function GET() {
  try {
    const metroplexes = await getMetroplexList();
    return NextResponse.json({ metroplexes });
  } catch (error: any) {
    console.error('[API] Error fetching metroplexes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metroplexes', message: error.message },
      { status: 500 }
    );
  }
}
