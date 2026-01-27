-- ============================================
-- THIRST METRICS TEXAS - DUCKDB SCHEMA
-- Analytics Database Schema (Read-Only)
-- ============================================
-- 
-- This schema defines all DuckDB tables for analytics queries.
-- Run this after creating the DuckDB database file.
--
-- Last updated: January 25, 2026
-- ============================================

-- ============================================
-- MIXED BEVERAGE RECEIPTS (from Texas.gov API)
-- ============================================

CREATE TABLE IF NOT EXISTS mixed_beverage_receipts (
  location_month_key VARCHAR(30) PRIMARY KEY,  -- {tabc_permit_number}_{obligation_end_date}
  tabc_permit_number VARCHAR(20) NOT NULL,
  location_name VARCHAR(255),
  location_address VARCHAR(255),
  location_city VARCHAR(100),
  location_state VARCHAR(2),
  location_zip VARCHAR(10),
  location_county VARCHAR(100),
  location_county_code VARCHAR(3),
  obligation_end_date DATE NOT NULL,
  liquor_receipts DECIMAL(15, 2),
  wine_receipts DECIMAL(15, 2),
  beer_receipts DECIMAL(15, 2),
  cover_charge_receipts DECIMAL(15, 2),
  total_receipts DECIMAL(15, 2),
  responsibility_begin_date DATE,
  responsibility_end_date DATE
);

CREATE INDEX IF NOT EXISTS idx_receipts_permit ON mixed_beverage_receipts(tabc_permit_number);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON mixed_beverage_receipts(obligation_end_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_county ON mixed_beverage_receipts(location_county_code);
CREATE INDEX IF NOT EXISTS idx_receipts_zip ON mixed_beverage_receipts(location_zip);
CREATE INDEX IF NOT EXISTS idx_receipts_filter ON mixed_beverage_receipts(obligation_end_date, location_county_code, location_zip);
CREATE INDEX IF NOT EXISTS idx_receipts_history ON mixed_beverage_receipts(tabc_permit_number, obligation_end_date DESC);

-- ============================================
-- LOCATION ENRICHMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS location_enrichments (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  clean_dba_name VARCHAR(255),
  ownership_group VARCHAR(255),
  industry_segment VARCHAR(100),
  clean_up_notes TEXT,
  last_updated TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enrichments_ownership ON location_enrichments(ownership_group);
CREATE INDEX IF NOT EXISTS idx_enrichments_segment ON location_enrichments(industry_segment);

-- ============================================
-- LOCATION COORDINATES (for maps)
-- ============================================

CREATE TABLE IF NOT EXISTS location_coordinates (
  tabc_permit_number VARCHAR(20) PRIMARY KEY,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geocoded_at TIMESTAMP,
  geocode_source VARCHAR(20),  -- mapbox, google, manual
  geocode_quality VARCHAR(20)    -- exact, approximate, failed
);

CREATE INDEX IF NOT EXISTS idx_coordinates_quality ON location_coordinates(geocode_quality);

-- ============================================
-- REFERENCE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS counties (
  county_code VARCHAR(3) PRIMARY KEY,  -- zero-padded Texas county number
  county_name VARCHAR(100) NOT NULL,   -- WITHOUT "County" suffix
  county_number SMALLINT NOT NULL      -- raw number 1-254
);

CREATE INDEX IF NOT EXISTS idx_counties_name ON counties(county_name);

CREATE TABLE IF NOT EXISTS metroplexes (
  zip VARCHAR(5) PRIMARY KEY,
  city_town VARCHAR(100),
  county VARCHAR(100),
  metroplex VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_metroplexes_metro ON metroplexes(metroplex);
CREATE INDEX IF NOT EXISTS idx_metroplexes_county ON metroplexes(county);

CREATE TABLE IF NOT EXISTS general_sales_tax (
  type VARCHAR(10) NOT NULL,           -- COUNTY, MTA, SPD
  name VARCHAR(100) NOT NULL,
  report_year SMALLINT NOT NULL,
  report_month TINYINT NOT NULL,
  report_period_type VARCHAR(20) NOT NULL,
  current_rate DECIMAL(6, 4),
  net_payment_this_period DECIMAL(15, 2),
  comparable_payment_prior_year DECIMAL(15, 2),
  percent_change_from_prior_year DECIMAL(8, 2),
  payments_to_date DECIMAL(15, 2),
  previous_payments_to_date DECIMAL(15, 2),
  percent_change_to_date DECIMAL(8, 2),
  month VARCHAR(7),                    -- YYYY-MM format
  county_code VARCHAR(3),              -- only for type='COUNTY'
  PRIMARY KEY (type, name, report_year, report_month, report_period_type)
);

CREATE INDEX IF NOT EXISTS idx_sales_tax_county ON general_sales_tax(county_code);
CREATE INDEX IF NOT EXISTS idx_sales_tax_month ON general_sales_tax(month);
CREATE INDEX IF NOT EXISTS idx_sales_tax_type ON general_sales_tax(type);
