/**
 * Dashboard API Route
 * Returns aggregated stats for the dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get customer count from DuckDB
    let totalCustomers = 0;
    let topCustomer = null;

    try {
      const customerCountResult = await query<{ total: number }>(
        'SELECT COUNT(DISTINCT tabc_permit_number) as total FROM mixed_beverage_receipts'
      );
      totalCustomers = customerCountResult[0]?.total || 0;

      // Get top revenue customer
      const topCustomerResult = await query<{
        tabc_permit_number: string;
        location_name: string;
        total_revenue: number;
      }>(`
        SELECT
          tabc_permit_number,
          location_name,
          SUM(total_receipts) as total_revenue
        FROM mixed_beverage_receipts
        GROUP BY tabc_permit_number, location_name
        ORDER BY total_revenue DESC
        LIMIT 1
      `);

      if (topCustomerResult.length > 0) {
        topCustomer = {
          permit: topCustomerResult[0].tabc_permit_number,
          name: topCustomerResult[0].location_name,
          revenue: topCustomerResult[0].total_revenue
        };
      }
    } catch (duckdbError) {
      console.error('[Dashboard API] DuckDB error:', duckdbError);
      // Continue without DuckDB data
    }

    // Get recent activities for this user (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentActivities, error: activitiesError } = await supabase
      .from('sales_activities')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (activitiesError) {
      console.error('[Dashboard API] Activities error:', activitiesError);
    }

    // Get upcoming follow-ups (next 7 days)
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];

    const { data: upcomingFollowups, error: followupsError } = await supabase
      .from('sales_activities')
      .select('*')
      .eq('user_id', user.id)
      .gte('next_followup_date', today)
      .lte('next_followup_date', nextWeekStr)
      .order('next_followup_date', { ascending: true })
      .limit(10);

    if (followupsError) {
      console.error('[Dashboard API] Followups error:', followupsError);
    }

    // Count activities in last 7 days
    const { count: recentActivityCount } = await supabase
      .from('sales_activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString());

    return NextResponse.json({
      stats: {
        totalCustomers,
        recentActivityCount: recentActivityCount || 0,
        upcomingFollowupsCount: upcomingFollowups?.length || 0,
        topCustomer
      },
      recentActivities: recentActivities || [],
      upcomingFollowups: upcomingFollowups || []
    });

  } catch (error) {
    console.error('[Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
