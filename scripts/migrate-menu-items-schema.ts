#!/usr/bin/env tsx
/**
 * Migrate Menu Items Schema
 * Creates the products (master catalog) and menu_items (parsed line items) tables.
 *
 * This script:
 * - Creates the products table with dedupe_key for deduplication
 * - Creates the menu_items table with self-referencing parent_header_id
 * - All operations are idempotent (safe to re-run)
 *
 * Usage:
 *   npx tsx scripts/migrate-menu-items-schema.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// Load .env.local manually (scripts don't go through Next.js)
// ============================================

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log(chalk.gray('   Loaded .env.local'));
} else {
  console.log(chalk.yellow('   Warning: .env.local not found, using existing env vars'));
}

// ============================================
// Config
// ============================================

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================
// SQL Execution Helper
// ============================================

async function runSQL(
  supabase: SupabaseClient,
  sql: string,
  description: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        return {
          success: false,
          error: `RPC function 'exec_sql' not found. See manual SQL output below.`,
        };
      }
      if (error.message.includes('already exists')) {
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ============================================
// Migration Steps
// ============================================

interface MigrationStep {
  description: string;
  sql: string;
}

const CREATE_TABLES: MigrationStep[] = [
  {
    description: 'Create products table (master product catalog)',
    sql: `CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(500) NOT NULL,
  producer VARCHAR(255),
  brand VARCHAR(255),
  varietal VARCHAR(100),
  appellation VARCHAR(255),
  vintage SMALLINT,
  format VARCHAR(50),
  category VARCHAR(50) NOT NULL CHECK (category IN ('wine','beer','spirits','cocktail','sake','other')),
  subcategory VARCHAR(100),
  source VARCHAR(30) NOT NULL DEFAULT 'ocr_discovery'
    CHECK (source IN ('ocr_discovery','price_list_import','manual')),
  dedupe_key VARCHAR(500) NOT NULL UNIQUE,
  supplier_id UUID,
  division VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);`,
  },
  {
    description: 'Create index idx_products_category on products',
    sql: `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`,
  },
  {
    description: 'Create index idx_products_dedupe on products',
    sql: `CREATE INDEX IF NOT EXISTS idx_products_dedupe ON products(dedupe_key);`,
  },
  {
    description: 'Create index idx_products_producer on products',
    sql: `CREATE INDEX IF NOT EXISTS idx_products_producer ON products(producer);`,
  },
  {
    description: 'Create menu_items table (parsed line items from sections)',
    sql: `CREATE TABLE IF NOT EXISTS menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_photo_id UUID NOT NULL REFERENCES activity_photos(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES ocr_menu_sections(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL DEFAULT 'line_item'
    CHECK (item_type IN ('header_1','header_2','header_3','line_item')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  parent_header_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  raw_text TEXT,
  bin_number VARCHAR(10),
  item_name VARCHAR(500),
  producer VARCHAR(255),
  varietal VARCHAR(100),
  appellation VARCHAR(255),
  vintage SMALLINT,
  format VARCHAR(50),
  price DECIMAL(8,2),
  price_text VARCHAR(50),
  notes TEXT,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  match_confidence DECIMAL(5,2),
  match_status VARCHAR(20) DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','auto_matched','user_confirmed','user_rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);`,
  },
  {
    description: 'Create index idx_menu_items_photo on menu_items',
    sql: `CREATE INDEX IF NOT EXISTS idx_menu_items_photo ON menu_items(activity_photo_id);`,
  },
  {
    description: 'Create index idx_menu_items_section on menu_items',
    sql: `CREATE INDEX IF NOT EXISTS idx_menu_items_section ON menu_items(section_id);`,
  },
  {
    description: 'Create index idx_menu_items_product on menu_items',
    sql: `CREATE INDEX IF NOT EXISTS idx_menu_items_product ON menu_items(product_id);`,
  },
  {
    description: 'Create index idx_menu_items_parent on menu_items',
    sql: `CREATE INDEX IF NOT EXISTS idx_menu_items_parent ON menu_items(parent_header_id);`,
  },
  {
    description: 'Create index idx_menu_items_sort on menu_items',
    sql: `CREATE INDEX IF NOT EXISTS idx_menu_items_sort ON menu_items(section_id, sort_order);`,
  },
];

// ============================================
// Main
// ============================================

async function migrate() {
  const startTime = Date.now();

  console.log(chalk.blue('\n=== Menu Items Schema Migration ===\n'));

  const supabase = getSupabaseClient();

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  let rpcUnavailable = false;

  console.log(chalk.cyan('Creating products and menu_items tables\n'));

  for (const step of CREATE_TABLES) {
    process.stdout.write(chalk.gray(`   ${step.description}... `));

    const result = await runSQL(supabase, step.sql, step.description);

    if (result.success) {
      console.log(chalk.green('OK'));
      succeeded++;
    } else if (result.error?.includes('already exists')) {
      console.log(chalk.yellow('SKIPPED (already exists)'));
      skipped++;
    } else if (result.error?.includes('exec_sql')) {
      console.log(chalk.yellow('RPC unavailable'));
      rpcUnavailable = true;
      failed++;
      break;
    } else {
      console.log(chalk.red(`FAILED: ${result.error}`));
      failed++;
    }
  }

  // --- Summary ---
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(chalk.blue('\n=== Migration Summary ===\n'));
  console.log(chalk.green(`   Succeeded: ${succeeded}`));
  if (skipped > 0) {
    console.log(chalk.yellow(`   Skipped:   ${skipped} (already existed)`));
  }
  if (failed > 0) {
    console.log(chalk.red(`   Failed:    ${failed}`));
  }
  console.log(chalk.gray(`   Duration:  ${duration}s`));

  // --- If RPC unavailable, output SQL for manual execution ---
  if (rpcUnavailable) {
    console.log(chalk.yellow('\n=========================================================='));
    console.log(chalk.yellow('  The exec_sql RPC function is not available in Supabase.'));
    console.log(chalk.yellow('  Please run the following SQL manually in the Supabase'));
    console.log(chalk.yellow('  Dashboard SQL Editor (https://supabase.com/dashboard).'));
    console.log(chalk.yellow('==========================================================\n'));

    for (const step of CREATE_TABLES) {
      console.log(chalk.gray(`-- ${step.description}`));
      console.log(chalk.cyan(step.sql));
      console.log('');
    }
  }

  if (failed > 0 && !rpcUnavailable) {
    console.log(chalk.yellow('\nSome steps failed. You may need to run them manually in the Supabase SQL Editor.'));
    process.exit(1);
  }

  if (rpcUnavailable) {
    console.log(chalk.yellow('\nAfter creating the exec_sql function, re-run this script:'));
    console.log(chalk.gray('   npx tsx scripts/migrate-menu-items-schema.ts\n'));
    process.exit(1);
  }

  console.log(chalk.green('\nAll migration steps completed successfully.\n'));
}

// Run migration
migrate().catch(error => {
  console.error(chalk.red(`\nFatal error: ${error}`));
  process.exit(1);
});
