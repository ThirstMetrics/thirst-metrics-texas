/**
 * Metroplexes API Route
 * Returns list of metroplexes
 */

import { NextResponse } from 'next/server';
import { getMetroplexList } from '@/lib/data/beverage-receipts';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
