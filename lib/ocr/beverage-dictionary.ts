/**
 * Beverage Dictionary for OCR Post-Processing
 * Corrects common OCR mistakes in beverage industry terms.
 *
 * OCR commonly confuses:
 * - 1 ↔ l, I, i
 * - 0 ↔ O, o
 * - 5 ↔ S, s
 * - 7 ↔ T
 * - 8 ↔ B
 *
 * This dictionary maps common OCR errors to correct terms.
 * Expandable as users encounter new mistakes during beta.
 */

// Common OCR mistakes → correct beverage terms (lowercase for matching)
const beverageTerms: Record<string, string> = {
  // ============ SPIRITS - MAJOR BRANDS ============
  // Whiskey/Bourbon
  'jack danie1s': 'jack daniels',
  'jack danie15': 'jack daniels',
  'jim 8eam': 'jim beam',
  'jim beam': 'jim beam',
  'maker5 mark': 'makers mark',
  'makers mark': 'makers mark',
  'wi1d turkey': 'wild turkey',
  'wild turkey': 'wild turkey',
  'bu11eit': 'bulleit',
  'bul1eit': 'bulleit',
  'woodford re5erve': 'woodford reserve',
  'knob creek': 'knob creek',
  'kn0b creek': 'knob creek',
  'e1ijah craig': 'elijah craig',
  'evan wi11iams': 'evan williams',
  'heaven hi11': 'heaven hill',
  'four r0ses': 'four roses',
  'f0ur roses': 'four roses',
  'george dick1e': 'george dickel',
  'george dicke1': 'george dickel',

  // Vodka
  'grey g00se': 'grey goose',
  'grey go0se': 'grey goose',
  'abso1ut': 'absolut',
  'abs0lut': 'absolut',
  'tit0s': 'titos',
  'tit05': 'titos',
  "tito's": 'titos',
  'smir0ff': 'smirnoff',
  'smirn0ff': 'smirnoff',
  'be1vedere': 'belvedere',
  'ciroc': 'ciroc',
  'cir0c': 'ciroc',
  'ketel 0ne': 'ketel one',
  'kete1 one': 'ketel one',
  'skyy': 'skyy',
  '5kyy': 'skyy',
  'new amsterdam': 'new amsterdam',
  'deep eddy': 'deep eddy',
  'deep eddey': 'deep eddy',
  'dripping springs': 'dripping springs',

  // Tequila (Spanish terms common in TX)
  'tequi1a': 'tequila',
  'tequ1la': 'tequila',
  'patron': 'patron',
  'patr0n': 'patron',
  'don ju1io': 'don julio',
  'don juli0': 'don julio',
  'casamig0s': 'casamigos',
  'c1ase azul': 'clase azul',
  'clase azu1': 'clase azul',
  'herradura': 'herradura',
  '1800': '1800',
  'jose cuerv0': 'jose cuervo',
  'jose cuervo': 'jose cuervo',
  'espo1on': 'espolon',
  'espol0n': 'espolon',
  'hornit0s': 'hornitos',
  'e1 jimador': 'el jimador',
  'milagr0': 'milagro',
  'avion': 'avion',
  'avi0n': 'avion',
  'corralej0': 'corralejo',
  'forta1eza': 'fortaleza',
  'tapati0': 'tapatio',

  // Mezcal
  'mezca1': 'mezcal',
  'mezc4l': 'mezcal',
  '400 c0nejos': '400 conejos',
  'de1 maguey': 'del maguey',
  'del magey': 'del maguey',
  'i1egal': 'ilegal',
  'montelobos': 'montelobos',
  'monte1obos': 'montelobos',

  // Cognac/Brandy
  'henness7': 'hennessy',
  'hennessy': 'hennessy',
  'hennes5y': 'hennessy',
  'remy martin': 'remy martin',
  'rem7 martin': 'remy martin',
  'courvois1er': 'courvoisier',
  'courv0isier': 'courvoisier',
  'mart3ll': 'martell',
  'marte11': 'martell',

  // Rum
  'bacardi': 'bacardi',
  '8acardi': 'bacardi',
  'captain m0rgan': 'captain morgan',
  'captain morgan': 'captain morgan',
  'ma1ibu': 'malibu',
  'malibu': 'malibu',
  'havana c1ub': 'havana club',
  'kraken': 'kraken',
  'sailor jerry': 'sailor jerry',
  'sai1or jerry': 'sailor jerry',
  'diplomatico': 'diplomatico',
  'dipl0matico': 'diplomatico',
  'z4capa': 'zacapa',

  // Gin
  'tanqueray': 'tanqueray',
  'tanquera7': 'tanqueray',
  'bomb4y': 'bombay',
  '8ombay': 'bombay',
  'bombay sapphire': 'bombay sapphire',
  'hend1cks': 'hendricks',
  'hendrick5': 'hendricks',
  "hendrick's": 'hendricks',
  'beef3ater': 'beefeater',
  'beefeat3r': 'beefeater',
  'aviation': 'aviation',
  'aviati0n': 'aviation',

  // Scotch
  'johnnie wa1ker': 'johnnie walker',
  'j0hnnie walker': 'johnnie walker',
  'g1enfiddich': 'glenfiddich',
  'glenf1ddich': 'glenfiddich',
  'g1enlivet': 'glenlivet',
  'macal1an': 'macallan',
  'maca1lan': 'macallan',
  '1aphroaig': 'laphroaig',
  'laphro4ig': 'laphroaig',
  'ta1isker': 'talisker',
  'chivas rega1': 'chivas regal',
  'dewar5': 'dewars',

  // Liqueurs
  'kai1ua': 'kahlua',
  'kah1ua': 'kahlua',
  'bai1eys': 'baileys',
  'bai1ey5': 'baileys',
  'grand marn1er': 'grand marnier',
  'c0intreau': 'cointreau',
  'ama1etto': 'amaretto',
  'j4germeister': 'jagermeister',
  'jager': 'jager',
  'f1reball': 'fireball',
  'fire8all': 'fireball',
  'chamb0rd': 'chambord',
  'frange1ico': 'frangelico',

  // ============ WINE - VARIETALS ============
  'cabernet sauv1gnon': 'cabernet sauvignon',
  'cabernet sauvign0n': 'cabernet sauvignon',
  'p1not noir': 'pinot noir',
  'pin0t noir': 'pinot noir',
  'pinot n0ir': 'pinot noir',
  'chardonna7': 'chardonnay',
  'chardonn4y': 'chardonnay',
  'chardonnay': 'chardonnay',
  'sauv1gnon blanc': 'sauvignon blanc',
  'sauvign0n blanc': 'sauvignon blanc',
  'mer1ot': 'merlot',
  'merl0t': 'merlot',
  'riesl1ng': 'riesling',
  'ries1ing': 'riesling',
  'z1nfandel': 'zinfandel',
  'zinfande1': 'zinfandel',
  'ma1bec': 'malbec',
  'malb3c': 'malbec',
  'syrah': 'syrah',
  '5yrah': 'syrah',
  'shiraz': 'shiraz',
  '5hiraz': 'shiraz',
  'temprani11o': 'tempranillo',
  'tempranill0': 'tempranillo',
  'sangiovese': 'sangiovese',
  'sangi0vese': 'sangiovese',
  'gew0rztraminer': 'gewurztraminer',
  'gewurztram1ner': 'gewurztraminer',
  'muscat': 'muscat',
  'mu5cat': 'muscat',
  'moscato': 'moscato',
  'moscat0': 'moscato',
  'grenache': 'grenache',
  'gr3nache': 'grenache',
  'viognier': 'viognier',
  'vi0gnier': 'viognier',
  'prosecco': 'prosecco',
  'pr0secco': 'prosecco',
  'champagne': 'champagne',
  'champ4gne': 'champagne',
  'ros3': 'rose',
  'r0se': 'rose',

  // Wine Brands
  'ste11a rosa': 'stella rosa',
  'stel1a rosa': 'stella rosa',
  'apothic': 'apothic',
  'ap0thic': 'apothic',
  'josh': 'josh',
  'j0sh': 'josh',
  'meiom1': 'meiomi',
  'mei0mi': 'meiomi',
  'kendall-jacks0n': 'kendall-jackson',
  'kenda11 jackson': 'kendall-jackson',
  'barefo0t': 'barefoot',
  'baref0ot': 'barefoot',
  'cupcake': 'cupcake',
  'blackst0ne': 'blackstone',
  'b1ackstone': 'blackstone',
  '19 crimes': '19 crimes',
  'caymus': 'caymus',
  'c4ymus': 'caymus',
  'opus 0ne': 'opus one',
  '0pus one': 'opus one',
  'silver 0ak': 'silver oak',
  'si1ver oak': 'silver oak',

  // ============ BEER - STYLES ============
  '1pa': 'ipa',
  'ip4': 'ipa',
  'p1lsner': 'pilsner',
  'pi1sner': 'pilsner',
  '1ager': 'lager',
  'lag3r': 'lager',
  'st0ut': 'stout',
  '5tout': 'stout',
  'p0rter': 'porter',
  'port3r': 'porter',
  'a1e': 'ale',
  'pa1e ale': 'pale ale',
  'hefe': 'hefe',
  'hefewe1zen': 'hefeweizen',
  'hef3weizen': 'hefeweizen',
  'wheat': 'wheat',
  'wh3at': 'wheat',
  'b1onde': 'blonde',
  'bl0nde': 'blonde',
  'amber': 'amber',
  '4mber': 'amber',
  'brown a1e': 'brown ale',
  'saison': 'saison',
  'sais0n': 'saison',
  'sour': 'sour',
  's0ur': 'sour',
  'gose': 'gose',
  'g0se': 'gose',
  'belgian': 'belgian',
  'be1gian': 'belgian',
  'ko1sch': 'kolsch',
  'kolsch': 'kolsch',
  'dunk3l': 'dunkel',
  'dunke1': 'dunkel',
  'b0ck': 'bock',
  'doppe1bock': 'doppelbock',
  'dopp3lbock': 'doppelbock',
  'ma1zbock': 'maibock',
  'we1ss': 'weiss',
  'wei55': 'weiss',

  // Beer Brands
  'bud 1ight': 'bud light',
  'bud l1ght': 'bud light',
  'budwe1ser': 'budweiser',
  'budweis3r': 'budweiser',
  'mi11er lite': 'miller lite',
  'mil1er lite': 'miller lite',
  'c00rs light': 'coors light',
  'coor5 light': 'coors light',
  'corona': 'corona',
  'cor0na': 'corona',
  'mode1o': 'modelo',
  'model0': 'modelo',
  'dos equis': 'dos equis',
  'd0s equis': 'dos equis',
  'heineken': 'heineken',
  'hein3ken': 'heineken',
  'ste11a artois': 'stella artois',
  'stel1a artois': 'stella artois',
  'gu1nness': 'guinness',
  'guinne55': 'guinness',
  'blue m00n': 'blue moon',
  'b1ue moon': 'blue moon',
  'sam adams': 'sam adams',
  's4m adams': 'sam adams',
  'samu3l adams': 'samuel adams',
  'shi0r bock': 'shiner bock',
  'shiner b0ck': 'shiner bock',
  'saint arn01d': 'saint arnold',
  'st. arn0ld': 'st. arnold',
  'karbach': 'karbach',
  'karb4ch': 'karbach',
  'z1egenbock': 'ziegenbock',
  'ziegenb0ck': 'ziegenbock',
  '1one star': 'lone star',
  'l0ne star': 'lone star',
  'deep e11um': 'deep ellum',
  'deep el1um': 'deep ellum',
  'revolver': 'revolver',
  'rev01ver': 'revolver',

  // ============ GENERAL TERMS ============
  'w1ne': 'wine',
  'win3': 'wine',
  'sp1rits': 'spirits',
  'spirit5': 'spirits',
  'l1quor': 'liquor',
  'liqu0r': 'liquor',
  'b3er': 'beer',
  'be3r': 'beer',
  'cocktai1': 'cocktail',
  'c0cktail': 'cocktail',
  'b0ttle': 'bottle',
  'bott1e': 'bottle',
  'g1ass': 'glass',
  'gla55': 'glass',
  'draft': 'draft',
  'dr4ft': 'draft',
  'on tap': 'on tap',
  '0n tap': 'on tap',
  'we11': 'well',
  'wel1': 'well',
  'premi0m': 'premium',
  'prem1um': 'premium',
  'top she1f': 'top shelf',
  't0p shelf': 'top shelf',
  'happy h0ur': 'happy hour',
  'happ7 hour': 'happy hour',
  'spec1al': 'special',
  'specia1': 'special',
  'pr1ce': 'price',
  'pric3': 'price',

  // ABV / Proof
  'ab0': 'abv',
  'a8v': 'abv',
  'pr00f': 'proof',
  'pro0f': 'proof',

  // Spanish terms (common in TX beverage menus)
  'cerve2a': 'cerveza',
  'c3rveza': 'cerveza',
  'vin0': 'vino',
  'v1no': 'vino',
  'blanco': 'blanco',
  'b1anco': 'blanco',
  'reposado': 'reposado',
  'rep0sado': 'reposado',
  'anejo': 'anejo',
  'anej0': 'anejo',
  'extra anejo': 'extra anejo',
  'joven': 'joven',
  'j0ven': 'joven',
  'oro': 'oro',
  '0ro': 'oro',
  'p1ata': 'plata',
  'plata': 'plata',
  's1lver': 'silver',
  'cristal1no': 'cristalino',

  // French wine terms
  'ch4teau': 'chateau',
  'chat3au': 'chateau',
  'domaine': 'domaine',
  'dom4ine': 'domaine',
  'cru': 'cru',
  'b1anc': 'blanc',
  'blanc de b1ancs': 'blanc de blancs',
  'r0uge': 'rouge',
  'brut': 'brut',
  '8rut': 'brut',

  // Italian wine terms
  'r0sso': 'rosso',
  'ross0': 'rosso',
  'b1anco': 'bianco',
  'riserva': 'riserva',
  'r1serva': 'riserva',
  'superiore': 'superiore',
  'superi0re': 'superiore',
  'c1assico': 'classico',
};

/**
 * Correct common OCR mistakes in beverage industry text
 * Uses case-insensitive matching but preserves original case structure
 */
export function correctBeverageTerms(rawText: string): string {
  if (!rawText) return rawText;

  let corrected = rawText;

  // Build regex patterns for each term (case-insensitive word boundary matching)
  for (const [mistake, correction] of Object.entries(beverageTerms)) {
    // Escape special regex characters in the mistake pattern
    const escaped = mistake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Create word boundary pattern for case-insensitive matching
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');

    corrected = corrected.replace(pattern, (match) => {
      // Preserve case: if original was uppercase, return uppercase correction
      if (match === match.toUpperCase()) {
        return correction.toUpperCase();
      }
      // If title case, return title case
      if (match[0] === match[0].toUpperCase()) {
        return correction.charAt(0).toUpperCase() + correction.slice(1);
      }
      // Otherwise return lowercase
      return correction;
    });
  }

  return corrected;
}

/**
 * Extract beverage-related terms from OCR text
 * Useful for indexing and search
 */
export function extractBeverageTerms(text: string): string[] {
  if (!text) return [];

  const corrected = correctBeverageTerms(text.toLowerCase());
  const found: Set<string> = new Set();

  // Check for known terms
  const allTerms = new Set([...Object.values(beverageTerms)]);

  for (const term of allTerms) {
    if (corrected.includes(term)) {
      found.add(term);
    }
  }

  return Array.from(found).sort();
}

/**
 * Get the beverage dictionary for admin/debugging
 */
export function getBeverageDictionary(): Record<string, string> {
  return { ...beverageTerms };
}

/**
 * Add a new term to the dictionary at runtime
 * (For future admin interface to expand dictionary)
 */
export function addBeverageTerm(mistake: string, correction: string): void {
  beverageTerms[mistake.toLowerCase()] = correction.toLowerCase();
}
