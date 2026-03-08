/**
 * Single Territory API Route
 * GET:    Territory detail (manager/admin)
 * PATCH:  Update territory (admin only)
 * DELETE: Delete territory, unlink users first (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import {
  getTerritoryById,
  updateTerritory,
  deleteTerritory,
  assignUserToTerritory,
} from '@/lib/data/territories';

export const dynamic = 'force-dynamic';

async function getUserRole(userId: string): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();
  return data?.role || 'salesperson';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ territoryId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(user.id);
    if (!['manager', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { territoryId } = await params;
    const territory = await getTerritoryById(territoryId);

    if (!territory) {
      return NextResponse.json({ error: 'Territory not found' }, { status: 404 });
    }

    return NextResponse.json({ territory });
  } catch (error) {
    console.error('[Territories API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch territory' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ territoryId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const { territoryId } = await params;

    const existing = await getTerritoryById(territoryId);
    if (!existing) {
      return NextResponse.json({ error: 'Territory not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Normalize arrays — accept comma-separated strings or arrays
    const normalizeArray = (val: unknown): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
      if (typeof val === 'string') return val.split(',').map((v) => v.trim()).filter(Boolean);
      return [];
    };

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }

    if (body.county_codes !== undefined) {
      updates.county_codes = normalizeArray(body.county_codes);
    }

    if (body.zip_codes !== undefined) {
      updates.zip_codes = normalizeArray(body.zip_codes);
    }

    // Handle user assignment via PATCH
    if (body.assigned_user_id !== undefined) {
      const newUserId: string | null = body.assigned_user_id || null;

      // If there was a previous assigned user, unset their territory_id
      if (existing.assigned_user_id && existing.assigned_user_id !== newUserId) {
        await assignUserToTerritory(existing.assigned_user_id, null);
      }

      if (newUserId) {
        await assignUserToTerritory(newUserId, territoryId);
      } else {
        updates.assigned_user_id = null;
      }

      // Skip duplicate territory update if assignUserToTerritory handled it
      if (!newUserId) {
        // Already cleared
      }
    }

    if (Object.keys(updates).length === 0 && body.assigned_user_id === undefined) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    let territory = existing;
    if (Object.keys(updates).length > 0) {
      territory = await updateTerritory(territoryId, updates as Parameters<typeof updateTerritory>[1]);
    }

    // Reload to get fresh state
    const fresh = await getTerritoryById(territoryId);
    return NextResponse.json({ territory: fresh });
  } catch (error) {
    console.error('[Territories API] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update territory' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ territoryId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(user.id);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const { territoryId } = await params;

    const existing = await getTerritoryById(territoryId);
    if (!existing) {
      return NextResponse.json({ error: 'Territory not found' }, { status: 404 });
    }

    await deleteTerritory(territoryId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Territories API] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete territory' }, { status: 500 });
  }
}
