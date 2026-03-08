/**
 * Single Goal API Route
 * PATCH: Update goal fields
 * DELETE: Remove a goal
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { updateGoal, deleteGoal } from '@/lib/data/goals';
import type { GoalStatus } from '@/lib/data/goals';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: GoalStatus[] = ['active', 'achieved', 'missed', 'cancelled'];

/** Verify the goal belongs to the requesting user */
async function verifyOwnership(goalId: string, userId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('goals')
    .select('user_id')
    .eq('id', goalId)
    .single();

  return data?.user_id === userId;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { goalId } = await params;

    if (!(await verifyOwnership(goalId, user.id))) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.target_value !== undefined) {
      if (typeof body.target_value !== 'number' || body.target_value <= 0) {
        return NextResponse.json({ error: 'target_value must be a positive number' }, { status: 400 });
      }
      updates.target_value = body.target_value;
    }

    if (body.target_date !== undefined) {
      if (isNaN(Date.parse(body.target_date))) {
        return NextResponse.json({ error: 'target_date must be a valid date' }, { status: 400 });
      }
      updates.target_date = body.target_date;
    }

    if (body.current_value !== undefined) {
      if (typeof body.current_value !== 'number' || body.current_value < 0) {
        return NextResponse.json({ error: 'current_value must be a non-negative number' }, { status: 400 });
      }
      updates.current_value = body.current_value;
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const goal = await updateGoal(goalId, updates);

    return NextResponse.json({ goal });
  } catch (error) {
    console.error('[Goals API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { goalId } = await params;

    if (!(await verifyOwnership(goalId, user.id))) {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }

    await deleteGoal(goalId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Goals API] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
