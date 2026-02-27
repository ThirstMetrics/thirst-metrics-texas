/**
 * Server-Side OCR Wrapper
 * Delegates to @thirst-metrics/ocr-engine OCRPipeline.
 *
 * All existing exports are preserved for backward compatibility.
 */

import { OCRPipeline } from '@thirst-metrics/ocr-engine';
import type { OCRResultCompat } from '@thirst-metrics/ocr-engine';

export interface OCRResult {
  success: boolean;
  rawText: string;
  correctedText: string;
  beverageTerms: string[];
  confidence: number;
  processingTimeMs: number;
  error?: string;
}

let pipeline: OCRPipeline | null = null;

function getPipeline(): OCRPipeline {
  if (!pipeline) {
    pipeline = new OCRPipeline();
  }
  return pipeline;
}

export async function processImageOCR(imageUrl: string): Promise<OCRResult> {
  const p = getPipeline();
  const result = await p.processUrl(imageUrl);
  return p.toCompat(result);
}

export async function processBase64OCR(base64Data: string): Promise<OCRResult> {
  const p = getPipeline();
  const result = await p.processBase64(base64Data);
  return p.toCompat(result);
}

export async function processMultipleImages(imageUrls: string[]): Promise<OCRResult[]> {
  const results: OCRResult[] = [];
  for (const url of imageUrls) {
    results.push(await processImageOCR(url));
  }
  return results;
}

export async function warmupWorker(): Promise<void> {
  const p = getPipeline();
  await p.warmup();
}
