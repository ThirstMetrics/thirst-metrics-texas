/**
 * Territory Data Helpers
 * CRUD operations for territory management (county/zip-based sales regions)
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface Territory {
  id: string;
  name: string;
  county_codes: string[] | null;
  zip_codes: string[] | null;
  assigned_user_id: string | null;
  created_at: string;
}

export interface TerritoryWithUser extends Territory {
  assigned_user?: {
    id: string;
    role: string;
    email?: string;
  } | null;
}

/** Get all territories with assigned user info */
export async function getAllTerritories(): Promise<TerritoryWithUser[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('territories')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch territories: ${error.message}`);
  }

  const territories = (data || []) as Territory[];

  // Fetch assigned user details separately to avoid join complexity
  const userIds = territories
    .map((t) => t.assigned_user_id)
    .filter((id): id is string => !!id);

  let usersMap: Record<string, { id: string; role: string; email?: string }> = {};

  if (userIds.length > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, role')
      .in('id', userIds);

    if (usersData) {
      // Fetch emails from auth.users via service role
      const { data: authUsersData } = await supabase.auth.admin.listUsers();
      const emailMap: Record<string, string> = {};
      if (authUsersData?.users) {
        for (const u of authUsersData.users) {
          emailMap[u.id] = u.email || '';
        }
      }

      for (const u of usersData) {
        usersMap[u.id] = {
          id: u.id,
          role: u.role,
          email: emailMap[u.id],
        };
      }
    }
  }

  return territories.map((t) => ({
    ...t,
    assigned_user: t.assigned_user_id ? (usersMap[t.assigned_user_id] || null) : null,
  }));
}

/** Get a single territory by ID */
export async function getTerritoryById(id: string): Promise<TerritoryWithUser | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('territories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Failed to fetch territory: ${error.message}`);
  }

  const territory = data as Territory;

  let assigned_user = null;
  if (territory.assigned_user_id) {
    const { data: userData } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', territory.assigned_user_id)
      .single();

    if (userData) {
      const { data: authData } = await supabase.auth.admin.getUserById(territory.assigned_user_id);
      assigned_user = {
        id: userData.id,
        role: userData.role,
        email: authData?.user?.email,
      };
    }
  }

  return { ...territory, assigned_user };
}

/** Create a new territory */
export async function createTerritory(
  data: Pick<Territory, 'name' | 'county_codes' | 'zip_codes'>
): Promise<Territory> {
  const supabase = createServiceClient();

  const { data: result, error } = await supabase
    .from('territories')
    .insert({
      name: data.name,
      county_codes: data.county_codes || [],
      zip_codes: data.zip_codes || [],
      assigned_user_id: null,
    })
    .select()
    .single();

  if (error || !result) {
    throw new Error(`Failed to create territory: ${error?.message}`);
  }

  return result as Territory;
}

/** Update territory fields */
export async function updateTerritory(
  id: string,
  updates: Partial<Pick<Territory, 'name' | 'county_codes' | 'zip_codes' | 'assigned_user_id'>>
): Promise<Territory> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('territories')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update territory: ${error?.message}`);
  }

  return data as Territory;
}

/** Delete a territory — unlinks any assigned users first */
export async function deleteTerritory(id: string): Promise<void> {
  const supabase = createServiceClient();

  // Unlink any users assigned to this territory
  const { error: unlinkError } = await supabase
    .from('users')
    .update({ territory_id: null })
    .eq('territory_id', id);

  if (unlinkError) {
    throw new Error(`Failed to unlink users from territory: ${unlinkError.message}`);
  }

  const { error } = await supabase.from('territories').delete().eq('id', id);

  if (error) {
    throw new Error(`Failed to delete territory: ${error.message}`);
  }
}

/**
 * Assign a user to a territory.
 * Updates both territory.assigned_user_id and user.territory_id.
 * Pass null for territoryId to unassign.
 */
export async function assignUserToTerritory(
  userId: string,
  territoryId: string | null
): Promise<void> {
  const supabase = createServiceClient();

  // Update user's territory_id
  const { error: userError } = await supabase
    .from('users')
    .update({ territory_id: territoryId })
    .eq('id', userId);

  if (userError) {
    throw new Error(`Failed to update user territory: ${userError.message}`);
  }

  if (territoryId) {
    // Update territory's assigned_user_id
    const { error: territoryError } = await supabase
      .from('territories')
      .update({ assigned_user_id: userId })
      .eq('id', territoryId);

    if (territoryError) {
      throw new Error(`Failed to update territory assigned user: ${territoryError.message}`);
    }
  }
}
