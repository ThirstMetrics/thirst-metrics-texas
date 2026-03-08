/**
 * Territories List API Route
 * GET:  All territories (manager/admin only)
 * POST: Create territory (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { getAllTerritories, createTerritory } from '@/lib/data/territories';

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

export async function GET(request: NextRequest) {
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

    const territories = await getAllTerritories();
    return NextResponse.json({ territories });
  } catch (error) {
    console.error('[Territories API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch territories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, county_codes, zip_codes } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Normalize arrays — accept comma-separated strings or arrays
    const normalizeArray = (val: unknown): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
      if (typeof val === 'string') return val.split(',').map((v) => v.trim()).filter(Boolean);
      return [];
    };

    const territory = await createTerritory({
      name: name.trim(),
      county_codes: normalizeArray(county_codes),
      zip_codes: normalizeArray(zip_codes),
    });

    return NextResponse.json({ territory }, { status: 201 });
  } catch (error) {
    console.error('[Territories API] POST error:', error);
    return NextResponse.json({ error: 'Failed to create territory' }, { status: 500 });
  }
}
