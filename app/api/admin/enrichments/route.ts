/**
 * Admin Enrichments API Route
 * Manages location enrichment data (clean DBA names, ownership groups, industry segments).
 *
 * GET  /api/admin/enrichments - List locations with enrichment status
 * PUT  /api/admin/enrichments - Commit enrichment edits (save to Supabase + auto-geocode)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { query } from '@/lib/duckdb/connection';
import { geocodeAddress } from '@/lib/mapbox/geocode';

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
// Types
// ---------------------------------------------------------------------------

interface DuckDBLocation {
  tabc_permit_number: string;
  location_name: string;
  location_address: string;
  location_city: string;
  location_county: string;
  location_zip: string;
  total_revenue: number;
  last_receipt_date: string;
  receipt_count: number;
}

interface SupabaseEnrichment {
  tabc_permit_number: string;
  clean_dba_name: string | null;
  ownership_group: string | null;
  industry_segment: string | null;
  clean_up_notes: string | null;
  ai_suggested_dba_name: string | null;
  ai_suggested_ownership: string | null;
  ai_suggested_segment: string | null;
  ai_confidence: number | null;
  ai_enriched_at: string | null;
  source: string | null;
  synced_to_duckdb: boolean;
  geocoded: boolean;
}

// ---------------------------------------------------------------------------
// GET handler - List locations with enrichment status
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '50')));
    const search = searchParams.get('search')?.trim() || '';
    const statusFilter = searchParams.get('status') || 'unenriched'; // unenriched | enriched | all

    // -----------------------------------------------------------------------
    // 1. Query DuckDB for all distinct locations with aggregated revenue
    // -----------------------------------------------------------------------

    // Only include locations with an active permit (responsibility_end_date IS NULL
    // on their most recent record). Closed businesses are still valuable for market
    // analytics but don't need enrichment since nobody is making sales calls there.
    let duckdbSql = `
      SELECT
        m.tabc_permit_number,
        MAX(m.location_name) AS location_name,
        MAX(m.location_address) AS location_address,
        MAX(m.location_city) AS location_city,
        MAX(m.location_county) AS location_county,
        MAX(m.location_zip) AS location_zip,
        CAST(COALESCE(SUM(m.total_receipts), 0) AS DOUBLE) AS total_revenue,
        CAST(MAX(m.obligation_end_date) AS VARCHAR) AS last_receipt_date,
        CAST(COUNT(*) AS DOUBLE) AS receipt_count
      FROM mixed_beverage_receipts m
      WHERE m.tabc_permit_number IN (
        SELECT r.tabc_permit_number
        FROM mixed_beverage_receipts r
        WHERE r.obligation_end_date = (
          SELECT MAX(r2.obligation_end_date)
          FROM mixed_beverage_receipts r2
          WHERE r2.tabc_permit_number = r.tabc_permit_number
        )
        AND r.responsibility_end_date IS NULL
      )
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      conditions.push(`(
        m.tabc_permit_number ILIKE $${params.length + 1}
        OR m.location_name ILIKE $${params.length + 1}
        OR m.location_address ILIKE $${params.length + 1}
      )`);
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      duckdbSql += ` AND ${conditions.join(' AND ')}`;
    }

    duckdbSql += ` GROUP BY m.tabc_permit_number ORDER BY total_revenue DESC`;

    const allLocations = await query<DuckDBLocation>(duckdbSql, params);

    // -----------------------------------------------------------------------
    // 2. Query Supabase for all enrichment records
    // -----------------------------------------------------------------------

    const serviceClient = createServiceClient();
    const { data: enrichments, error: enrichError } = await serviceClient
      .from('location_enrichments_pg')
      .select('*');

    if (enrichError) {
      console.error('[Enrichments API] Supabase query error:', enrichError.message);
    }

    // Build lookup map
    const enrichmentMap = new Map<string, SupabaseEnrichment>();
    if (enrichments) {
      for (const e of enrichments) {
        enrichmentMap.set(e.tabc_permit_number, e);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Also check DuckDB location_enrichments for legacy data
    // -----------------------------------------------------------------------

    let duckdbEnrichments: { tabc_permit_number: string; clean_dba_name: string | null; ownership_group: string | null; industry_segment: string | null }[] = [];
    try {
      duckdbEnrichments = await query<{ tabc_permit_number: string; clean_dba_name: string | null; ownership_group: string | null; industry_segment: string | null }>(
        `SELECT tabc_permit_number, clean_dba_name, ownership_group, industry_segment FROM location_enrichments`
      );
    } catch {
      // Table may not exist yet
    }

    const duckdbEnrichmentSet = new Set(duckdbEnrichments.map(e => e.tabc_permit_number));

    // -----------------------------------------------------------------------
    // 4. Merge and filter
    // -----------------------------------------------------------------------

    const merged = allLocations.map(loc => {
      const enrichment = enrichmentMap.get(loc.tabc_permit_number) || null;
      const hasEnrichment = enrichment !== null || duckdbEnrichmentSet.has(loc.tabc_permit_number);
      return {
        ...loc,
        enrichment,
        is_enriched: hasEnrichment,
      };
    });

    // Filter by status
    let filtered = merged;
    if (statusFilter === 'unenriched') {
      filtered = merged.filter(loc => !loc.is_enriched);
    } else if (statusFilter === 'enriched') {
      filtered = merged.filter(loc => loc.is_enriched);
    }

    // Stats
    const stats = {
      totalLocations: allLocations.length,
      enrichedCount: merged.filter(loc => loc.is_enriched).length,
      unenrichedCount: merged.filter(loc => !loc.is_enriched).length,
      pendingSyncCount: enrichments?.filter(e => !e.synced_to_duckdb).length || 0,
    };

    // Paginate
    const totalCount = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      locations: paginated,
      totalCount,
      page,
      limit,
      stats,
    });
  } catch (error: any) {
    console.error('[Enrichments API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch enrichment data' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PUT handler - Commit enrichments (save to Supabase + auto-geocode)
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const body = await request.json();
    const enrichments: {
      tabc_permit_number: string;
      clean_dba_name: string | null;
      ownership_group: string | null;
      industry_segment: string | null;
      clean_up_notes: string | null;
      source: 'manual' | 'ai';
    }[] = body.enrichments;

    if (!Array.isArray(enrichments) || enrichments.length === 0) {
      return NextResponse.json({ error: 'No enrichments provided' }, { status: 400 });
    }

    if (enrichments.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 enrichments per batch' }, { status: 400 });
    }

    const serviceClient = createServiceClient();
    let savedCount = 0;
    let geocodedCount = 0;
    const errors: string[] = [];

    for (const enrichment of enrichments) {
      try {
        // Upsert into Supabase
        const { error: upsertError } = await serviceClient
          .from('location_enrichments_pg')
          .upsert({
            tabc_permit_number: enrichment.tabc_permit_number,
            clean_dba_name: enrichment.clean_dba_name,
            ownership_group: enrichment.ownership_group,
            industry_segment: enrichment.industry_segment,
            clean_up_notes: enrichment.clean_up_notes,
            source: enrichment.source,
            enriched_by: user.id,
            synced_to_duckdb: false,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'tabc_permit_number',
          });

        if (upsertError) {
          errors.push(`${enrichment.tabc_permit_number}: ${upsertError.message}`);
          continue;
        }

        savedCount++;

        // Auto-geocode: get the address from DuckDB
        try {
          const locData = await query<{ location_address: string; location_city: string; location_zip: string }>(
            `SELECT MAX(location_address) AS location_address, MAX(location_city) AS location_city, MAX(location_zip) AS location_zip
             FROM mixed_beverage_receipts WHERE tabc_permit_number = $1`,
            [enrichment.tabc_permit_number]
          );

          if (locData.length > 0 && locData[0].location_address) {
            const address = `${locData[0].location_address}, ${locData[0].location_city}, TX ${locData[0].location_zip}`;
            const geocodeResult = await geocodeAddress(address);

            if (geocodeResult) {
              geocodedCount++;
              // Update geocoded status
              await serviceClient
                .from('location_enrichments_pg')
                .update({ geocoded: true })
                .eq('tabc_permit_number', enrichment.tabc_permit_number);
            }
          }
        } catch (geoError: any) {
          // Geocoding failure is non-fatal
          console.warn(`[Enrichments API] Geocode failed for ${enrichment.tabc_permit_number}:`, geoError?.message);
        }
      } catch (err: any) {
        errors.push(`${enrichment.tabc_permit_number}: ${err?.message || 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      saved: savedCount,
      geocoded: geocodedCount,
      errors,
      message: `Saved ${savedCount} enrichment(s), geocoded ${geocodedCount}${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`,
    });
  } catch (error: any) {
    console.error('[Enrichments API] PUT error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to save enrichments' },
      { status: 500 }
    );
  }
}
