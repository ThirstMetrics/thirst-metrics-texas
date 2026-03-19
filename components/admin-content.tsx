/**
 * Admin Content Management Component
 * Manages blog/insights articles: market reviews, top new accounts, venue of the month.
 * Features:
 *   - Article list table with status badges
 *   - Create/Edit modal form with auto-slug generation
 *   - Data suggestions panel pre-filling article form
 *   - Archive and delete actions
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================
// Types
// ============================================

type ArticleType = 'market_review' | 'top_new_accounts' | 'venue_of_the_month';
type ArticleStatus = 'draft' | 'published' | 'featured' | 'archived';

interface Article {
  id: string;
  title: string;
  slug: string;
  article_type: ArticleType;
  excerpt: string | null;
  body: string | null;
  cover_image_url: string | null;
  featured: boolean;
  published: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ArticleFormData {
  title: string;
  slug: string;
  article_type: ArticleType;
  excerpt: string;
  body: string;
  cover_image_url: string;
  featured: boolean;
  published: boolean;
}

interface GrowingCounty {
  county: string;
  growth_pct: number;
  total_revenue: number;
}

interface NewAccount {
  tabc_permit_number: string;
  name: string;
  city: string;
  county: string;
  first_month_revenue: number;
}

interface VenueSuggestion {
  tabc_permit_number: string;
  name: string;
  city: string;
  county: string;
  total_revenue: number;
  growth_pct: number;
}

interface Suggestions {
  market_review: {
    top_growing_counties: GrowingCounty[];
    period: string;
  };
  top_new_accounts: {
    accounts: NewAccount[];
    period: string;
  };
  venue_of_the_month: VenueSuggestion;
}

// ============================================
// Helpers
// ============================================

const ARTICLE_TYPE_LABELS: Record<ArticleType, string> = {
  market_review: 'Market Review',
  top_new_accounts: 'Top New Accounts',
  venue_of_the_month: 'Venue of the Month',
};

const TYPE_BADGE_COLORS: Record<ArticleType, { bg: string; color: string }> = {
  market_review: { bg: '#dbeafe', color: '#1d4ed8' },
  top_new_accounts: { bg: '#d1fae5', color: '#065f46' },
  venue_of_the_month: { bg: '#ede9fe', color: '#5b21b6' },
};

const STATUS_BADGE_COLORS: Record<ArticleStatus, { bg: string; color: string }> = {
  draft: { bg: '#f1f5f9', color: '#475569' },
  published: { bg: '#d1fae5', color: '#065f46' },
  featured: { bg: '#fef3c7', color: '#92400e' },
  archived: { bg: '#fee2e2', color: '#991b1b' },
};

function getArticleStatus(article: Article): ArticleStatus {
  if (article.archived_at) return 'archived';
  if (article.featured) return 'featured';
  if (article.published) return 'published';
  return 'draft';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const EMPTY_FORM: ArticleFormData = {
  title: '',
  slug: '',
  article_type: 'market_review',
  excerpt: '',
  body: '',
  cover_image_url: '',
  featured: false,
  published: false,
};

// ============================================
// Main Component
// ============================================

export default function AdminContent() {
  // Articles state
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleFormData>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Delete/archive state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Row hover state
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // ----------------------------------------
  // Fetch articles
  // ----------------------------------------

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/content');
      if (!res.ok) throw new Error(`Failed to fetch articles (${res.status})`);
      const data = await res.json();
      setArticles(data.articles ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // ----------------------------------------
  // Fetch suggestions
  // ----------------------------------------

  const fetchSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const res = await fetch('/api/admin/content/suggestions');
      if (!res.ok) throw new Error(`Failed to fetch suggestions (${res.status})`);
      const data: Suggestions = await res.json();
      setSuggestions(data);
    } catch (err) {
      setSuggestionsError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const handleToggleSuggestions = () => {
    if (!showSuggestions && !suggestions && !suggestionsLoading) {
      fetchSuggestions();
    }
    setShowSuggestions((v) => !v);
  };

  // ----------------------------------------
  // Form helpers
  // ----------------------------------------

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSlugManuallyEdited(false);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (article: Article) => {
    setEditingId(article.id);
    setForm({
      title: article.title,
      slug: article.slug,
      article_type: article.article_type,
      excerpt: article.excerpt ?? '',
      body: article.body ?? '',
      cover_image_url: article.cover_image_url ?? '',
      featured: article.featured,
      published: article.published,
    });
    setSlugManuallyEdited(true); // don't auto-overwrite slug when editing
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setSlugManuallyEdited(false);
  };

  const handleTitleChange = (title: string) => {
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : slugify(title),
    }));
  };

  const handleSlugChange = (slug: string) => {
    setSlugManuallyEdited(true);
    setForm((prev) => ({ ...prev, slug }));
  };

  // ----------------------------------------
  // Submit form
  // ----------------------------------------

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!form.slug.trim()) {
      setFormError('Slug is required.');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    try {
      const url = editingId
        ? `/api/admin/content/${editingId}`
        : '/api/admin/content';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      await fetchArticles();
      closeForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setFormLoading(false);
    }
  };

  // ----------------------------------------
  // Archive
  // ----------------------------------------

  const handleArchive = async (article: Article) => {
    const isArchived = !!article.archived_at;
    setActionLoading(article.id);
    try {
      const res = await fetch(`/api/admin/content/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: isArchived ? null : new Date().toISOString() }),
      });
      if (!res.ok) throw new Error('Archive action failed');
      await fetchArticles();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  // ----------------------------------------
  // Delete
  // ----------------------------------------

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    setDeleteConfirmId(null);
    try {
      const res = await fetch(`/api/admin/content/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchArticles();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  // ----------------------------------------
  // Suggestions: Use this data
  // ----------------------------------------

  const prefillMarketReview = () => {
    if (!suggestions) return;
    const { top_growing_counties, period } = suggestions.market_review;
    const title = `Texas Mixed Beverage Market Review — ${period}`;
    const body = [
      `## Top Growing Counties — ${period}`,
      '',
      top_growing_counties
        .map(
          (c, i) =>
            `${i + 1}. **${c.county} County** — ${c.growth_pct >= 0 ? '+' : ''}${c.growth_pct.toFixed(1)}% growth, ${formatCurrency(c.total_revenue)} total revenue`
        )
        .join('\n'),
    ].join('\n');
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugify(title),
      article_type: 'market_review',
      body,
    }));
    setSlugManuallyEdited(false);
    setShowForm(true);
  };

  const prefillTopNewAccounts = () => {
    if (!suggestions) return;
    const { accounts, period } = suggestions.top_new_accounts;
    const title = `Top New Accounts — ${period}`;
    const body = [
      `## New Accounts to Watch — ${period}`,
      '',
      accounts
        .map(
          (a, i) =>
            `${i + 1}. **${a.name}** (${a.city}, ${a.county} County) — ${formatCurrency(a.first_month_revenue)} opening month`
        )
        .join('\n'),
    ].join('\n');
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugify(title),
      article_type: 'top_new_accounts',
      body,
    }));
    setSlugManuallyEdited(false);
    setShowForm(true);
  };

  const prefillVenueOfMonth = () => {
    if (!suggestions) return;
    const v = suggestions.venue_of_the_month;
    const title = `Venue of the Month: ${v.name}`;
    const body = [
      `## ${v.name}`,
      '',
      `**Location:** ${v.city}, ${v.county} County`,
      `**Total Revenue:** ${formatCurrency(v.total_revenue)}`,
      `**Growth:** ${v.growth_pct >= 0 ? '+' : ''}${v.growth_pct.toFixed(1)}%`,
      '',
      '_Add your editorial notes here._',
    ].join('\n');
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugify(title),
      article_type: 'venue_of_the_month',
      body,
    }));
    setSlugManuallyEdited(false);
    setShowForm(true);
  };

  // ============================================
  // Render: Article list
  // ============================================

  const renderTable = () => {
    if (loading) {
      return (
        <div style={cs.loadingContainer}>
          <div style={cs.spinner} />
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Loading articles...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div style={cs.errorBox}>
          <span style={{ color: '#b91c1c' }}>{error}</span>
          <button onClick={fetchArticles} style={cs.retryBtn}>Retry</button>
        </div>
      );
    }

    if (articles.length === 0) {
      return (
        <div style={cs.emptyState}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
          <div style={{ fontWeight: 600, color: '#475569', marginBottom: '4px' }}>No articles yet</div>
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Create your first article or use the suggestions panel to get started.
          </div>
        </div>
      );
    }

    return (
      <div style={cs.tableWrap}>
        <table style={cs.table}>
          <thead>
            <tr>
              <th style={cs.th}>Title</th>
              <th style={cs.th}>Type</th>
              <th style={cs.th}>Status</th>
              <th style={cs.th}>Date</th>
              <th style={{ ...cs.th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => {
              const status = getArticleStatus(article);
              const statusColors = STATUS_BADGE_COLORS[status];
              const typeColors = TYPE_BADGE_COLORS[article.article_type];
              const isActioning = actionLoading === article.id;
              const isConfirmingDelete = deleteConfirmId === article.id;
              const isHovered = hoveredRow === article.id;

              return (
                <tr
                  key={article.id}
                  style={{
                    ...cs.tr,
                    background: isHovered ? '#f8fafc' : 'white',
                  }}
                  onMouseEnter={() => setHoveredRow(article.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td style={cs.td}>
                    <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>
                      {article.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                      /{article.slug}
                    </div>
                  </td>
                  <td style={cs.td}>
                    <span style={{
                      ...cs.badge,
                      background: typeColors.bg,
                      color: typeColors.color,
                    }}>
                      {ARTICLE_TYPE_LABELS[article.article_type]}
                    </span>
                  </td>
                  <td style={cs.td}>
                    <span style={{
                      ...cs.badge,
                      background: statusColors.bg,
                      color: statusColors.color,
                    }}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </td>
                  <td style={{ ...cs.td, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {formatDate(article.updated_at)}
                  </td>
                  <td style={{ ...cs.td, textAlign: 'right' }}>
                    {isConfirmingDelete ? (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#b91c1c', fontWeight: 500 }}>Delete?</span>
                        <button
                          onClick={() => handleDelete(article.id)}
                          disabled={isActioning}
                          style={{ ...cs.actionBtn, background: '#fee2e2', color: '#b91c1c' }}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          style={{ ...cs.actionBtn, background: '#f1f5f9', color: '#475569' }}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => openEditForm(article)}
                          disabled={isActioning}
                          style={{ ...cs.actionBtn, background: '#e6f5f5', color: '#0d7377' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleArchive(article)}
                          disabled={isActioning}
                          style={{ ...cs.actionBtn, background: '#f1f5f9', color: '#475569' }}
                        >
                          {article.archived_at ? 'Unarchive' : 'Archive'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(article.id)}
                          disabled={isActioning}
                          style={{ ...cs.actionBtn, background: '#fee2e2', color: '#b91c1c' }}
                        >
                          {isActioning ? '...' : 'Delete'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ============================================
  // Render: Suggestions panel
  // ============================================

  const renderSuggestions = () => {
    if (!showSuggestions) return null;

    return (
      <div style={cs.suggestionsPanel}>
        <div style={cs.suggestionsPanelHeader}>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>
            Data Suggestions
          </span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Pre-fill an article form with live data
          </span>
        </div>

        {suggestionsLoading && (
          <div style={cs.loadingContainer}>
            <div style={{ ...cs.spinner, width: '28px', height: '28px' }} />
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Fetching suggestions...</p>
          </div>
        )}

        {suggestionsError && (
          <div style={cs.errorBox}>
            <span style={{ color: '#b91c1c', fontSize: '13px' }}>{suggestionsError}</span>
            <button onClick={fetchSuggestions} style={cs.retryBtn}>Retry</button>
          </div>
        )}

        {suggestions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Market Review */}
            <div style={cs.suggestionCard}>
              <div style={cs.suggestionCardHeader}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                    Market Review
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {suggestions.market_review.period} — top growing counties
                  </div>
                </div>
                <button onClick={prefillMarketReview} style={cs.useDataBtn}>
                  Use this data
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {suggestions.market_review.top_growing_counties.slice(0, 5).map((c) => (
                  <div key={c.county} style={cs.suggestionRow}>
                    <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>{c.county} County</span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: c.growth_pct >= 0 ? '#065f46' : '#b91c1c',
                    }}>
                      {c.growth_pct >= 0 ? '+' : ''}{c.growth_pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top New Accounts */}
            <div style={cs.suggestionCard}>
              <div style={cs.suggestionCardHeader}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                    Top New Accounts
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {suggestions.top_new_accounts.period}
                  </div>
                </div>
                <button onClick={prefillTopNewAccounts} style={cs.useDataBtn}>
                  Use this data
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {suggestions.top_new_accounts.accounts.slice(0, 5).map((a) => (
                  <div key={a.tabc_permit_number} style={cs.suggestionRow}>
                    <span style={{ fontSize: '12px', color: '#334155', fontWeight: 500 }}>
                      {a.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({a.city})</span>
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#065f46' }}>
                      {formatCurrency(a.first_month_revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Venue of the Month */}
            <div style={cs.suggestionCard}>
              <div style={cs.suggestionCardHeader}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                    Venue of the Month
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {suggestions.venue_of_the_month.name} — {suggestions.venue_of_the_month.city}
                  </div>
                </div>
                <button onClick={prefillVenueOfMonth} style={cs.useDataBtn}>
                  Use this data
                </button>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Revenue</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    {formatCurrency(suggestions.venue_of_the_month.total_revenue)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Growth</div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: suggestions.venue_of_the_month.growth_pct >= 0 ? '#065f46' : '#b91c1c',
                  }}>
                    {suggestions.venue_of_the_month.growth_pct >= 0 ? '+' : ''}
                    {suggestions.venue_of_the_month.growth_pct.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>County</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                    {suggestions.venue_of_the_month.county}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // Render: Create/Edit modal form
  // ============================================

  const renderForm = () => {
    if (!showForm) return null;

    return (
      <div style={cs.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
        <div style={cs.modal}>
          {/* Modal header */}
          <div style={cs.modalHeader}>
            <h2 style={cs.modalTitle}>
              {editingId ? 'Edit Article' : 'New Article'}
            </h2>
            <button onClick={closeForm} style={cs.modalClose}>✕</button>
          </div>

          {/* Form body */}
          <div style={cs.modalBody}>
            {formError && (
              <div style={cs.formError}>{formError}</div>
            )}

            {/* Title */}
            <div style={cs.fieldGroup}>
              <label style={cs.label}>Title <span style={{ color: '#b91c1c' }}>*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Texas Market Review — March 2026"
                style={cs.input}
              />
            </div>

            {/* Slug */}
            <div style={cs.fieldGroup}>
              <label style={cs.label}>Slug <span style={{ color: '#b91c1c' }}>*</span></label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. texas-market-review-march-2026"
                style={cs.input}
              />
              <div style={cs.fieldHint}>URL-safe identifier. Auto-generated from title.</div>
            </div>

            {/* Article Type */}
            <div style={cs.fieldGroup}>
              <label style={cs.label}>Article Type</label>
              <select
                value={form.article_type}
                onChange={(e) => setForm((prev) => ({ ...prev, article_type: e.target.value as ArticleType }))}
                style={cs.select}
              >
                <option value="market_review">Market Review</option>
                <option value="top_new_accounts">Top New Accounts</option>
                <option value="venue_of_the_month">Venue of the Month</option>
              </select>
            </div>

            {/* Excerpt */}
            <div style={cs.fieldGroup}>
              <label style={cs.label}>Excerpt</label>
              <textarea
                value={form.excerpt}
                onChange={(e) => setForm((prev) => ({ ...prev, excerpt: e.target.value }))}
                placeholder="Short preview text shown in article listings..."
                style={{ ...cs.textarea, height: '72px' }}
              />
            </div>

            {/* Body */}
            <div style={cs.fieldGroup}>
              <label style={cs.label}>Body (Markdown)</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                placeholder="Full article content in Markdown format..."
                style={{ ...cs.textarea, height: '220px', fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace", fontSize: '12px' }}
              />
            </div>

            {/* Cover Image URL */}
            <div style={cs.fieldGroup}>
              <label style={cs.label}>Cover Image URL</label>
              <input
                type="text"
                value={form.cover_image_url}
                onChange={(e) => setForm((prev) => ({ ...prev, cover_image_url: e.target.value }))}
                placeholder="https://..."
                style={cs.input}
              />
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <label style={cs.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.published}
                  onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))}
                  style={cs.checkbox}
                />
                Publish
              </label>
              <label style={cs.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm((prev) => ({ ...prev, featured: e.target.checked }))}
                  style={cs.checkbox}
                />
                Featured
              </label>
            </div>
          </div>

          {/* Modal footer */}
          <div style={cs.modalFooter}>
            <button onClick={closeForm} style={cs.cancelBtn} disabled={formLoading}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={formLoading}
              style={{
                ...cs.submitBtn,
                opacity: formLoading ? 0.7 : 1,
                cursor: formLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {formLoading ? 'Saving...' : editingId ? 'Save Changes' : 'Create Article'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // Main Render
  // ============================================

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header row */}
      <div style={cs.headerRow}>
        <div>
          <h2 style={cs.sectionTitle}>Content Management</h2>
          <p style={cs.sectionSubtitle}>
            {articles.length} article{articles.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleToggleSuggestions}
            style={{
              ...cs.secondaryBtn,
              background: showSuggestions ? '#e6f5f5' : 'white',
              borderColor: showSuggestions ? '#0d7377' : '#e2e8f0',
              color: showSuggestions ? '#0d7377' : '#475569',
            }}
          >
            {showSuggestions ? 'Hide Suggestions' : 'Data Suggestions'}
          </button>
          <button onClick={openCreateForm} style={cs.primaryBtn}>
            + New Article
          </button>
        </div>
      </div>

      {/* Suggestions panel */}
      {renderSuggestions()}

      {/* Article list card */}
      <div style={cs.card}>
        {renderTable()}
      </div>

      {/* Create/Edit modal */}
      {renderForm()}
    </div>
  );
}

// ============================================
// Styles
// ============================================

const cs: Record<string, React.CSSProperties> = {
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
    marginBottom: '2px',
  },
  sectionSubtitle: {
    fontSize: '13px',
    color: '#64748b',
    margin: 0,
  },

  // Buttons
  primaryBtn: {
    padding: '10px 18px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  secondaryBtn: {
    padding: '10px 18px',
    background: 'white',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  actionBtn: {
    padding: '5px 10px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  retryBtn: {
    padding: '6px 12px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  useDataBtn: {
    padding: '6px 12px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'white',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  submitBtn: {
    padding: '10px 24px',
    background: '#0d7377',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Card
  card: {
    background: 'white',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },

  // Table
  tableWrap: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    padding: '10px 16px',
    textAlign: 'left' as const,
    fontWeight: 600,
    color: '#64748b',
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    borderBottom: '2px solid #e2e8f0',
    whiteSpace: 'nowrap' as const,
    background: '#f8fafc',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background 0.1s',
  },
  td: {
    padding: '12px 16px',
    color: '#334155',
    fontSize: '13px',
    verticalAlign: 'middle' as const,
  },

  // Badge
  badge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  },

  // Loading
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 20px',
    gap: '12px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #0d7377',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  // Error
  errorBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    fontSize: '13px',
    gap: '12px',
  },

  // Empty state
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 32px',
    color: '#94a3b8',
    fontSize: '14px',
  },

  // Suggestions panel
  suggestionsPanel: {
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  suggestionsPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '6px',
  },
  suggestionCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '14px',
  },
  suggestionCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  suggestionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
  },

  // Modal
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 9000,
    padding: '40px 16px',
    overflowY: 'auto',
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '680px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
  },
  modalClose: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  },
  modalBody: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    maxHeight: '70vh',
    overflowY: 'auto',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    padding: '16px 24px',
    borderTop: '1px solid #e2e8f0',
  },

  // Form fields
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  },
  input: {
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    color: '#1e293b',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  select: {
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    color: '#1e293b',
    outline: 'none',
    background: 'white',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '14px',
    color: '#1e293b',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    lineHeight: '1.5',
  },
  fieldHint: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: '#0d7377',
  },
  formError: {
    padding: '10px 14px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#b91c1c',
    fontSize: '13px',
  },
};
