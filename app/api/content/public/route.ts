/**
 * Public Content API Route
 * Read-only endpoint for published articles, accessible from whiskeyrivertx.com.
 * No auth required. CORS restricted to https://whiskeyrivertx.com.
 *
 * GET /api/content/public?featured=true     - Featured articles (landing page cards)
 * GET /api/content/public?slug=xxx          - Single article by slug
 * GET /api/content/public?all=true          - Full archive of published articles
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://whiskeyrivertx.com',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const featured = searchParams.get('featured');
    const slug = searchParams.get('slug');
    const all = searchParams.get('all');

    const supabase = createServiceClient();

    const BASE_SELECT = `
      id,
      title,
      slug,
      excerpt,
      article_type,
      cover_image_url,
      featured,
      published_at,
      author_name,
      metadata
    `.trim();

    // Single article by slug — include full body
    if (slug) {
      const { data, error } = await supabase
        .from('content_articles')
        .select(`${BASE_SELECT}, body`)
        .eq('slug', slug)
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .is('archived_at', null)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json(
            { error: 'Article not found' },
            { status: 404, headers: corsHeaders() }
          );
        }
        throw error;
      }

      return NextResponse.json(data, { headers: corsHeaders() });
    }

    // Featured articles — landing page cards (no body to keep payload small)
    if (featured === 'true') {
      const { data, error } = await supabase
        .from('content_articles')
        .select(BASE_SELECT)
        .eq('featured', true)
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .is('archived_at', null)
        .order('published_at', { ascending: false });

      if (error) throw error;

      return NextResponse.json(data ?? [], { headers: corsHeaders() });
    }

    // Full archive — all published articles, no body
    if (all === 'true') {
      const { data, error } = await supabase
        .from('content_articles')
        .select(BASE_SELECT)
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .is('archived_at', null)
        .order('published_at', { ascending: false });

      if (error) throw error;

      return NextResponse.json(data ?? [], { headers: corsHeaders() });
    }

    // No recognised param — return most recent 6 published articles
    const { data, error } = await supabase
      .from('content_articles')
      .select(BASE_SELECT)
      .not('published_at', 'is', null)
      .lte('published_at', new Date().toISOString())
      .is('archived_at', null)
      .order('published_at', { ascending: false })
      .limit(6);

    if (error) throw error;

    return NextResponse.json(data ?? [], { headers: corsHeaders() });
  } catch (error: any) {
    console.error('[Content Public API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch articles' },
      { status: 500, headers: corsHeaders() }
    );
  }
}
