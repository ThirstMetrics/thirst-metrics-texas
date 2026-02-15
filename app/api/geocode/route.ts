/**
 * Geocode API Route
 * Single address geocoding endpoint
 *
 * POST /api/geocode
 * Body: { address: string }
 * Returns: { coordinates: { lat, lng }, formatted_address, cached: boolean }
 */

import { NextResponse } from 'next/server';
import {
  geocodeAddress,
  hashAddress,
  getCachedCoordinates,
} from '@/lib/mapbox/geocode';

// Types for request/response
interface GeocodeRequestBody {
  address: string;
}

interface GeocodeResponseData {
  coordinates: {
    lat: number;
    lng: number;
  };
  formatted_address: string;
  cached: boolean;
}

interface GeocodeErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

/**
 * POST /api/geocode
 * Geocode a single address
 */
export async function POST(request: Request): Promise<NextResponse<GeocodeResponseData | GeocodeErrorResponse>> {
  try {
    // Parse request body
    const body = await request.json() as GeocodeRequestBody;

    // Validate required fields
    if (!body.address || typeof body.address !== 'string') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Address is required and must be a string' },
        { status: 400 }
      );
    }

    const address = body.address.trim();

    if (address.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Address cannot be empty' },
        { status: 400 }
      );
    }

    if (address.length > 500) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Address is too long (max 500 characters)' },
        { status: 400 }
      );
    }

    // Check cache first to determine if result is cached
    const addressHash = hashAddress(address);
    const cachedResult = await getCachedCoordinates(addressHash);
    const wasCached = cachedResult !== null;

    // Get coordinates (will use cache if available, otherwise fetch from Mapbox)
    const result = await geocodeAddress(address);

    if (!result) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Unable to geocode the provided address' },
        { status: 404 }
      );
    }

    const response: GeocodeResponseData = {
      coordinates: {
        lat: result.latitude,
        lng: result.longitude,
      },
      formatted_address: result.formattedAddress,
      cached: wasCached,
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[API Geocode] Error:', errorMessage);
    console.error('[API Geocode] Stack:', errorStack);

    // Check for specific error types
    if (errorMessage.includes('MAPBOX') || errorMessage.includes('Mapbox')) {
      return NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'Geocoding service is currently unavailable',
          details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred while geocoding',
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/geocode
 * Return method not allowed - geocoding should be POST only
 */
export async function GET(): Promise<NextResponse<GeocodeErrorResponse>> {
  return NextResponse.json(
    {
      error: 'Method Not Allowed',
      message: 'Use POST method with { address: string } body',
    },
    { status: 405 }
  );
}
