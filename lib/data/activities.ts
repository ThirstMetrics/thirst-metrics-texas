/**
 * Sales Activities Data Access
 * CRUD operations for sales activities in Supabase
 */

import { createServerClient } from '../supabase/server';
import { createServiceClient } from '../supabase/server';

export interface SalesActivity {
  id?: string;
  user_id: string;
  tabc_permit_number: string;
  activity_type: 'visit' | 'call' | 'email' | 'note';
  activity_date: string;
  notes?: string | null;
  outcome?: 'positive' | 'neutral' | 'negative' | 'no_contact' | null;
  next_followup_date?: string | null;
  contact_name?: string | null;
  contact_cell_phone?: string | null;
  contact_email?: string | null;
  contact_preferred_method?: 'text' | 'call' | 'email' | 'in_person' | null;
  decision_maker?: boolean;
  avail_monday_am?: boolean;
  avail_monday_pm?: boolean;
  avail_tuesday_am?: boolean;
  avail_tuesday_pm?: boolean;
  avail_wednesday_am?: boolean;
  avail_wednesday_pm?: boolean;
  avail_thursday_am?: boolean;
  avail_thursday_pm?: boolean;
  avail_friday_am?: boolean;
  avail_friday_pm?: boolean;
  avail_saturday_am?: boolean;
  avail_saturday_pm?: boolean;
  avail_sunday_am?: boolean;
  avail_sunday_pm?: boolean;
  conversation_summary?: string | null;
  product_interest?: string[] | null;
  current_products_carried?: string | null;
  objections?: string | null;
  competitors_mentioned?: string[] | null;
  next_action?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  gps_accuracy_meters?: number | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create a new sales activity
 */
export async function createActivity(activity: Omit<SalesActivity, 'id' | 'created_at' | 'updated_at'>): Promise<SalesActivity> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('sales_activities')
    .insert([activity])
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create activity: ${error.message}`);
  }
  
  return data;
}

/**
 * Get activities for a user
 */
export async function getUserActivities(userId: string, filters?: {
  permitNumber?: string;
  activityType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<SalesActivity[]> {
  const supabase = await createServerClient();
  
  let query = supabase
    .from('sales_activities')
    .select('*')
    .eq('user_id', userId)
    .order('activity_date', { ascending: false });
  
  if (filters?.permitNumber) {
    query = query.eq('tabc_permit_number', filters.permitNumber);
  }
  
  if (filters?.activityType) {
    query = query.eq('activity_type', filters.activityType);
  }
  
  if (filters?.startDate) {
    query = query.gte('activity_date', filters.startDate);
  }
  
  if (filters?.endDate) {
    query = query.lte('activity_date', filters.endDate);
  }
  
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch activities: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Get activities for a customer (permit number)
 */
export async function getCustomerActivities(permitNumber: string): Promise<SalesActivity[]> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('sales_activities')
    .select('*')
    .eq('tabc_permit_number', permitNumber)
    .order('activity_date', { ascending: false });
  
  if (error) {
    throw new Error(`Failed to fetch customer activities: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Get a single activity by ID
 */
export async function getActivityById(activityId: string): Promise<SalesActivity | null> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('sales_activities')
    .select('*')
    .eq('id', activityId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    throw new Error(`Failed to fetch activity: ${error.message}`);
  }
  
  return data;
}

/**
 * Update an activity
 */
export async function updateActivity(activityId: string, updates: Partial<SalesActivity>): Promise<SalesActivity> {
  const supabase = await createServerClient();
  
  const { data, error } = await supabase
    .from('sales_activities')
    .update(updates)
    .eq('id', activityId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to update activity: ${error.message}`);
  }
  
  return data;
}

/**
 * Delete an activity
 */
export async function deleteActivity(activityId: string): Promise<void> {
  const supabase = await createServerClient();
  
  const { error } = await supabase
    .from('sales_activities')
    .delete()
    .eq('id', activityId);
  
  if (error) {
    throw new Error(`Failed to delete activity: ${error.message}`);
  }
}
