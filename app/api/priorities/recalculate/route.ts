/**
 * Priority Recalculate API Route
 * Admin-only endpoint that triggers priority score recalculation
 *
 * POST /api/priorities/recalculate
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';
import { computeComposite } from '@/lib/data/priorities';

export const dynamic = 'force-dynamic';

/**
 * Recency score based on days since last activity
 */
function computeRecencyScore(daysSinceActivity: number | null): number {
  if (daysSinceActivity === null) return 10;
  if (daysSinceActivity <= 7) return 100;
  if (daysSinceActivity <= 14) return 90;
  if (daysSinceActivity <= 30) return 75;
  if (daysSinceActivity <= 60) return 50;
  if (daysSinceActivity <= 90) return 25;
  return 0;
}

/**
 * Compute percentile ranks for an array of values
 */
function computePercentileRanks(values: number[]): number[] {
  if (values.length === 0) return [];
  const indexed = values.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  for (let i = 0; i < indexed.length; i++) {
    ranks[indexed[i].index] = (i / (indexed.length - 1 || 1)) * 100;
  }
  return ranks;
}

export async function POST(request: Request) {
  try {
    // Auth + admin check
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data: userRecord, error: roleError } = await serviceClient
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (roleError || !userRecord) {
      return NextResponse.json({ error: 'User record not found' }, { status: 403 });
    }

    if (userRecord.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin role required' }, { status: 403 });
    }

    const startTime = Date.now();

    // Step 1: Pull revenue data from DuckDB
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const sixMoStr = sixMonthsAgo.toISOString().split('T')[0];
    const twelveMoStr = twelveMonthsAgo.toISOString().split('T')[0];

    const revenueRows = await query<{
      tabc_permit_number: string;
      total_revenue: number;
      recent_revenue: number;
      prior_revenue: number;
      last_receipt_date: string | null;
    }>(`
      SELECT
        tabc_permit_number,
        CAST(COALESCE(SUM(total_receipts), 0) AS DOUBLE) as total_revenue,
        CAST(COALESCE(SUM(CASE WHEN obligation_end_date >= ? THEN total_receipts ELSE 0 END), 0) AS DOUBLE) as recent_revenue,
        CAST(COALESCE(SUM(CASE WHEN obligation_end_date >= ? AND obligation_end_date < ? THEN total_receipts ELSE 0 END), 0) AS DOUBLE) as prior_revenue,
        CAST(MAX(obligation_end_date) AS VARCHAR) as last_receipt_date
      FROM mixed_beverage_receipts
      GROUP BY tabc_permit_number
    `, [sixMoStr, twelveMoStr, sixMoStr]);

    // Compute growth rates
    const revenueData = revenueRows.map(r => {
      let growthRate = 0;
      const totalRevenue = Number(r.total_revenue) || 0;
      const recentRevenue = Number(r.recent_revenue) || 0;
      const priorRevenue = Number(r.prior_revenue) || 0;

      if (priorRevenue > 0) {
        growthRate = (recentRevenue - priorRevenue) / priorRevenue;
        growthRate = Math.max(-2, Math.min(2, growthRate));
      } else if (recentRevenue > 0) {
        growthRate = 2;
      }

      return {
        tabc_permit_number: r.tabc_permit_number,
        total_revenue: totalRevenue,
        recent_revenue: recentRevenue,
        growth_rate: growthRate,
      };
    });

    // Revenue rank
    revenueData.sort((a, b) => b.total_revenue - a.total_revenue);
    const revenueMap = new Map(revenueData.map((r, i) => [r.tabc_permit_number, { ...r, revenue_rank: i + 1 }]));

    // Step 2: Pull activity data from Supabase
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysStr = ninetyDaysAgo.toISOString().split('T')[0];

    const { data: activities } = await serviceClient
      .from('sales_activities')
      .select('tabc_permit_number, activity_date')
      .order('activity_date', { ascending: false });

    const activityMap = new Map<string, { last_activity_date: string | null; activity_count: number }>();
    if (activities) {
      for (const act of activities) {
        const permit = act.tabc_permit_number;
        const existing = activityMap.get(permit);
        if (!existing) {
          activityMap.set(permit, {
            last_activity_date: act.activity_date,
            activity_count: act.activity_date >= ninetyDaysStr ? 1 : 0,
          });
        } else if (act.activity_date >= ninetyDaysStr) {
          existing.activity_count++;
        }
      }
    }

    // Step 3: Compute scores
    const allPermits = Array.from(revenueMap.keys());
    const totalRevenues = allPermits.map(p => revenueMap.get(p)!.total_revenue);
    const revenuePercentiles = computePercentileRanks(totalRevenues);
    const growthRates = allPermits.map(p => revenueMap.get(p)!.growth_rate);
    const growthPercentiles = computePercentileRanks(growthRates);

    const records = allPermits.map((permit, i) => {
      const rev = revenueMap.get(permit)!;
      const act = activityMap.get(permit);

      const revenueScore = Math.round(revenuePercentiles[i] * 100) / 100;
      const growthScore = Math.round(growthPercentiles[i] * 100) / 100;

      let daysSinceActivity: number | null = null;
      if (act?.last_activity_date) {
        daysSinceActivity = Math.floor((Date.now() - new Date(act.last_activity_date).getTime()) / (1000 * 60 * 60 * 24));
      }
      const recencyScore = computeRecencyScore(daysSinceActivity);
      const composite = computeComposite(revenueScore, growthScore, recencyScore, 'balanced');

      return {
        tabc_permit_number: permit,
        priority_score: Math.round(composite * 100) / 100,
        revenue_rank: rev.revenue_rank,
        growth_rate: Math.round(rev.growth_rate * 10000) / 10000,
        last_activity_date: act?.last_activity_date || null,
        revenue_score: revenueScore,
        growth_score: growthScore,
        recency_score: recencyScore,
        total_revenue: Math.round(rev.total_revenue * 100) / 100,
        recent_revenue: Math.round(rev.recent_revenue * 100) / 100,
        activity_count: act?.activity_count || 0,
        last_updated: new Date().toISOString(),
      };
    });

    // Step 4: Upsert in batches
    let totalUpserted = 0;
    let totalErrors = 0;
    const BATCH_SIZE = 1000;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await serviceClient
        .from('customer_priorities')
        .upsert(batch, { onConflict: 'tabc_permit_number' });

      if (error) {
        console.error(`[Recalculate] Batch error: ${error.message}`);
        totalErrors += batch.length;
      } else {
        totalUpserted += batch.length;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      total_scored: records.length,
      upserted: totalUpserted,
      errors: totalErrors,
      duration_seconds: parseFloat(duration),
    });
  } catch (error: any) {
    console.error('[API] Error recalculating priorities:', error);
    return NextResponse.json(
      {
        error: 'Failed to recalculate priorities',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
