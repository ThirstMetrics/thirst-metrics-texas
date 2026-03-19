-- ============================================
-- CONTENT / BLOG ARTICLES MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE content_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  body TEXT NOT NULL,
  excerpt TEXT,
  article_type VARCHAR(30) NOT NULL CHECK (article_type IN ('market_review', 'top_new_accounts', 'venue_of_the_month')),
  cover_image_url TEXT,
  featured BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  archived_at TIMESTAMP,
  author_name VARCHAR(255) DEFAULT 'Whiskey River TX',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_content_featured ON content_articles(featured) WHERE featured = true;
CREATE INDEX idx_content_type ON content_articles(article_type);
CREATE INDEX idx_content_published ON content_articles(published_at DESC);
CREATE INDEX idx_content_slug ON content_articles(slug);

-- RLS: public read for published articles, admin write
ALTER TABLE content_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published articles"
  ON content_articles FOR SELECT
  USING (published_at IS NOT NULL);
