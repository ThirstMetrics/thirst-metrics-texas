/**
 * Admin Content Article API Route
 * Update or delete a specific article by ID.
 * Admin role required.
 *
 * PATCH  /api/admin/content/[articleId]  - Update article fields
 * DELETE /api/admin/content/[articleId]  - Delete article
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

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

  if (userRecord.role !== 'admin') {
    return { user: null, error: 'Forbidden: admin role required', status: 403 };
  }

  return { user, error: null, status: 200 };
}

/**
 * If the article being updated sets featured=true, clear the featured flag on
 * any OTHER article of the same article_type (one featured per type).
 */
async function rotateFeatured(
  supabase: ReturnType<typeof createServiceClient>,
  articleType: string,
  excludeId: string
) {
  const { error } = await supabase
    .from('content_articles')
    .update({ featured: false, updated_at: new Date().toISOString() })
    .eq('article_type', articleType)
    .eq('featured', true)
    .neq('id', excludeId);

  if (error) {
    console.error('[Admin Content Article API] rotateFeatured error:', error.message);
  }
}

// ---------------------------------------------------------------------------
// PATCH handler - Update article
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const { articleId } = await params;
    if (!articleId) {
      return NextResponse.json({ error: 'articleId is required' }, { status: 400 });
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
      archived_at,
      author_name,
      metadata,
    } = body;

    const VALID_TYPES = ['market_review', 'top_new_accounts', 'venue_of_the_month'];
    if (article_type !== undefined && !VALID_TYPES.includes(article_type)) {
      return NextResponse.json(
        { error: `article_type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // Verify article exists
    const { data: existing, error: fetchError } = await serviceClient
      .from('content_articles')
      .select('id, article_type, featured')
      .eq('id', articleId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // If setting featured=true, rotate out any other featured article of the same type.
    // Use the incoming article_type if provided, otherwise fall back to the existing one.
    if (featured === true) {
      const effectiveType = article_type ?? existing.article_type;
      await rotateFeatured(serviceClient, effectiveType, articleId);
    }

    // Build the update payload — only include fields that were provided
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (title !== undefined) updates.title = title.trim();
    if (articleBody !== undefined) updates.body = articleBody.trim();
    if (excerpt !== undefined) updates.excerpt = excerpt?.trim() ?? null;
    if (article_type !== undefined) updates.article_type = article_type;
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url ?? null;
    if (featured !== undefined) updates.featured = featured === true;
    if (published_at !== undefined) updates.published_at = published_at ?? null;
    if (archived_at !== undefined) updates.archived_at = archived_at ?? null;
    if (author_name !== undefined) updates.author_name = author_name?.trim() ?? 'Whiskey River TX';
    if (metadata !== undefined) updates.metadata = metadata ?? {};

    const { data, error } = await serviceClient
      .from('content_articles')
      .update(updates)
      .eq('id', articleId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Admin Content Article API] PATCH error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to update article' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE handler - Delete article
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ articleId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const { user, error: adminError, status } = await verifyAdmin(supabase);
    if (adminError || !user) {
      return NextResponse.json({ error: adminError }, { status });
    }

    const { articleId } = await params;
    if (!articleId) {
      return NextResponse.json({ error: 'articleId is required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // Verify the article exists before attempting deletion
    const { data: existing, error: fetchError } = await serviceClient
      .from('content_articles')
      .select('id')
      .eq('id', articleId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const { error } = await serviceClient
      .from('content_articles')
      .delete()
      .eq('id', articleId);

    if (error) throw error;

    return NextResponse.json({ success: true, deleted: articleId });
  } catch (error: any) {
    console.error('[Admin Content Article API] DELETE error:', error?.message ?? error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete article' },
      { status: 500 }
    );
  }
}
