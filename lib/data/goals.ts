/**
 * Goal Data Helpers
 * CRUD operations for user goals (revenue, growth, new_accounts, visits)
 */

import { createServiceClient } from '@/lib/supabase/server';

export type GoalType = 'revenue' | 'growth' | 'new_accounts' | 'visits';
export type GoalStatus = 'active' | 'achieved' | 'missed' | 'cancelled';

export interface Goal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  target_value: number;
  target_date: string;
  current_value: number;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

/** Get goals for a user, optionally filtered by status */
export async function getGoalsByUser(
  userId: string,
  status?: GoalStatus
): Promise<Goal[]> {
  const supabase = createServiceClient();

  let q = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('target_date', { ascending: true });

  if (status) {
    q = q.eq('status', status);
  }

  const { data, error } = await q;

  if (error) {
    throw new Error(`Failed to fetch goals: ${error.message}`);
  }

  return (data || []) as Goal[];
}

/** Create a new goal */
export async function createGoal(
  goal: Pick<Goal, 'user_id' | 'goal_type' | 'target_value' | 'target_date'>
): Promise<Goal> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: goal.user_id,
      goal_type: goal.goal_type,
      target_value: goal.target_value,
      target_date: goal.target_date,
      current_value: 0,
      status: 'active',
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to create goal: ${error?.message}`);
  }

  return data as Goal;
}

/** Update goal fields */
export async function updateGoal(
  id: string,
  updates: Partial<Pick<Goal, 'target_value' | 'target_date' | 'current_value' | 'status'>>
): Promise<Goal> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('goals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update goal: ${error?.message}`);
  }

  return data as Goal;
}

/** Delete a goal */
export async function deleteGoal(id: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.from('goals').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete goal: ${error.message}`);
  }
}
