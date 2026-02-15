/**
 * Server-Side Tesseract OCR Wrapper
 * Runs OCR in Node.js environment (Next.js API routes)
 *
 * Uses a persistent Tesseract worker that pre-loads language data
 * so subsequent OCR calls are fast (~2-10s instead of 30-60s).
 */

import Tesseract from 'tesseract.js';
import path from 'path';
import { correctBeverageTerms, extractBeverageTerms } from './beverage-dictionary';

export interface OCRResult {
  success: boolean;
  rawText: string;
  correctedText: string;
  beverageTerms: string[];
  confidence: number;
  processingTimeMs: number;
  error?: string;
}

// ============================================
// Persistent Worker (singleton)
// ============================================

let workerInstance: Tesseract.Worker | null = null;
let workerInitializing: Promise<Tesseract.Worker> | null = null;

/**
 * Get or create a persistent Tesseract worker.
 * First call downloads lang data (~4MB) and initializes WASM.
 * Subsequent calls reuse the warm worker instantly.
 */
async function getWorker(): Promise<Tesseract.Worker> {
  if (workerInstance) {
    return workerInstance;
  }

  // Prevent multiple simultaneous initializations
  if (workerInitializing) {
    return workerInitializing;
  }

  workerInitializing = (async () => {
    console.log('[OCR] Initializing Tesseract worker (first-time setup, may take 15-30s)...');
    const startTime = Date.now();

    // Resolve absolute path to worker script (avoids Next.js webpack path rewriting)
    const workerPath = path.resolve(
      process.cwd(),
      'node_modules',
      'tesseract.js',
      'src',
      'worker-script',
      'node',
      'index.js'
    );
    console.log(`[OCR] Worker script path: ${workerPath}`);

    const worker = await Tesseract.createWorker('eng', undefined, {
      workerPath,
      logger: (m) => {
        if (m.status === 'recognizing text') return; // skip noisy progress logs
        console.log(`[OCR] ${m.status}: ${typeof m.progress === 'number' ? (m.progress * 100).toFixed(0) + '%' : ''}`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[OCR] Worker ready in ${elapsed}s`);

    workerInstance = worker;
    workerInitializing = null;
    return worker;
  })();

  return workerInitializing;
}

// ============================================
// Public API
// ============================================

/**
 * Process an image URL through Tesseract OCR
 * Fetches the image, runs OCR, and applies beverage dictionary corrections
 */
export async function processImageOCR(imageUrl: string): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    // Get the warm worker (or initialize on first call)
    const worker = await getWorker();

    // Fetch the image
    console.log('[OCR] Fetching image:', imageUrl.slice(0, 80) + '...');
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const imageData = Buffer.from(imageBuffer);
    console.log(`[OCR] Image fetched: ${(imageData.length / 1024).toFixed(0)}KB`);

    // Run Tesseract OCR using the persistent worker
    console.log('[OCR] Running recognition...');
    const result = await worker.recognize(imageData);

    const rawText = result.data.text?.trim() || '';
    const correctedText = correctBeverageTerms(rawText);
    const beverageTerms = extractBeverageTerms(correctedText);
    const confidence = result.data.confidence || 0;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`[OCR] Done in ${elapsed}s. Confidence: ${confidence.toFixed(0)}%, Text length: ${rawText.length}, Beverage terms: ${beverageTerms.length}`);

    return {
      success: true,
      rawText,
      correctedText,
      beverageTerms,
      confidence,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error('[OCR] Error processing image:', error);
    return {
      success: false,
      rawText: '',
      correctedText: '',
      beverageTerms: [],
      confidence: 0,
      processingTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown OCR error',
    };
  }
}

/**
 * Process a base64-encoded image through Tesseract OCR
 * Useful when image data is sent directly without URL
 */
export async function processBase64OCR(base64Data: string): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    const worker = await getWorker();

    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Clean, 'base64');

    // Run Tesseract OCR using the persistent worker
    const result = await worker.recognize(imageBuffer);

    const rawText = result.data.text?.trim() || '';
    const correctedText = correctBeverageTerms(rawText);
    const beverageTerms = extractBeverageTerms(correctedText);
    const confidence = result.data.confidence || 0;

    return {
      success: true,
      rawText,
      correctedText,
      beverageTerms,
      confidence,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error('[OCR] Error processing base64 image:', error);
    return {
      success: false,
      rawText: '',
      correctedText: '',
      beverageTerms: [],
      confidence: 0,
      processingTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown OCR error',
    };
  }
}

/**
 * Batch process multiple images
 * Processes sequentially to avoid memory issues
 */
export async function processMultipleImages(imageUrls: string[]): Promise<OCRResult[]> {
  const results: OCRResult[] = [];

  for (const url of imageUrls) {
    const result = await processImageOCR(url);
    results.push(result);
  }

  return results;
}

/**
 * Pre-warm the Tesseract worker.
 * Call this at app startup to avoid cold-start delay on first photo upload.
 */
export async function warmupWorker(): Promise<void> {
  try {
    await getWorker();
  } catch (error) {
    console.error('[OCR] Worker warmup failed:', error);
  }
}
