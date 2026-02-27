/**
 * OCR Pipeline Orchestrator
 * Coordinates: recognize → extract words → correct → structure output
 */

import type {
  OCRPipelineConfig,
  OCRPipelineResult,
  OCRResultCompat,
  LearnedDictionaryEntry,
} from './types';
import {
  processImage,
  processImageFromUrl,
  processBase64Image,
  rebuildCorrectedText,
  warmup as warmupProcessor,
} from './tesseract-processor';
import { DictionaryManager } from './dictionary/dictionary-manager';
import { SpellCorrector } from './spell-correction/corrector';

export class OCRPipeline {
  private dictManager: DictionaryManager;
  private corrector: SpellCorrector;
  private config: OCRPipelineConfig;

  constructor(config: OCRPipelineConfig = {}) {
    this.config = config;
    this.dictManager = new DictionaryManager();

    if (config.learnedEntries) {
      this.dictManager.mergeLearnedEntries(config.learnedEntries);
    }

    this.corrector = new SpellCorrector(this.dictManager.getAllEntries());
  }

  /** Update learned entries and rebuild the corrector */
  updateLearnedEntries(entries: LearnedDictionaryEntry[]): void {
    this.dictManager.mergeLearnedEntries(entries);
    this.corrector = new SpellCorrector(this.dictManager.getAllEntries());
  }

  /** Add a single learned entry at runtime */
  addLearnedEntry(mistake: string, correction: string): void {
    this.dictManager.addLearnedEntry(mistake, correction);
    this.corrector = new SpellCorrector(this.dictManager.getAllEntries());
  }

  /** Get dictionary stats */
  getDictionaryStats() {
    return this.dictManager.getStats();
  }

  /** Pre-warm the Tesseract worker */
  async warmup(): Promise<void> {
    await warmupProcessor({
      language: this.config.language,
      workerPath: this.config.workerPath,
      logger: this.config.logger,
    });
  }

  /** Process an image URL through the full pipeline */
  async processUrl(imageUrl: string): Promise<OCRPipelineResult> {
    const startTime = Date.now();
    const log = this.config.logger || ((msg: string) => console.log(`[OCR] ${msg}`));

    try {
      log(`Processing URL: ${imageUrl.slice(0, 80)}...`);

      // Step 1: Tesseract recognition with word-level data
      const result = await processImageFromUrl(imageUrl, {
        language: this.config.language,
        workerPath: this.config.workerPath,
        logger: this.config.logger,
      });

      // Step 2: Spell correction
      const corrections = this.corrector.correctWords(result.words);

      // Step 3: Rebuild line/block text from corrected words
      rebuildCorrectedText(result.words, result.lines, result.blocks);

      // Step 4: Build corrected full text
      const correctedText = result.blocks.map(b => b.correctedText).join('\n\n');

      // Step 5: Extract beverage terms
      const beverageTerms = this.extractBeverageTerms(correctedText);

      const processingTimeMs = Date.now() - startTime;
      log(`Done in ${(processingTimeMs / 1000).toFixed(1)}s. Confidence: ${result.confidence.toFixed(0)}%, Words: ${result.words.length}, Corrections: ${corrections.length}`);

      return {
        success: true,
        confidence: result.confidence,
        processingTimeMs,
        rawText: result.rawText,
        correctedText,
        beverageTerms,
        words: result.words,
        lines: result.lines,
        blocks: result.blocks,
        corrections,
        imageDimensions: result.imageDimensions,
      };
    } catch (error: any) {
      log(`Error: ${error.message}`);
      return {
        success: false,
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        rawText: '',
        correctedText: '',
        beverageTerms: [],
        words: [],
        lines: [],
        blocks: [],
        corrections: [],
        imageDimensions: { width: 0, height: 0 },
        error: error.message || 'Unknown OCR error',
      };
    }
  }

  /** Process a Buffer through the full pipeline */
  async processBuffer(imageData: Buffer): Promise<OCRPipelineResult> {
    const startTime = Date.now();
    const log = this.config.logger || ((msg: string) => console.log(`[OCR] ${msg}`));

    try {
      const result = await processImage(imageData, {
        language: this.config.language,
        workerPath: this.config.workerPath,
        logger: this.config.logger,
      });

      const corrections = this.corrector.correctWords(result.words);
      rebuildCorrectedText(result.words, result.lines, result.blocks);
      const correctedText = result.blocks.map(b => b.correctedText).join('\n\n');
      const beverageTerms = this.extractBeverageTerms(correctedText);
      const processingTimeMs = Date.now() - startTime;

      return {
        success: true,
        confidence: result.confidence,
        processingTimeMs,
        rawText: result.rawText,
        correctedText,
        beverageTerms,
        words: result.words,
        lines: result.lines,
        blocks: result.blocks,
        corrections,
        imageDimensions: result.imageDimensions,
      };
    } catch (error: any) {
      return {
        success: false,
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        rawText: '',
        correctedText: '',
        beverageTerms: [],
        words: [],
        lines: [],
        blocks: [],
        corrections: [],
        imageDimensions: { width: 0, height: 0 },
        error: error.message || 'Unknown OCR error',
      };
    }
  }

  /** Process a base64-encoded image through the full pipeline */
  async processBase64(base64Data: string): Promise<OCRPipelineResult> {
    const startTime = Date.now();

    try {
      const result = await processBase64Image(base64Data, {
        language: this.config.language,
        workerPath: this.config.workerPath,
        logger: this.config.logger,
      });

      const corrections = this.corrector.correctWords(result.words);
      rebuildCorrectedText(result.words, result.lines, result.blocks);
      const correctedText = result.blocks.map(b => b.correctedText).join('\n\n');
      const beverageTerms = this.extractBeverageTerms(correctedText);

      return {
        success: true,
        confidence: result.confidence,
        processingTimeMs: Date.now() - startTime,
        rawText: result.rawText,
        correctedText,
        beverageTerms,
        words: result.words,
        lines: result.lines,
        blocks: result.blocks,
        corrections,
        imageDimensions: result.imageDimensions,
      };
    } catch (error: any) {
      return {
        success: false,
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        rawText: '',
        correctedText: '',
        beverageTerms: [],
        words: [],
        lines: [],
        blocks: [],
        corrections: [],
        imageDimensions: { width: 0, height: 0 },
        error: error.message || 'Unknown OCR error',
      };
    }
  }

  /** Convert a full pipeline result to the legacy-compatible format */
  toCompat(result: OCRPipelineResult): OCRResultCompat {
    return {
      success: result.success,
      rawText: result.rawText,
      correctedText: result.correctedText,
      beverageTerms: result.beverageTerms,
      confidence: result.confidence,
      processingTimeMs: result.processingTimeMs,
      error: result.error,
    };
  }

  /** Extract recognized beverage terms from corrected text */
  private extractBeverageTerms(text: string): string[] {
    if (!text) return [];

    const lower = text.toLowerCase();
    const found: Set<string> = new Set();
    const allTerms = this.dictManager.getAllCorrectionValues();

    for (const term of allTerms) {
      // Use word boundary check for single words, includes for multi-word
      if (term.includes(' ')) {
        if (lower.includes(term)) found.add(term);
      } else {
        const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (pattern.test(lower)) found.add(term);
      }
    }

    return Array.from(found).sort();
  }
}
