/**
 * Admin AI Enrichment API Route
 * Sends locations to Claude API for AI-powered classification suggestions.
 *
 * POST /api/admin/enrichments/ai - Get AI enrichment suggestions
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { enrichLocationsWithAI, type LocationForEnrichment } from '@/lib/ai/enrich';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  if (userRecord.role !== 'admin' && userRecord.role !== 'manager') {
    return { user: null, error: 'Forbidden: admin or manager role required', status: 403 };
  }

  return { user, error: null, status: 200 };
}

// ---------------------------------------------------------------------------
// POST handler - AI enrichment suggestions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const body = await request.json();
    const locations: LocationForEnrichment[] = body.locations;

    if (!Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ error: 'No locations provided' }, { status: 400 });
    }

    if (locations.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 locations per AI enrichment request' }, { status: 400 });
    }

    // Validate required fields
    for (const loc of locations) {
      if (!loc.tabc_permit_number || !loc.location_name) {
        return NextResponse.json(
          { error: `Missing required fields for permit ${loc.tabc_permit_number || 'unknown'}` },
          { status: 400 }
        );
      }
    }

    // Call Claude API
    const results = await enrichLocationsWithAI(locations);

    // Save AI suggestions to Supabase (without committing as final enrichment)
    const serviceClient = createServiceClient();
    let savedCount = 0;

    for (const result of results) {
      try {
        const { error: upsertError } = await serviceClient
          .from('location_enrichments_pg')
          .upsert({
            tabc_permit_number: result.tabc_permit_number,
            ai_suggested_dba_name: result.suggested_dba_name,
            ai_suggested_ownership: result.suggested_ownership_group,
            ai_suggested_segment: result.suggested_industry_segment,
            ai_confidence: result.confidence,
            ai_enriched_at: new Date().toISOString(),
            source: 'ai',
            synced_to_duckdb: false,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'tabc_permit_number',
            // Don't overwrite manually committed fields
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`[AI Enrichment API] Supabase upsert error for ${result.tabc_permit_number}:`, upsertError.message);
        } else {
          savedCount++;
        }
      } catch (err: any) {
        console.error(`[AI Enrichment API] Save error for ${result.tabc_permit_number}:`, err?.message);
      }
    }

    return NextResponse.json({
      results,
      savedToDb: savedCount,
      message: `AI enriched ${results.length} location(s), saved ${savedCount} to database`,
    });
  } catch (error: any) {
    console.error('[AI Enrichment API] POST error:', error?.message ?? error);

    // Provide user-friendly error for API key issues
    if (error?.message?.includes('ANTHROPIC_API_KEY')) {
      return NextResponse.json(
        { error: 'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in environment variables.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'AI enrichment failed' },
      { status: 500 }
    );
  }
}
