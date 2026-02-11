/**
 * Server-Side Tesseract OCR Wrapper
 * Runs OCR in Node.js environment (Next.js API routes)
 *
 * Uses tesseract.js which works in both browser and Node.js
 */

import Tesseract from 'tesseract.js';
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

/**
 * Process an image URL through Tesseract OCR
 * Fetches the image, runs OCR, and applies beverage dictionary corrections
 */
export async function processImageOCR(imageUrl: string): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const imageData = Buffer.from(imageBuffer);

    // Run Tesseract OCR
    const result = await Tesseract.recognize(imageData, 'eng', {
      logger: (m) => {
        // Log progress for debugging (optional)
        if (m.status === 'recognizing text') {
          console.log(`[OCR] Progress: ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });

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
    // Remove data URL prefix if present
    const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Clean, 'base64');

    // Run Tesseract OCR
    const result = await Tesseract.recognize(imageBuffer, 'eng');

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
