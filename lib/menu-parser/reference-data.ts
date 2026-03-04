/**
 * Reference Data for Menu Parsing
 * Canonical lists of varietals, appellations, formats, and other terms
 * used by the field extractor to identify structured fields from OCR text.
 *
 * Sourced from packages/ocr-engine/src/dictionary/beverage-dictionary.ts
 * (correction right-hand values = canonical terms).
 */

// ============================================
// Wine Varietals
// ============================================

export const WINE_VARIETALS = new Set([
  'cabernet sauvignon', 'cabernet', 'cab sauv',
  'pinot noir',
  'chardonnay',
  'sauvignon blanc',
  'merlot',
  'riesling',
  'zinfandel',
  'malbec',
  'syrah',
  'shiraz',
  'tempranillo',
  'gewurztraminer',
  'muscat',
  'moscato',
  'grenache',
  'viognier',
  'prosecco',
  'champagne',
  'rose', 'rosé',
  'pinot grigio', 'pinot gris',
  'chenin blanc',
  'gruner veltliner',
  'albarino', 'albariño',
  'vermentino',
  'trebbiano',
  'garganega',
  'grillo',
  'fiano',
  'falanghina',
  'greco',
  'aglianico',
  'sangiovese',
  'nebbiolo',
  'barbera',
  'dolcetto',
  'primitivo',
  'nero davola', "nero d'avola",
  'montepulciano',
  'corvina',
  'amarone',
  'silvaner',
  'muller thurgau', 'müller thurgau',
  'grauburgunder',
  'weissburgunder',
  'spatburgunder', 'spätburgunder',
  'dornfelder',
  'petite sirah',
  'mourvedre', 'mourvèdre',
  'carmenere', 'carménère',
  'petit verdot',
  'semillon', 'sémillon',
  'marsanne',
  'roussanne',
  'torrontes', 'torrontés',
  'gamay',
  'cinsault',
  'carignan',
]);

// ============================================
// Appellations / Regions
// ============================================

export const APPELLATIONS = new Set([
  // French
  'bordeaux', 'burgundy', 'bourgogne', 'champagne', 'loire valley', 'alsace',
  'provence', 'languedoc', 'roussillon', 'rhone valley', 'rhône valley',
  'cotes du rhone', 'côtes du rhône',
  'medoc', 'médoc', 'haut medoc', 'haut-médoc',
  'saint emilion', 'saint-émilion',
  'pomerol', 'pauillac', 'margaux', 'saint julien', 'saint-julien',
  'saint estephe', 'saint-estèphe',
  'graves', 'pessac leognan', 'pessac-léognan',
  'sauternes', 'barsac', 'entre deux mers', 'entre-deux-mers',
  'chablis', 'meursault', 'puligny montrachet', 'chassagne montrachet',
  'pommard', 'volnay', 'gevrey chambertin', 'nuits saint georges',
  'beaune', 'corton', 'beaujolais',
  'sancerre', 'pouilly fume', 'pouilly-fumé',
  'vouvray', 'muscadet', 'chinon', 'bourgueil',
  'chateauneuf du pape', 'châteauneuf-du-pape',
  'hermitage', 'crozes hermitage', 'crozes-hermitage',
  'cote rotie', 'côte-rôtie',
  'condrieu', 'saint joseph', 'saint-joseph',
  'gigondas', 'vacqueyras', 'bandol', 'cassis',

  // Italian
  'tuscany', 'toscana',
  'piedmont', 'piemonte',
  'veneto', 'sicily', 'sicilia',
  'puglia', 'campania',
  'friuli', 'friuli venezia giulia',
  'trentino', 'alto adige', 'trentino alto adige',
  'lombardy', 'lombardia',
  'emilia romagna',
  'umbria', 'marche', 'abruzzo',
  'sardinia', 'sardegna',
  'montalcino', 'brunello di montalcino',
  'bolgheri', 'franciacorta',
  'barolo', 'barbaresco',
  'chianti', 'chianti classico',
  'valpolicella', 'soave', 'asti',
  'orvieto', 'valdobbiadene', 'conegliano',

  // German
  'mosel', 'rheingau', 'pfalz', 'baden', 'franken',
  'nahe', 'rheinhessen', 'württemberg', 'wurttemberg',
  'ahr', 'sachsen', 'saale unstrut', 'mittelrhein',
  'hessische bergstrasse',

  // Spanish
  'rioja', 'ribera del duero', 'priorat',
  'rias baixas', 'rueda', 'navarra',
  'penedes', 'penedès', 'cava',
  'jerez', 'sherry',

  // US / New World
  'napa valley', 'napa', 'sonoma', 'sonoma coast',
  'paso robles', 'santa barbara', 'central coast',
  'russian river valley', 'alexander valley',
  'willamette valley', 'columbia valley',
  'marlborough', 'hawkes bay',
  'barossa valley', 'mclaren vale', 'hunter valley',
  'margaret river', 'yarra valley', 'eden valley',
  'mendoza', 'maipo valley', 'colchagua valley',
  'stellenbosch', 'swartland',
]);

// ============================================
// Format / Bottle Size
// ============================================

export const FORMAT_PATTERNS: Array<{ pattern: RegExp; normalized: string }> = [
  { pattern: /\b187\s*ml\b/i, normalized: '187ml' },
  { pattern: /\b375\s*ml\b/i, normalized: '375ml' },
  { pattern: /\bhalf\s*bottle\b/i, normalized: '375ml' },
  { pattern: /\b500\s*ml\b/i, normalized: '500ml' },
  { pattern: /\b750\s*ml\b/i, normalized: '750ml' },
  { pattern: /\b1\s*l(iter|itre)?\b/i, normalized: '1L' },
  { pattern: /\b1\.5\s*l(iter|itre)?\b/i, normalized: '1.5L' },
  { pattern: /\bmagnum\b/i, normalized: '1.5L' },
  { pattern: /\b3\s*l(iter|itre)?\b/i, normalized: '3L' },
  { pattern: /\bjeroboam\b/i, normalized: '3L' },
  { pattern: /\b6\s*l(iter|itre)?\b/i, normalized: '6L' },
  { pattern: /\bimperiale?\b/i, normalized: '6L' },
  { pattern: /\bcan\b/i, normalized: 'can' },
  { pattern: /\b12\s*oz\b/i, normalized: '12oz' },
  { pattern: /\b16\s*oz\b/i, normalized: '16oz' },
  { pattern: /\bpint\b/i, normalized: 'pint' },
];

// ============================================
// Sake Grades
// ============================================

export const SAKE_GRADES = new Set([
  'junmai daiginjo', 'daiginjo',
  'junmai ginjo', 'ginjo',
  'junmai', 'honjozo',
  'tokubetsu junmai', 'tokubetsu honjozo',
  'nigori', 'nama', 'genshu',
  'koshu', 'sparkling',
  'futsu', 'futsu-shu',
]);

// ============================================
// Beer Style Terms
// ============================================

export const BEER_STYLES = new Set([
  'ipa', 'double ipa', 'triple ipa', 'session ipa', 'west coast ipa',
  'new england ipa', 'neipa', 'hazy ipa',
  'pilsner', 'lager', 'stout', 'porter',
  'ale', 'pale ale', 'amber ale', 'brown ale', 'red ale',
  'hefeweizen', 'wheat', 'witbier', 'white ale',
  'blonde', 'blonde ale', 'golden ale',
  'saison', 'farmhouse',
  'sour', 'gose', 'berliner weisse',
  'belgian', 'belgian strong', 'dubbel', 'tripel', 'quad',
  'kolsch', 'kölsch',
  'dunkel', 'bock', 'doppelbock', 'maibock',
  'weiss', 'schwarzbier', 'marzen', 'märzen',
  'barleywine', 'scotch ale', 'wee heavy',
  'cream ale', 'fruit beer', 'radler', 'shandy',
]);

// ============================================
// Stop words for dedupe key
// ============================================

export const STOP_WORDS = new Set([
  'the', 'de', 'du', 'di', 'del', 'des', 'la', 'le', 'les',
  'un', 'une', 'el', 'los', 'las', 'a', 'an', 'and', 'or',
  'by', 'from', 'with', 'in', 'on', 'at', 'for', 'to',
]);
