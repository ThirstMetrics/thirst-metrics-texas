-- ============================================
-- THIRST METRICS TEXAS - POSTGRESQL SCHEMA
-- Supabase Database Schema
-- ============================================
-- 
-- This schema defines all PostgreSQL tables for the Thirst Metrics Texas platform.
-- Run this in Supabase SQL Editor after creating your project.
--
-- Last updated: January 25, 2026
-- ============================================

-- ============================================
-- USERS & AUTHENTICATION
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'salesperson' CHECK (role IN ('salesperson', 'manager', 'admin')),
  territory_id UUID REFERENCES territories(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_territory ON users(territory_id);

-- ============================================
-- TERRITORIES
-- ============================================

CREATE TABLE IF NOT EXISTS territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  county_codes TEXT[],
  zip_codes TEXT[],
  assigned_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_territories_user ON territories(assigned_user_id);

-- ============================================
-- SALES ACTIVITIES (CRM)
-- ============================================

CREATE TABLE IF NOT EXISTS sales_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tabc_permit_number VARCHAR(20) NOT NULL,
  
  -- Activity basics
  activity_type VARCHAR(20) NOT NULL CHECK (activity_type IN ('visit', 'call', 'email', 'note')),
  activity_date DATE NOT NULL,
  notes TEXT,
  outcome VARCHAR(20) CHECK (outcome IN ('positive', 'neutral', 'negative', 'no_contact')),
  next_followup_date DATE,
  
  -- Contact info (customer's contact person)
  contact_name VARCHAR(255),
  contact_cell_phone VARCHAR(20),
  contact_email VARCHAR(255),
  contact_preferred_method VARCHAR(20) CHECK (contact_preferred_method IN ('text', 'call', 'email', 'in_person')),
  decision_maker BOOLEAN DEFAULT false,
  
  -- Availability (customer's availability for meetings)
  avail_monday_am BOOLEAN DEFAULT false,
  avail_monday_pm BOOLEAN DEFAULT false,
  avail_tuesday_am BOOLEAN DEFAULT false,
  avail_tuesday_pm BOOLEAN DEFAULT false,
  avail_wednesday_am BOOLEAN DEFAULT false,
  avail_wednesday_pm BOOLEAN DEFAULT false,
  avail_thursday_am BOOLEAN DEFAULT false,
  avail_thursday_pm BOOLEAN DEFAULT false,
  avail_friday_am BOOLEAN DEFAULT false,
  avail_friday_pm BOOLEAN DEFAULT false,
  avail_saturday_am BOOLEAN DEFAULT false,
  avail_saturday_pm BOOLEAN DEFAULT false,
  avail_sunday_am BOOLEAN DEFAULT false,
  avail_sunday_pm BOOLEAN DEFAULT false,
  
  -- Sales intel
  conversation_summary TEXT,
  product_interest TEXT[],  -- array: beer, wine, spirits, equipment
  current_products_carried TEXT,
  objections TEXT,
  competitors_mentioned TEXT[],
  next_action TEXT,
  
  -- GPS verification (phone location when record created)
  gps_latitude DECIMAL(10, 8),
  gps_longitude DECIMAL(11, 8),
  gps_accuracy_meters DECIMAL(8, 2),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_user ON sales_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_permit ON sales_activities(tabc_permit_number);
CREATE INDEX IF NOT EXISTS idx_activities_date ON sales_activities(activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_outcome ON sales_activities(outcome);
CREATE INDEX IF NOT EXISTS idx_activities_followup ON sales_activities(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_activities_type ON sales_activities(activity_type);

-- ============================================
-- ACTIVITY PHOTOS
-- ============================================

CREATE TABLE IF NOT EXISTS activity_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES sales_activities(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  file_size_bytes INTEGER,
  photo_type VARCHAR(50) CHECK (photo_type IN ('receipt', 'menu', 'product_display', 'shelf', 'other')),
  
  -- OCR extracted text (for future search)
  ocr_text TEXT,
  ocr_processed_at TIMESTAMP,
  ocr_language VARCHAR(10),  -- detected language: en, es, fr, de, it
  
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_activity ON activity_photos(activity_id);
CREATE INDEX IF NOT EXISTS idx_photos_ocr ON activity_photos USING gin(to_tsvector('english', ocr_text)) WHERE ocr_text IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photos_type ON activity_photos(photo_type);

-- ============================================
-- GOALS
-- ============================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_type VARCHAR(30) NOT NULL CHECK (goal_type IN ('revenue', 'growth', 'new_accounts', 'visits')),
  target_value DECIMAL(15, 2) NOT NULL,
  target_date DATE NOT NULL,
  current_value DECIMAL(15, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'missed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_goals_date ON goals(target_date);

-- ============================================
-- CUSTOMER PRIORITIES (cached/computed)
-- ============================================

CREATE TABLE IF NOT EXISTS customer_priorities (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  priority_score DECIMAL(5, 2),
  revenue_rank INTEGER,
  growth_rate DECIMAL(8, 4),
  last_activity_date DATE,
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_priorities_score ON customer_priorities(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_priorities_revenue ON customer_priorities(revenue_rank);
CREATE INDEX IF NOT EXISTS idx_priorities_growth ON customer_priorities(growth_rate DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Enable RLS on all tables for security
-- See docs/SUPABASE_SETUP.md for policy creation

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_priorities ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_activities_updated_at BEFORE UPDATE ON sales_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after schema creation to verify:

-- Check all tables exist
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public'
-- ORDER BY table_name;

-- Check indexes were created
-- SELECT tablename, indexname 
-- FROM pg_indexes 
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;

-- Check RLS is enabled
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
