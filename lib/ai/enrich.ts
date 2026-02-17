/**
 * AI Enrichment Module
 * Uses Claude API to suggest clean DBA names, ownership groups, and industry segments
 * for Texas liquor-licensed locations.
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================
// Types
// ============================================

export interface LocationForEnrichment {
  tabc_permit_number: string;
  location_name: string;
  location_address: string;
  location_city: string;
  location_county: string;
  location_zip: string;
  total_revenue: number;
}

export interface AIEnrichmentResult {
  tabc_permit_number: string;
  suggested_dba_name: string;
  suggested_ownership_group: string;
  suggested_industry_segment: string;
  confidence: number;
  reasoning: string;
}

// ============================================
// Constants
// ============================================

export const INDUSTRY_SEGMENTS = [
  'Restaurant',
  'Bar/Nightclub',
  'Hotel',
  'Country Club',
  'Catering',
  'Convenience Store',
  'Grocery',
  'Liquor Store',
  'Sports Venue',
  'Entertainment Venue',
  'Private Club',
  'Other',
] as const;

export type IndustrySegment = typeof INDUSTRY_SEGMENTS[number];

const SYSTEM_PROMPT = `You are a Texas beverage industry expert helping classify liquor-licensed establishments.

For each location, analyze the raw name, address, city, county, and revenue to determine:

1. **clean_dba_name**: The clean "doing business as" name.
   - Remove legal suffixes (LLC, Inc, Corp, LTD, LP, etc.)
   - Fix capitalization (title case, but keep common acronyms like BBQ, HEB)
   - Standardize punctuation and spacing
   - Remove trailing numbers that are just store IDs unless they're part of the brand
   - Example: "CHILIS GRILL AND BAR #1234" → "Chili's Grill & Bar"
   - Example: "WAL MART STORES INC #5432" → "Walmart"
   - Example: "7 ELEVEN INC" → "7-Eleven"

2. **ownership_group**: The parent company or chain if recognizable.
   - For chains: use the parent company name (e.g., "Brinker International" for Chili's)
   - For independent/local businesses: use "Independent"
   - For unclear cases: use "Unknown"
   - Example: "APPLEBEES" → "Dine Brands"
   - Example: "JOES BAR AND GRILL" → "Independent"

3. **industry_segment**: Classify into exactly one of these categories:
   - Restaurant
   - Bar/Nightclub
   - Hotel
   - Country Club
   - Catering
   - Convenience Store
   - Grocery
   - Liquor Store
   - Sports Venue
   - Entertainment Venue
   - Private Club
   - Other

4. **confidence**: A score from 0.0 to 1.0 indicating your confidence in the classification.
   - 0.9-1.0: Very confident (well-known chain, clear name)
   - 0.7-0.89: Fairly confident (likely correct based on name/context)
   - 0.5-0.69: Moderate confidence (educated guess)
   - Below 0.5: Low confidence (unclear, could be multiple things)

5. **reasoning**: A brief explanation (1-2 sentences) of why you made these choices.

Respond with a JSON array. Each element must have these exact fields:
- tabc_permit_number (string)
- suggested_dba_name (string)
- suggested_ownership_group (string)
- suggested_industry_segment (string, must be one of the categories listed above)
- confidence (number, 0.0 to 1.0)
- reasoning (string)`;

// ============================================
// Client
// ============================================

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ============================================
// Core Function
// ============================================

/**
 * Enrich locations with AI suggestions using Claude API.
 * Batches up to 20 locations per API call.
 */
export async function enrichLocationsWithAI(
  locations: LocationForEnrichment[]
): Promise<AIEnrichmentResult[]> {
  if (locations.length === 0) return [];

  const BATCH_SIZE = 20;
  const allResults: AIEnrichmentResult[] = [];

  // Process in batches of 20
  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const batch = locations.slice(i, i + BATCH_SIZE);
    const batchResults = await enrichBatch(batch);
    allResults.push(...batchResults);
  }

  return allResults;
}

/**
 * Process a single batch of locations (max 20) through Claude API.
 */
async function enrichBatch(
  locations: LocationForEnrichment[]
): Promise<AIEnrichmentResult[]> {
  const client = getClient();

  // Format locations for the prompt
  const locationList = locations.map((loc, idx) => {
    const revenue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(loc.total_revenue);

    return [
      `${idx + 1}. Permit: ${loc.tabc_permit_number}`,
      `   Name: ${loc.location_name}`,
      `   Address: ${loc.location_address}, ${loc.location_city}, TX ${loc.location_zip}`,
      `   County: ${loc.location_county}`,
      `   Total Revenue: ${revenue}`,
    ].join('\n');
  }).join('\n\n');

  const userPrompt = `Please analyze and classify the following ${locations.length} Texas liquor-licensed location(s):\n\n${locationList}\n\nRespond with a JSON array containing one object per location.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    // Extract text content from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonText = textBlock.text.trim();

    // Remove markdown code block wrapper if present
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const results: AIEnrichmentResult[] = JSON.parse(jsonText);

    // Validate and sanitize results
    return results.map(result => ({
      tabc_permit_number: result.tabc_permit_number,
      suggested_dba_name: result.suggested_dba_name || '',
      suggested_ownership_group: result.suggested_ownership_group || 'Unknown',
      suggested_industry_segment: INDUSTRY_SEGMENTS.includes(result.suggested_industry_segment as IndustrySegment)
        ? result.suggested_industry_segment
        : 'Other',
      confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.5)),
      reasoning: result.reasoning || '',
    }));
  } catch (error: any) {
    console.error('[AI Enrich] Claude API error:', error?.message ?? error);

    // On failure, return empty results for the batch rather than crashing
    // The UI will show these as "AI enrichment failed" and allow manual entry
    if (error?.message?.includes('JSON')) {
      console.error('[AI Enrich] Failed to parse Claude response as JSON');
    }

    throw new Error(`AI enrichment failed: ${error?.message || 'Unknown error'}`);
  }
}
