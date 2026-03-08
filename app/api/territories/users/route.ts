/**
 * Territory Users API Route
 * GET: List all users available for territory assignment (manager/admin only)
 * Returns a lightweight list: id, role, email
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    const { data: userData } = await serviceClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = userData?.role || 'salesperson';
    if (!['manager', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all users
    const { data: users, error: usersError } = await serviceClient
      .from('users')
      .select('id, role')
      .order('role', { ascending: true });

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    // Get emails from auth
    const { data: authData } = await serviceClient.auth.admin.listUsers();
    const emailMap: Record<string, string> = {};
    if (authData?.users) {
      for (const u of authData.users) {
        emailMap[u.id] = u.email || '';
      }
    }

    const result = (users || []).map((u) => ({
      id: u.id,
      role: u.role,
      email: emailMap[u.id] || '',
    }));

    return NextResponse.json({ users: result });
  } catch (error) {
    console.error('[Territories Users API] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
