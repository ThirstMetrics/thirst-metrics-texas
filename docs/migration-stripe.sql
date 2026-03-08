-- ============================================
-- STRIPE BILLING MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Organizations (billing entity that owns subscriptions)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_price_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'trialing'
    CHECK (subscription_status IN (
      'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'
    )),
  trial_ends_at TIMESTAMP,
  trial_used BOOLEAN DEFAULT false,
  seat_count INTEGER NOT NULL DEFAULT 1,
  billing_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Organization members (links users to orgs)
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_role VARCHAR(20) NOT NULL DEFAULT 'member'
    CHECK (org_role IN ('owner', 'member')),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Webhook event log (idempotency + audit)
CREATE TABLE stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  payload JSONB NOT NULL,
  error TEXT
);

-- Add org_id to existing users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- Indexes for organizations
CREATE INDEX idx_org_stripe_customer ON organizations(stripe_customer_id);
CREATE INDEX idx_org_subscription_status ON organizations(subscription_status);

-- Indexes for org_members
CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_org_members_user ON org_members(user_id);

-- Indexes for webhook events
CREATE INDEX idx_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON stripe_webhook_events(processed_at DESC);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Organizations: users can read their own org
CREATE POLICY "Users can view own organization"
  ON organizations FOR SELECT
  USING (id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Org members: users can read members in their org
CREATE POLICY "Users can view own org members"
  ON org_members FOR SELECT
  USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Webhook events: service role only (no user access needed)
-- No SELECT policy = only service role can read
