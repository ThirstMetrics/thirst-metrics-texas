/**
 * Admin Content API Route
 * CRUD for content articles (all states including drafts).
 * Admin role required.
 *
 * GET  /api/admin/content          - List all articles (including drafts)
 * POST /api/admin/content          - Create new article
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify that the requesting user has the admin role.
 * Returns the user record if admin, or an error response otherwise.
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

/**
 * Generate a URL-safe slug from a title string.
 * Appends a short timestamp suffix to avoid collisions.
 */
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);

  // Append an 8-char hex timestamp suffix for uniqueness
  const suffix = Date.now().toString(16).slice(-8);
  return `${base}-${suffix}`;
}

/**
 * If the article being created/updated sets featured=true, clear the featured
 * flag on any other article of the same article_type (one featured per type).
 */
async function rotateFeatured(
  supabase: ReturnType<typeof createServiceClient>,
  articleType: string,
  excludeId?: string
) {
  let q = supabase
    .from('content_articles')
    .update({ featured: false, updated_at: new Date().toISOString() })
    .eq('article_type', articleType)
    .eq('featured', true);

  if (excludeId) {
    q = q.neq('id', excludeId);
  }

  const { error } = await q;
  if (error) {
    console.error('[Admin Content API] rotateFeatured error:', error.message);
  }
}

// ---------------------------------------------------------------------------
// GET handler - List all articles (including drafts)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const { searchParams } = new URL(request.url);
    const articleType = searchParams.get('article_type');

    const serviceClient = createServiceClient();
    let q = serviceClient
      .from('content_articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (articleType) {
      q = q.eq('article_type', articleType);
    }

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error: any) {
    console.error('[Admin Content API] GET error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST handler - Create new article
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const body = await request.json();
    const {
      title,
      body: articleBody,
      excerpt,
      article_type,
      cover_image_url,
      featured,
      published_at,
      author_name,
      metadata,
    } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }
    if (!articleBody || typeof articleBody !== 'string' || !articleBody.trim()) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 });
    }
    const VALID_TYPES = ['market_review', 'top_new_accounts', 'venue_of_the_month'];
    if (!article_type || !VALID_TYPES.includes(article_type)) {
      return NextResponse.json(
        { error: `article_type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // If this article is being set as featured, unfeatured any existing featured
    // article of the same type first.
    if (featured === true) {
      await rotateFeatured(serviceClient, article_type);
    }

    const now = new Date().toISOString();
    const { data, error } = await serviceClient
      .from('content_articles')
      .insert({
        title: title.trim(),
        slug: slugify(title.trim()),
        body: articleBody.trim(),
        excerpt: excerpt?.trim() ?? null,
        article_type,
        cover_image_url: cover_image_url ?? null,
        featured: featured === true,
        published_at: published_at ?? null,
        author_name: author_name?.trim() ?? 'Whiskey River TX',
        metadata: metadata ?? {},
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('[Admin Content API] POST error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create article' },
      { status: 500 }
    );
  }
}
