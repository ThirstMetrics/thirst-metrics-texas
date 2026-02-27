/**
 * @thirst-metrics/ocr-engine
 * Standalone OCR engine with beverage dictionary, word-level bounding boxes,
 * and spell correction with learning capability.
 */

// Pipeline (main entry point)
export { OCRPipeline } from './pipeline';

// Types
export type {
  BBox,
  OCRWord,
  OCRLine,
  OCRBlock,
  CorrectionRecord,
  DictionaryEntry,
  DictionaryStats,
  LearnedDictionaryEntry,
  OCRPipelineConfig,
  OCRPipelineResult,
  OCRResultCompat,
} from './types';

// Dictionary
export { DictionaryManager } from './dictionary/dictionary-manager';
export { BEVERAGE_TERMS, getBuiltInDictionary, getBuiltInEntryCount } from './dictionary/beverage-dictionary';

// Spell correction
export { SpellCorrector } from './spell-correction/corrector';
export { MultiWordMatcher } from './spell-correction/multi-word-matcher';

// Tesseract processor (low-level, for advanced usage)
export {
  processImage,
  processImageFromUrl,
  processBase64Image,
  warmup,
  rebuildCorrectedText,
} from './tesseract-processor';
