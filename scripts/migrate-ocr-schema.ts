#!/usr/bin/env tsx
/**
 * Migrate OCR Schema
 * Creates the OCR enhancement tables and columns in Supabase (PostgreSQL).
 *
 * This script:
 * - Adds new OCR-related columns to activity_photos
 * - Creates ocr_word_data, ocr_user_corrections, ocr_learned_dictionary, ocr_menu_sections tables
 * - All operations are idempotent (safe to re-run)
 *
 * Usage:
 *   npx tsx scripts/migrate-ocr-schema.ts
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

/**
 * Execute a SQL statement via Supabase's rpc('exec_sql') or direct REST.
 * Falls back to logging the SQL if execution fails.
 */
async function runSQL(
  supabase: SupabaseClient,
  sql: string,
  description: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Attempt via Supabase rpc - requires a server-side function 'exec_sql'
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Check if it's a "function not found" error - means exec_sql doesn't exist
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        return {
          success: false,
          error: `RPC function 'exec_sql' not found. See manual SQL output below.`,
        };
      }
      // Check for "already exists" which is fine for idempotent operations
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

const ALTER_TABLE_COLUMNS: MigrationStep[] = [
  {
    description: 'Add ocr_raw_text column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_raw_text TEXT;`,
  },
  {
    description: 'Add ocr_confidence column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(5,2);`,
  },
  {
    description: 'Add ocr_processing_time_ms column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_processing_time_ms INTEGER;`,
  },
  {
    description: 'Add ocr_image_width column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_image_width INTEGER;`,
  },
  {
    description: 'Add ocr_image_height column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_image_height INTEGER;`,
  },
  {
    description: 'Add ocr_word_count column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_word_count INTEGER DEFAULT 0;`,
  },
  {
    description: 'Add ocr_correction_count column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_correction_count INTEGER DEFAULT 0;`,
  },
  {
    description: 'Add ocr_review_status column to activity_photos',
    sql: `ALTER TABLE activity_photos ADD COLUMN IF NOT EXISTS ocr_review_status VARCHAR(20) DEFAULT 'pending' CHECK (ocr_review_status IN ('pending', 'reviewed', 'needs_review'));`,
  },
];

const CREATE_TABLES: MigrationStep[] = [
  {
    description: 'Create ocr_word_data table',
    sql: `CREATE TABLE IF NOT EXISTS ocr_word_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_photo_id UUID NOT NULL REFERENCES activity_photos(id) ON DELETE CASCADE,
  word_index INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  corrected_text TEXT NOT NULL,
  confidence DECIMAL(5,2) DEFAULT 0,
  bbox_x0 INTEGER NOT NULL,
  bbox_y0 INTEGER NOT NULL,
  bbox_x1 INTEGER NOT NULL,
  bbox_y1 INTEGER NOT NULL,
  line_index INTEGER NOT NULL,
  block_index INTEGER NOT NULL,
  was_corrected BOOLEAN DEFAULT false,
  correction_source VARCHAR(20) CHECK (correction_source IN ('dictionary', 'learned')),
  dictionary_key TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(activity_photo_id, word_index)
);`,
  },
  {
    description: 'Create index idx_word_data_photo',
    sql: `CREATE INDEX IF NOT EXISTS idx_word_data_photo ON ocr_word_data(activity_photo_id);`,
  },
  {
    description: 'Create index idx_word_data_corrected',
    sql: `CREATE INDEX IF NOT EXISTS idx_word_data_corrected ON ocr_word_data(was_corrected) WHERE was_corrected = true;`,
  },
  {
    description: 'Create ocr_user_corrections table',
    sql: `CREATE TABLE IF NOT EXISTS ocr_user_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_photo_id UUID NOT NULL REFERENCES activity_photos(id) ON DELETE CASCADE,
  word_index INTEGER NOT NULL,
  system_text TEXT NOT NULL,
  user_text TEXT NOT NULL,
  bbox_x0 INTEGER,
  bbox_y0 INTEGER,
  bbox_x1 INTEGER,
  bbox_y1 INTEGER,
  corrected_by UUID REFERENCES auth.users(id),
  review_status VARCHAR(20) DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);`,
  },
  {
    description: 'Create index idx_user_corrections_photo',
    sql: `CREATE INDEX IF NOT EXISTS idx_user_corrections_photo ON ocr_user_corrections(activity_photo_id);`,
  },
  {
    description: 'Create index idx_user_corrections_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_user_corrections_status ON ocr_user_corrections(review_status);`,
  },
  {
    description: 'Create ocr_learned_dictionary table',
    sql: `CREATE TABLE IF NOT EXISTS ocr_learned_dictionary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mistake_text TEXT NOT NULL,
  correction_text TEXT NOT NULL,
  confirmation_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(mistake_text, correction_text)
);`,
  },
  {
    description: 'Create index idx_learned_dict_active',
    sql: `CREATE INDEX IF NOT EXISTS idx_learned_dict_active ON ocr_learned_dictionary(is_active) WHERE is_active = true;`,
  },
  {
    description: 'Create index idx_learned_dict_mistake',
    sql: `CREATE INDEX IF NOT EXISTS idx_learned_dict_mistake ON ocr_learned_dictionary(mistake_text);`,
  },
  {
    description: 'Create ocr_menu_sections table',
    sql: `CREATE TABLE IF NOT EXISTS ocr_menu_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_photo_id UUID NOT NULL REFERENCES activity_photos(id) ON DELETE CASCADE,
  section_type VARCHAR(30) NOT NULL CHECK (section_type IN ('cocktails', 'wines_by_glass', 'draft_beers', 'bottled_beers', 'spirits_list', 'wine_list', 'sake_by_glass', 'sake_by_bottle', 'food', 'other')),
  bbox_x0 INTEGER NOT NULL,
  bbox_y0 INTEGER NOT NULL,
  bbox_x1 INTEGER NOT NULL,
  bbox_y1 INTEGER NOT NULL,
  label TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);`,
  },
  {
    description: 'Create index idx_menu_sections_photo',
    sql: `CREATE INDEX IF NOT EXISTS idx_menu_sections_photo ON ocr_menu_sections(activity_photo_id);`,
  },
];

// ============================================
// Main
// ============================================

async function migrate() {
  const startTime = Date.now();

  console.log(chalk.blue('\n=== OCR Schema Migration ===\n'));

  const supabase = getSupabaseClient();

  const allSteps = [...ALTER_TABLE_COLUMNS, ...CREATE_TABLES];
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;
  let rpcUnavailable = false;

  // --- Phase 1: ALTER TABLE activity_photos ---
  console.log(chalk.cyan('Phase 1: ALTER TABLE activity_photos (add new columns)\n'));

  for (const step of ALTER_TABLE_COLUMNS) {
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
      break; // No point continuing if rpc doesn't exist
    } else {
      console.log(chalk.red(`FAILED: ${result.error}`));
      failed++;
    }
  }

  // --- Phase 2: CREATE TABLES ---
  if (!rpcUnavailable) {
    console.log(chalk.cyan('\nPhase 2: CREATE new OCR tables\n'));

    for (const step of CREATE_TABLES) {
      process.stdout.write(chalk.gray(`   ${step.description}... `));

      const result = await runSQL(supabase, step.sql, step.description);

      if (result.success) {
        console.log(chalk.green('OK'));
        succeeded++;
      } else if (result.error?.includes('already exists')) {
        console.log(chalk.yellow('SKIPPED (already exists)'));
        skipped++;
      } else {
        console.log(chalk.red(`FAILED: ${result.error}`));
        failed++;
      }
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

    console.log(chalk.white('-- ============================================'));
    console.log(chalk.white('-- Step 1: Create the exec_sql helper function'));
    console.log(chalk.white('-- (Run this first, then re-run this script)'));
    console.log(chalk.white('-- ============================================\n'));

    console.log(chalk.cyan(`CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;`));

    console.log(chalk.white('\n-- ============================================'));
    console.log(chalk.white('-- OR: Run all migration SQL directly below'));
    console.log(chalk.white('-- ============================================\n'));

    console.log(chalk.white('-- Phase 1: ALTER TABLE activity_photos\n'));
    for (const step of ALTER_TABLE_COLUMNS) {
      console.log(chalk.gray(`-- ${step.description}`));
      console.log(chalk.cyan(step.sql));
      console.log('');
    }

    console.log(chalk.white('-- Phase 2: CREATE new OCR tables\n'));
    for (const step of CREATE_TABLES) {
      console.log(chalk.gray(`-- ${step.description}`));
      console.log(chalk.cyan(step.sql));
      console.log('');
    }
  }

  if (failed > 0 && !rpcUnavailable) {
    console.log(chalk.yellow('\nSome steps failed. You may need to run them manually in the Supabase SQL Editor.'));
    console.log(chalk.yellow('Failed SQL statements are listed above with their error messages.'));
    process.exit(1);
  }

  if (rpcUnavailable) {
    console.log(chalk.yellow('\nAfter creating the exec_sql function, re-run this script:'));
    console.log(chalk.gray('   npx tsx scripts/migrate-ocr-schema.ts\n'));
    process.exit(1);
  }

  console.log(chalk.green('\nAll migration steps completed successfully.\n'));
}

// Run migration
migrate().catch(error => {
  console.error(chalk.red(`\nFatal error: ${error}`));
  process.exit(1);
});
