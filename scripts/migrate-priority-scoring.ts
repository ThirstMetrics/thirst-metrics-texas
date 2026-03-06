#!/usr/bin/env tsx
/**
 * Migration: Create customer_priorities table with component score columns
 *
 * Creates the table if it doesn't exist, then adds the extra columns
 * for the priority scoring system.
 *
 * Run: npx tsx scripts/migrate-priority-scoring.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local manually (no dotenv dependency)
function loadEnvFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {}
}
loadEnvFile(path.join(process.cwd(), '.env.local'));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

/**
 * Execute SQL via Supabase's PostgREST RPC or the pg-meta endpoint.
 * Tries multiple approaches.
 */
async function execSQL(sql: string): Promise<{ success: boolean; error?: string }> {
  // Approach 1: Try the /pg/query endpoint (Supabase pg-meta)
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey!,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql_query: sql }),
    });

    if (res.ok) {
      return { success: true };
    }

    const body = await res.text();
    // If function doesn't exist, fall through
    if (body.includes('does not exist') || body.includes('not found')) {
      // Try next approach
    } else if (body.includes('already exists')) {
      return { success: true };
    } else {
      return { success: false, error: body };
    }
  } catch {}

  // Approach 2: Try exec_sql with sql_text param name
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey!,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql_text: sql }),
    });

    if (res.ok) {
      return { success: true };
    }
  } catch {}

  return { success: false, error: 'No SQL execution method available' };
}

async function migrate() {
  console.log('🔧 Running priority scoring migration...\n');

  // Full CREATE TABLE + column additions in one SQL block
  const fullSQL = `
    -- Create table if it doesn't exist
    CREATE TABLE IF NOT EXISTS customer_priorities (
      tabc_permit_number VARCHAR(20) PRIMARY KEY,
      priority_score DECIMAL(5, 2),
      revenue_rank INTEGER,
      growth_rate DECIMAL(8, 4),
      last_activity_date DATE,
      last_updated TIMESTAMP DEFAULT NOW(),
      revenue_score DECIMAL(5,2),
      growth_score DECIMAL(5,2),
      recency_score DECIMAL(5,2),
      total_revenue DECIMAL(15,2),
      recent_revenue DECIMAL(15,2),
      activity_count INTEGER DEFAULT 0
    );

    -- Add columns if table already existed without them
    DO $$ BEGIN
      ALTER TABLE customer_priorities ADD COLUMN IF NOT EXISTS revenue_score DECIMAL(5,2);
      ALTER TABLE customer_priorities ADD COLUMN IF NOT EXISTS growth_score DECIMAL(5,2);
      ALTER TABLE customer_priorities ADD COLUMN IF NOT EXISTS recency_score DECIMAL(5,2);
      ALTER TABLE customer_priorities ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(15,2);
      ALTER TABLE customer_priorities ADD COLUMN IF NOT EXISTS recent_revenue DECIMAL(15,2);
      ALTER TABLE customer_priorities ADD COLUMN IF NOT EXISTS activity_count INTEGER DEFAULT 0;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END $$;

    -- Index for priority score lookups
    CREATE INDEX IF NOT EXISTS idx_priorities_score ON customer_priorities(priority_score DESC);
  `;

  console.log('  Attempting SQL execution via Supabase RPC...');
  const result = await execSQL(fullSQL);

  if (result.success) {
    console.log('  ✓ SQL executed successfully\n');
    console.log('✅ Migration complete.');
    return;
  }

  console.log(`  ⚠ Could not execute SQL via RPC: ${result.error}\n`);
  console.log('Please run this SQL manually in Supabase SQL Editor:\n');
  console.log('--- SQL (copy everything below) ---\n');
  console.log(fullSQL);
  console.log('\n--- END ---\n');
  console.log('After running the SQL, proceed to: npx tsx scripts/calculate-priorities.ts');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
