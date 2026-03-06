/**
 * Customers API Route
 * Returns customer list with filtering and pagination
 */

import { NextResponse } from 'next/server';
import { getCustomers, getCustomerCount } from '@/lib/data/beverage-receipts';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { computeComposite, scoreToTier, type ScoringMode } from '@/lib/data/priorities';

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const search = searchParams.get('search') || undefined;
    const county = searchParams.get('county') || undefined;
    const city = searchParams.get('city') || undefined;
    const metroplex = searchParams.get('metroplex') || undefined;
    const sortBy = (searchParams.get('sortBy') as 'revenue' | 'name' | 'last_receipt' | 'priority') || 'revenue';
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc';
    const minRevenue = searchParams.get('minRevenue') ? parseFloat(searchParams.get('minRevenue')!) : undefined;
    const monthsBack = searchParams.get('monthsBack') ? parseInt(searchParams.get('monthsBack')!) : 12;
    const sortByRevenue = (searchParams.get('sortByRevenue') as 'total' | 'wine' | 'beer' | 'liquor' | 'cover_charge') || 'total';
    const topN = searchParams.get('topN') ? parseInt(searchParams.get('topN')!) : undefined;
    const priorityMode = (searchParams.get('priorityMode') as ScoringMode) || 'balanced';
    const staleDays = searchParams.get('staleDays') ? parseInt(searchParams.get('staleDays')!) : 30;

    const limit = topN || 50;
    const offset = topN ? 0 : (page - 1) * 50;

    // When sorting by priority, we need to fetch priority data and merge
    if (sortBy === 'priority') {
      // Get all customers matching filters (without pagination) from DuckDB
      const [allCustomers, totalCount] = await Promise.all([
        getCustomers({
          search, county, city, metroplex, minRevenue, monthsBack,
          sortBy: 'revenue', sortOrder: 'desc', sortByRevenue, topN,
          limit: topN || 10000, // Get all matching for priority sort
          offset: 0,
        }),
        getCustomerCount({ search, county, city, metroplex, minRevenue, monthsBack }),
      ]);

      // Fetch priority scores from Supabase
      const serviceClient = createServiceClient();
      const permits = allCustomers.map(c => c.tabc_permit_number);

      // Fetch in batches of 500 to avoid URL length limits
      const priorityMap = new Map<string, {
        revenue_score: number;
        growth_score: number;
        recency_score: number;
        growth_rate: number;
        last_activity_date: string | null;
        activity_count: number;
      }>();

      for (let i = 0; i < permits.length; i += 500) {
        const batch = permits.slice(i, i + 500);
        const { data: priorities } = await serviceClient
          .from('customer_priorities')
          .select('tabc_permit_number, revenue_score, growth_score, recency_score, growth_rate, last_activity_date, activity_count')
          .in('tabc_permit_number', batch);

        if (priorities) {
          for (const p of priorities) {
            priorityMap.set(p.tabc_permit_number, {
              revenue_score: Number(p.revenue_score) || 0,
              growth_score: Number(p.growth_score) || 0,
              recency_score: Number(p.recency_score) || 0,
              growth_rate: Number(p.growth_rate) || 0,
              last_activity_date: p.last_activity_date || null,
              activity_count: Number(p.activity_count) || 0,
            });
          }
        }
      }

      // Merge and sort by composite score
      const merged = allCustomers.map(c => {
        const p = priorityMap.get(c.tabc_permit_number);
        const revenueScore = p?.revenue_score || 0;
        const growthScore = p?.growth_score || 0;
        const recencyScore = p?.recency_score || 0;
        const composite = computeComposite(revenueScore, growthScore, recencyScore, priorityMode);

        const lastActivity = p?.last_activity_date ? new Date(p.last_activity_date) : null;
        const daysSinceActivity = lastActivity
          ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
          : Infinity;

        return {
          ...c,
          priority_score: Math.round(composite * 100) / 100,
          revenue_score: revenueScore,
          growth_score: growthScore,
          recency_score: recencyScore,
          tier: scoreToTier(composite),
          growth_rate: p?.growth_rate || 0,
          last_activity_date: p?.last_activity_date || null,
          activity_count: p?.activity_count || 0,
          is_stale: daysSinceActivity > staleDays,
        };
      });

      // Sort by priority score
      merged.sort((a, b) => sortOrder === 'desc'
        ? b.priority_score - a.priority_score
        : a.priority_score - b.priority_score
      );

      // Paginate
      const paginated = merged.slice(offset, offset + limit);

      return NextResponse.json({
        customers: paginated,
        totalCount: topN ? Math.min(topN, merged.length) : totalCount,
        page,
        limit,
        priorityMode,
        staleDays,
      });
    }

    // Standard non-priority sort
    const [customers, totalCount] = await Promise.all([
      getCustomers({
        search,
        county,
        city,
        metroplex,
        minRevenue,
        monthsBack,
        sortBy: sortBy as 'revenue' | 'name' | 'last_receipt',
        sortOrder,
        sortByRevenue,
        topN,
        limit,
        offset,
      }),
      getCustomerCount({
        search,
        county,
        city,
        metroplex,
        minRevenue,
        monthsBack,
      }),
    ]);

    return NextResponse.json({
      customers,
      totalCount,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[API] Error fetching customers:', error);
    console.error('[API] Error stack:', error.stack);
    return NextResponse.json(
      {
        error: 'Failed to fetch customers',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
