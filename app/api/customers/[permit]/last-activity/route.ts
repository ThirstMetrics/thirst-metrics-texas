/**
 * Last Activity API Route
 * Fetches the most recent sales activity for a customer permit
 * Used by map popups to lazy-load activity data on pin tap
 *
 * GET /api/customers/[permit]/last-activity
 * Returns: { activity: { id, activity_type, activity_date, notes, outcome, contact_name, contact_cell_phone } | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

interface LastActivityResponse {
  activity: {
    id: string;
    activity_type: string;
    activity_date: string;
    notes: string | null;
    outcome: string | null;
    contact_name: string | null;
    contact_cell_phone: string | null;
  } | null;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { permit: string } }
): Promise<NextResponse<LastActivityResponse | ErrorResponse>> {
  try {
    // Auth check
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const permitNumber = decodeURIComponent(params.permit);

    if (!permitNumber) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Permit number is required' },
        { status: 400 }
      );
    }

    // Use service client to bypass RLS (consistent with other activity queries)
    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient
      .from('sales_activities')
      .select('id, activity_type, activity_date, notes, outcome, contact_name, contact_cell_phone')
      .eq('tabc_permit_number', permitNumber)
      .order('activity_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Last Activity API] Supabase error:', error);
      return NextResponse.json(
        { error: 'Database Error', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ activity: data });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Last Activity API] Error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal Server Error', message: errorMessage },
      { status: 500 }
    );
  }
}
