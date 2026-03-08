/**
 * Goals API Route
 * GET: List user's goals (optional ?status= filter)
 * POST: Create a new goal
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getGoalsByUser, createGoal } from '@/lib/data/goals';
import type { GoalType, GoalStatus, Goal } from '@/lib/data/goals';

export const dynamic = 'force-dynamic';

const VALID_GOAL_TYPES: GoalType[] = ['revenue', 'growth', 'new_accounts', 'visits'];
const VALID_STATUSES: GoalStatus[] = ['active', 'achieved', 'missed', 'cancelled'];

/** Count visits for a user between two dates */
async function countVisits(userId: string, startDate: string, endDate: string): Promise<number> {
  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();

  const { count, error } = await supabase
    .from('sales_activities')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('activity_type', 'visit')
    .gte('activity_date', startDate)
    .lte('activity_date', endDate);

  if (error) {
    console.error('[Goals API] Visit count error:', error);
    return 0;
  }

  return count || 0;
}

/** Enrich visit-type goals with auto-computed current_value */
async function enrichGoals(goals: Goal[]): Promise<Goal[]> {
  const enriched = await Promise.all(
    goals.map(async (goal) => {
      if (goal.goal_type === 'visits') {
        const visitCount = await countVisits(
          goal.user_id,
          goal.created_at.split('T')[0],
          goal.target_date
        );
        return { ...goal, current_value: visitCount };
      }
      return goal;
    })
  );
  return enriched;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status') as GoalStatus | null;

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
    }

    const goals = await getGoalsByUser(user.id, status || undefined);
    const enrichedGoals = await enrichGoals(goals);

    return NextResponse.json({ goals: enrichedGoals });
  } catch (error) {
    console.error('[Goals API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { goal_type, target_value, target_date } = body;

    // Validate required fields
    if (!goal_type || !VALID_GOAL_TYPES.includes(goal_type)) {
      return NextResponse.json(
        { error: 'Invalid goal_type. Must be: revenue, growth, new_accounts, or visits' },
        { status: 400 }
      );
    }

    if (!target_value || typeof target_value !== 'number' || target_value <= 0) {
      return NextResponse.json(
        { error: 'target_value must be a positive number' },
        { status: 400 }
      );
    }

    if (!target_date || isNaN(Date.parse(target_date))) {
      return NextResponse.json(
        { error: 'target_date must be a valid date' },
        { status: 400 }
      );
    }

    const goal = await createGoal({
      user_id: user.id,
      goal_type,
      target_value,
      target_date,
    });

    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    console.error('[Goals API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
