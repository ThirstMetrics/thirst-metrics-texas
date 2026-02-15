/**
 * Mapbox Geocoding Data Layer
 * Provides address-to-coordinate conversion using Mapbox Geocoding API v6
 * with caching in Supabase location_coordinates table
 */

import { createServiceClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface GeocodedLocation {
  addressHash: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  geocodeProvider: 'mapbox';
  rawResponse: MapboxFeature;
}

export interface MapboxGeocodeResponse {
  type: 'FeatureCollection';
  features: MapboxFeature[];
  attribution: string;
}

export interface MapboxFeature {
  type: 'Feature';
  id: string;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  properties: {
    mapbox_id: string;
    feature_type: string;
    full_address?: string;
    name?: string;
    name_preferred?: string;
    place_formatted?: string;
    coordinates: {
      longitude: number;
      latitude: number;
      accuracy?: string;
      routable_points?: Array<{
        name: string;
        latitude: number;
        longitude: number;
      }>;
    };
    context?: {
      country?: MapboxContextItem;
      region?: MapboxContextItem;
      postcode?: MapboxContextItem;
      district?: MapboxContextItem;
      place?: MapboxContextItem;
      locality?: MapboxContextItem;
      neighborhood?: MapboxContextItem;
      address?: MapboxContextItem & {
        street_name?: string;
        address_number?: string;
      };
    };
    match_code?: {
      address_number: string;
      street: string;
      postcode: string;
      place: string;
      region: string;
      locality: string;
      country: string;
      confidence: string;
    };
  };
}

interface MapboxContextItem {
  mapbox_id: string;
  name: string;
  name_preferred?: string;
  wikidata_id?: string;
}

interface LocationCoordinatesRow {
  id: string;
  address_hash: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  geocode_provider: string;
  raw_response: MapboxFeature;
  created_at: string;
}

interface RateLimitState {
  requestCount: number;
  windowStart: number;
  retryAfter: number | null;
}

// ============================================================================
// Constants
// ============================================================================

const MAPBOX_GEOCODING_BASE_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const MAPBOX_BATCH_GEOCODING_BASE_URL = 'https://api.mapbox.com/search/geocode/v6/batch';

// Rate limiting: Mapbox allows 600 requests per minute for geocoding
const RATE_LIMIT_REQUESTS_PER_WINDOW = 600;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_DELAY_MS = 100; // Delay between requests to stay under limit

// Batch geocoding limits
const MAX_BATCH_SIZE = 50; // Mapbox batch limit

// Brand colors (for any UI components)
export const BRAND_COLORS = {
  primary: '#0d7377',
  primaryDark: '#042829',
} as const;

// ============================================================================
// Rate Limiting State
// ============================================================================

let rateLimitState: RateLimitState = {
  requestCount: 0,
  windowStart: Date.now(),
  retryAfter: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a consistent SHA-256 hash for an address string
 * Used as cache key in location_coordinates table
 */
export function hashAddress(address: string): string {
  // Normalize address: lowercase, trim, collapse whitespace
  const normalized = address.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get the Mapbox access token from environment
 */
function getMapboxToken(): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'Missing NEXT_PUBLIC_MAPBOX_TOKEN environment variable. ' +
      'Please add your Mapbox access token to .env.local'
    );
  }
  return token;
}

/**
 * Check and update rate limit state
 * Returns true if we should proceed, false if we need to wait
 */
async function checkRateLimit(): Promise<boolean> {
  const now = Date.now();

  // If we have a retry-after from a 429 response, check if it's passed
  if (rateLimitState.retryAfter !== null) {
    if (now < rateLimitState.retryAfter) {
      return false;
    }
    // Reset retry-after
    rateLimitState.retryAfter = null;
  }

  // Check if we're in a new window
  if (now - rateLimitState.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.requestCount = 0;
    rateLimitState.windowStart = now;
  }

  // Check if we've exceeded the limit
  if (rateLimitState.requestCount >= RATE_LIMIT_REQUESTS_PER_WINDOW) {
    return false;
  }

  return true;
}

/**
 * Wait for rate limit to reset
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();

  if (rateLimitState.retryAfter !== null) {
    const waitTime = rateLimitState.retryAfter - now;
    if (waitTime > 0) {
      await sleep(waitTime);
    }
    rateLimitState.retryAfter = null;
    rateLimitState.requestCount = 0;
    rateLimitState.windowStart = Date.now();
    return;
  }

  // Calculate time until window resets
  const windowElapsed = now - rateLimitState.windowStart;
  const waitTime = RATE_LIMIT_WINDOW_MS - windowElapsed;

  if (waitTime > 0) {
    await sleep(waitTime);
  }

  rateLimitState.requestCount = 0;
  rateLimitState.windowStart = Date.now();
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle rate limit response from Mapbox
 */
function handleRateLimitResponse(response: Response): void {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    // Retry-After can be seconds or an HTTP date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      rateLimitState.retryAfter = Date.now() + seconds * 1000;
    } else {
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        rateLimitState.retryAfter = date.getTime();
      }
    }
  } else {
    // Default: wait for the rest of the current window
    rateLimitState.retryAfter = rateLimitState.windowStart + RATE_LIMIT_WINDOW_MS;
  }
}

// ============================================================================
// Cache Functions
// ============================================================================

/**
 * Check cache for existing coordinates by address hash
 */
export async function getCachedCoordinates(
  addressHash: string
): Promise<GeocodedLocation | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('location_coordinates')
    .select('*')
    .eq('address_hash', addressHash)
    .single();

  if (error) {
    // PGRST116 means no rows returned, which is expected for cache miss
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error checking coordinates cache:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  const row = data as LocationCoordinatesRow;

  return {
    addressHash: row.address_hash,
    formattedAddress: row.formatted_address,
    latitude: row.latitude,
    longitude: row.longitude,
    geocodeProvider: row.geocode_provider as 'mapbox',
    rawResponse: row.raw_response,
  };
}

/**
 * Save geocoded coordinates to cache
 */
export async function saveCoordinates(result: GeocodedLocation): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.from('location_coordinates').upsert(
    {
      address_hash: result.addressHash,
      formatted_address: result.formattedAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      geocode_provider: result.geocodeProvider,
      raw_response: result.rawResponse,
    },
    {
      onConflict: 'address_hash',
      ignoreDuplicates: false,
    }
  );

  if (error) {
    console.error('Error saving coordinates to cache:', error);
    throw new Error(`Failed to save coordinates: ${error.message}`);
  }
}

/**
 * Bulk check cache for multiple address hashes
 * Returns a map of hash -> GeocodedLocation for found entries
 */
async function getCachedCoordinatesBulk(
  addressHashes: string[]
): Promise<Map<string, GeocodedLocation>> {
  const supabase = createServiceClient();
  const results = new Map<string, GeocodedLocation>();

  if (addressHashes.length === 0) {
    return results;
  }

  const { data, error } = await supabase
    .from('location_coordinates')
    .select('*')
    .in('address_hash', addressHashes);

  if (error) {
    console.error('Error bulk checking coordinates cache:', error);
    return results;
  }

  if (data) {
    for (const row of data as LocationCoordinatesRow[]) {
      results.set(row.address_hash, {
        addressHash: row.address_hash,
        formattedAddress: row.formatted_address,
        latitude: row.latitude,
        longitude: row.longitude,
        geocodeProvider: row.geocode_provider as 'mapbox',
        rawResponse: row.raw_response,
      });
    }
  }

  return results;
}

/**
 * Bulk save multiple geocoded coordinates to cache
 */
async function saveCoordinatesBulk(
  results: GeocodedLocation[]
): Promise<void> {
  if (results.length === 0) {
    return;
  }

  const supabase = createServiceClient();

  const rows = results.map((result) => ({
    address_hash: result.addressHash,
    formatted_address: result.formattedAddress,
    latitude: result.latitude,
    longitude: result.longitude,
    geocode_provider: result.geocodeProvider,
    raw_response: result.rawResponse,
  }));

  const { error } = await supabase.from('location_coordinates').upsert(rows, {
    onConflict: 'address_hash',
    ignoreDuplicates: false,
  });

  if (error) {
    console.error('Error bulk saving coordinates to cache:', error);
    throw new Error(`Failed to bulk save coordinates: ${error.message}`);
  }
}

// ============================================================================
// Geocoding Functions
// ============================================================================

/**
 * Geocode a single address using Mapbox Geocoding API v6
 * Returns cached result if available, otherwise fetches from API
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodedLocation | null> {
  const addressHash = hashAddress(address);

  // Check cache first
  const cached = await getCachedCoordinates(addressHash);
  if (cached) {
    return cached;
  }

  // Check rate limit
  while (!(await checkRateLimit())) {
    await waitForRateLimit();
  }

  // Make API request
  const token = getMapboxToken();
  const encodedAddress = encodeURIComponent(address);
  const url = `${MAPBOX_GEOCODING_BASE_URL}?q=${encodedAddress}&access_token=${token}&country=US&limit=1`;

  try {
    const response = await fetch(url);

    // Handle rate limiting
    if (response.status === 429) {
      handleRateLimitResponse(response);
      await waitForRateLimit();
      // Retry once after waiting
      return geocodeAddress(address);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Mapbox geocoding error: ${response.status} - ${errorText}`);
      return null;
    }

    // Increment request count
    rateLimitState.requestCount++;

    const data: MapboxGeocodeResponse = await response.json();

    if (!data.features || data.features.length === 0) {
      console.warn(`No geocoding results for address: ${address}`);
      return null;
    }

    const feature = data.features[0];
    const coords = feature.properties.coordinates;

    const result: GeocodedLocation = {
      addressHash,
      formattedAddress: feature.properties.full_address || address,
      latitude: coords.latitude,
      longitude: coords.longitude,
      geocodeProvider: 'mapbox',
      rawResponse: feature,
    };

    // Save to cache
    await saveCoordinates(result);

    // Small delay to respect rate limits
    await sleep(RATE_LIMIT_DELAY_MS);

    return result;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

/**
 * Batch geocode multiple addresses
 * Uses cache where available and batches API requests efficiently
 * Returns a map of original address -> GeocodedLocation
 */
export async function batchGeocodeAddresses(
  addresses: string[]
): Promise<Map<string, GeocodedLocation>> {
  const results = new Map<string, GeocodedLocation>();

  if (addresses.length === 0) {
    return results;
  }

  // Create hash -> original address mapping
  const hashToAddress = new Map<string, string>();
  const uniqueHashes: string[] = [];

  for (const address of addresses) {
    const hash = hashAddress(address);
    if (!hashToAddress.has(hash)) {
      hashToAddress.set(hash, address);
      uniqueHashes.push(hash);
    }
  }

  // Check cache for all addresses
  const cachedResults = await getCachedCoordinatesBulk(uniqueHashes);

  // Map cached results back to original addresses
  const uncachedAddresses: Array<{ address: string; hash: string }> = [];

  for (const [hash, address] of hashToAddress) {
    const cached = cachedResults.get(hash);
    if (cached) {
      results.set(address, cached);
    } else {
      uncachedAddresses.push({ address, hash });
    }
  }

  // If all addresses were cached, return early
  if (uncachedAddresses.length === 0) {
    return results;
  }

  // Process uncached addresses in batches
  const token = getMapboxToken();
  const newResults: GeocodedLocation[] = [];

  // Process in chunks of MAX_BATCH_SIZE
  for (let i = 0; i < uncachedAddresses.length; i += MAX_BATCH_SIZE) {
    const batch = uncachedAddresses.slice(i, i + MAX_BATCH_SIZE);

    // Check rate limit before each batch
    while (!(await checkRateLimit())) {
      await waitForRateLimit();
    }

    // For Mapbox v6 batch endpoint, we need to use individual requests
    // as batch endpoint requires specific format
    // Using sequential single requests with rate limiting
    for (const { address, hash } of batch) {
      // Check rate limit for each request
      while (!(await checkRateLimit())) {
        await waitForRateLimit();
      }

      const encodedAddress = encodeURIComponent(address);
      const url = `${MAPBOX_GEOCODING_BASE_URL}?q=${encodedAddress}&access_token=${token}&country=US&limit=1`;

      try {
        const response = await fetch(url);

        if (response.status === 429) {
          handleRateLimitResponse(response);
          await waitForRateLimit();
          // Decrement i to retry this address
          i--;
          continue;
        }

        if (!response.ok) {
          console.error(`Mapbox geocoding error for "${address}": ${response.status}`);
          continue;
        }

        rateLimitState.requestCount++;

        const data: MapboxGeocodeResponse = await response.json();

        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const coords = feature.properties.coordinates;

          const result: GeocodedLocation = {
            addressHash: hash,
            formattedAddress: feature.properties.full_address || address,
            latitude: coords.latitude,
            longitude: coords.longitude,
            geocodeProvider: 'mapbox',
            rawResponse: feature,
          };

          results.set(address, result);
          newResults.push(result);
        }

        // Small delay between requests
        await sleep(RATE_LIMIT_DELAY_MS);
      } catch (error) {
        console.error(`Error geocoding address "${address}":`, error);
      }
    }
  }

  // Bulk save all new results to cache
  if (newResults.length > 0) {
    await saveCoordinatesBulk(newResults);
  }

  return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get coordinates for an address, returning just lat/lng tuple
 * Convenience wrapper around geocodeAddress
 */
export async function getCoordinates(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const result = await geocodeAddress(address);
  if (!result) {
    return null;
  }
  return { lat: result.latitude, lng: result.longitude };
}

/**
 * Validate that an address can be geocoded
 * Returns true if coordinates can be found
 */
export async function validateAddress(address: string): Promise<boolean> {
  const result = await geocodeAddress(address);
  return result !== null;
}

/**
 * Get the formatted address from Mapbox for a given input
 * Useful for address standardization/normalization
 */
export async function normalizeAddress(address: string): Promise<string | null> {
  const result = await geocodeAddress(address);
  return result?.formattedAddress ?? null;
}

/**
 * Clear rate limit state (useful for testing)
 */
export function resetRateLimitState(): void {
  rateLimitState = {
    requestCount: 0,
    windowStart: Date.now(),
    retryAfter: null,
  };
}

/**
 * Get current rate limit status (useful for monitoring)
 */
export function getRateLimitStatus(): {
  requestsUsed: number;
  requestsRemaining: number;
  windowResetMs: number;
  isLimited: boolean;
} {
  const now = Date.now();
  const windowElapsed = now - rateLimitState.windowStart;
  const windowRemaining = Math.max(0, RATE_LIMIT_WINDOW_MS - windowElapsed);

  return {
    requestsUsed: rateLimitState.requestCount,
    requestsRemaining: Math.max(0, RATE_LIMIT_REQUESTS_PER_WINDOW - rateLimitState.requestCount),
    windowResetMs: windowRemaining,
    isLimited: rateLimitState.retryAfter !== null ||
               rateLimitState.requestCount >= RATE_LIMIT_REQUESTS_PER_WINDOW,
  };
}
