/**
 * Single Activity API Route
 * PATCH: Update activity fields
 * DELETE: Remove an activity (cascade deletes photos via FK)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { updateActivity, deleteActivity } from '@/lib/data/activities';

export const dynamic = 'force-dynamic';

/** Verify the activity belongs to the requesting user */
async function verifyOwnership(activityId: string, userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('sales_activities')
    .select('user_id')
    .eq('id', activityId)
    .single();

  return data?.user_id === userId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = await params;

    if (!(await verifyOwnership(activityId, user.id))) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    const body = await request.json();

    // Whitelist of updatable fields — never allow user_id, tabc_permit_number, id to change
    const ALLOWED_FIELDS = [
      'activity_date',
      'notes',
      'outcome',
      'next_followup_date',
      'contact_name',
      'contact_cell_phone',
      'contact_email',
      'contact_preferred_method',
      'decision_maker',
      'conversation_summary',
      'product_interest',
      'current_products_carried',
      'objections',
      'competitors_mentioned',
      'next_action',
      'avail_monday_am',
      'avail_monday_pm',
      'avail_tuesday_am',
      'avail_tuesday_pm',
      'avail_wednesday_am',
      'avail_wednesday_pm',
      'avail_thursday_am',
      'avail_thursday_pm',
      'avail_friday_am',
      'avail_friday_pm',
      'avail_saturday_am',
      'avail_saturday_pm',
      'avail_sunday_am',
      'avail_sunday_pm',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Always stamp updated_at
    updates.updated_at = new Date().toISOString();

    const activity = await updateActivity(activityId, updates);

    return NextResponse.json({ activity });
  } catch (error) {
    console.error('[Activities API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update activity' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activityId } = await params;

    if (!(await verifyOwnership(activityId, user.id))) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    }

    await deleteActivity(activityId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Activities API] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete activity' }, { status: 500 });
  }
}
