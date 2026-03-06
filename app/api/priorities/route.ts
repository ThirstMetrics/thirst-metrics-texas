/**
 * Priorities API Route
 * Returns priority-scored customer list with mode-based weighting
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getPriorityCustomers, type ScoringMode } from '@/lib/data/priorities';

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const mode = (searchParams.get('mode') as ScoringMode) || 'balanced';
    const staleDays = searchParams.get('stale_days') ? parseInt(searchParams.get('stale_days')!) : 30;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || undefined;
    const county = searchParams.get('county') || undefined;
    const metroplex = searchParams.get('metroplex') || undefined;

    // Validate mode
    if (!['revenue', 'balanced', 'coverage'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be: revenue, balanced, or coverage' },
        { status: 400 }
      );
    }

    const result = await getPriorityCustomers({
      mode,
      stale_days: staleDays,
      page,
      limit,
      search,
      county,
      metroplex,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error fetching priorities:', error);
    console.error('[API] Error stack:', error.stack);
    return NextResponse.json(
      {
        error: 'Failed to fetch priorities',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
