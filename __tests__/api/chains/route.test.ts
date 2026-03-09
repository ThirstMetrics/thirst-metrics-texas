/**
 * Tests for app/api/chains/route.ts
 * GET: Chain analytics with DuckDB aggregation
 */

import { NextRequest } from 'next/server';

const mockServerClient = vi.hoisted(() => {
  const qb: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } }, error: null,
      }),
    },
    from: vi.fn().mockReturnValue(qb),
    _qb: qb,
  };
});

const mockQuery = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn().mockReturnValue([]), set: vi.fn() }),
}));

vi.mock('@/lib/duckdb/connection', () => ({
  query: mockQuery,
}));

import { GET } from '@/app/api/chains/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/chains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
  });

  it('returns chain summaries from DuckDB', async () => {
    // First call: chain aggregation
    mockQuery.mockResolvedValueOnce([{
      ownership_group: "Chili's",
      location_count: 15,
      total_revenue: 500000,
      avg_revenue_per_location: 33333,
      recent_3mo_revenue: 100000,
      prior_3mo_revenue: 90000,
      growth_pct: 11.11,
      industry_segments: ['Restaurant'],
      grand_total_revenue: 2000000,
    }]);
    // Second call: top locations
    mockQuery.mockResolvedValueOnce([{
      tabc_permit_number: 'MB001',
      ownership_group: "Chili's",
      location_name: "Chili's Downtown",
      location_city: 'Dallas',
      total_revenue: 50000,
    }]);

    const res = await GET(makeRequest('/api/chains'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.chains).toHaveLength(1);
    expect(body.chains[0].ownership_group).toBe("Chili's");
    expect(body.chains[0].top_locations).toHaveLength(1);
    expect(body.total_chains).toBe(1);
    expect(body.total_chain_locations).toBe(15);
  });

  it('handles empty results', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const res = await GET(makeRequest('/api/chains'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chains).toEqual([]);
    expect(body.total_chains).toBe(0);
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'not authenticated' },
    });
    const res = await GET(makeRequest('/api/chains'));
    expect(res.status).toBe(401);
  });

  it('returns 500 on DuckDB error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DuckDB connection failed'));
    const res = await GET(makeRequest('/api/chains'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch chain analytics');
  });
});
