/**
 * Counties API Route
 * Returns list of counties with customers
 */

import { NextResponse } from 'next/server';
import { getCountyList } from '@/lib/data/beverage-receipts';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
