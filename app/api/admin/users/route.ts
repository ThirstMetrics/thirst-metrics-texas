/**
 * Admin Users API Route
 * Handles user management operations for admin users.
 *
 * GET   /api/admin/users  - List all users with email, role, and activity stats
 * PATCH /api/admin/users  - Update a user's role
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify that the requesting user has the admin role.
 * Returns the user record if admin, or null otherwise.
 */
async function verifyAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { user: null, error: 'Unauthorized', status: 401 };
  }

  const serviceClient = createServiceClient();
  const { data: userRecord, error: roleError } = await serviceClient
    .from('users')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (roleError || !userRecord) {
    return { user: null, error: 'User record not found', status: 403 };
  }

  if (userRecord.role !== 'admin') {
    return { user: null, error: 'Forbidden: admin role required', status: 403 };
  }

  return { user, error: null, status: 200 };
}

// ---------------------------------------------------------------------------
// GET handler - List all users with activity stats
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const serviceClient = createServiceClient();

    // Fetch all users from the users table
    const { data: users, error: usersError } = await serviceClient
      .from('users')
      .select('id, role, created_at')
      .order('created_at', { ascending: true });

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    // Fetch all auth users to get emails
    const { data: authData, error: authListError } = await serviceClient.auth.admin.listUsers();
    if (authListError) {
      throw new Error(`Failed to fetch auth users: ${authListError.message}`);
    }

    // Build a map of user id -> email
    const emailMap = new Map<string, string>();
    for (const authUser of authData.users) {
      emailMap.set(authUser.id, authUser.email || '');
    }

    // Fetch activity counts per user: total, last 7 days, last 30 days, and last activity date
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    // Fetch all activities grouped by user for total count and last activity date
    const { data: activityTotals, error: totalError } = await serviceClient
      .from('sales_activities')
      .select('user_id, activity_date');

    if (totalError) {
      throw new Error(`Failed to fetch activity totals: ${totalError.message}`);
    }

    // Compute activity stats per user
    const activityStats = new Map<string, {
      activityCount: number;
      activityCount7d: number;
      activityCount30d: number;
      lastActivityDate: string | null;
    }>();

    for (const activity of (activityTotals || [])) {
      const userId = activity.user_id;
      const activityDate = activity.activity_date;

      if (!activityStats.has(userId)) {
        activityStats.set(userId, {
          activityCount: 0,
          activityCount7d: 0,
          activityCount30d: 0,
          lastActivityDate: null,
        });
      }

      const stats = activityStats.get(userId)!;
      stats.activityCount += 1;

      if (activityDate >= sevenDaysAgoStr) {
        stats.activityCount7d += 1;
      }
      if (activityDate >= thirtyDaysAgoStr) {
        stats.activityCount30d += 1;
      }

      if (!stats.lastActivityDate || activityDate > stats.lastActivityDate) {
        stats.lastActivityDate = activityDate;
      }
    }

    // Assemble response
    const result = (users || []).map((u) => {
      const stats = activityStats.get(u.id) || {
        activityCount: 0,
        activityCount7d: 0,
        activityCount30d: 0,
        lastActivityDate: null,
      };

      return {
        id: u.id,
        email: emailMap.get(u.id) || '',
        role: u.role,
        created_at: u.created_at,
        activityCount: stats.activityCount,
        activityCount7d: stats.activityCount7d,
        activityCount30d: stats.activityCount30d,
        lastActivityDate: stats.lastActivityDate,
      };
    });

    return NextResponse.json({ users: result });
  } catch (error: any) {
    console.error('[Admin Users API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH handler - Update a user's role
// ---------------------------------------------------------------------------

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const body = await request.json();
    const { userId, role } = body;

    // Validate input
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid userId' },
        { status: 400 }
      );
    }

    const validRoles = ['salesperson', 'manager', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Prevent admin from changing their own role (safety measure)
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // Verify the target user exists
    const { data: targetUser, error: targetError } = await serviceClient
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update the role
    const { data: updatedUser, error: updateError } = await serviceClient
      .from('users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, role, created_at, updated_at')
      .single();

    if (updateError) {
      throw new Error(`Failed to update user role: ${updateError.message}`);
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    console.error('[Admin Users API] PATCH error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}
