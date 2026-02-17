-- Migration: Create user_saved_accounts table
-- Purpose: Allow users to save/star accounts for quick "My Accounts" filtering
-- Run this in the Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS user_saved_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tabc_permit_number VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tabc_permit_number)
);

CREATE INDEX IF NOT EXISTS idx_saved_accounts_user ON user_saved_accounts(user_id);
