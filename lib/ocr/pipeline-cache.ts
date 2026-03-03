/**
 * OCR Pipeline Singleton Cache
 * Shared module for managing the singleton OCR pipeline instance.
 * Both the main /api/ocr route and the /api/admin/ocr/learned route
 * import from here so the pipeline can be invalidated when learned
 * dictionary entries change.
 */

import { createClient } from '@supabase/supabase-js';
import { OCRPipeline } from '@thirst-metrics/ocr-engine';
import type { LearnedDictionaryEntry } from '@thirst-metrics/ocr-engine';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Singleton pipeline instance, lazy-initialized with learned entries from DB */
let pipeline: OCRPipeline | null = null;

/**
 * Get or create the singleton OCR pipeline.
 * Loads learned dictionary entries from the ocr_learned_dictionary table on first call.
 */
export async function getPipeline(): Promise<OCRPipeline> {
  if (pipeline) return pipeline;

  const { data: learnedRows } = await supabaseAdmin
    .from('ocr_learned_dictionary')
    .select('mistake_text, correction_text, confirmation_count, is_active')
    .eq('is_active', true);

  const learnedEntries: LearnedDictionaryEntry[] = (learnedRows || []).map(row => ({
    mistakeText: row.mistake_text,
    correctionText: row.correction_text,
    confirmationCount: row.confirmation_count,
    isActive: row.is_active,
  }));

  pipeline = new OCRPipeline({ learnedEntries });
  return pipeline;
}

/**
 * Invalidate the cached pipeline so it reloads learned entries on next use.
 * Called when the learned dictionary is updated.
 */
export function invalidatePipeline(): void {
  pipeline = null;
}
