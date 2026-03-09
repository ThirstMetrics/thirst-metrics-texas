/**
 * Tests for lib/data/priorities.ts
 * Priority scoring helpers (pure functions + Supabase-backed)
 */

const mockClient = vi.hoisted(() => {
  const qb: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((resolve: any) => resolve({ data: null, error: null })),
  };
  return { from: vi.fn().mockReturnValue(qb), _qb: qb };
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue(mockClient),
}));

vi.mock('@/lib/duckdb/connection', () => ({
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue(null),
}));

import {
  scoreToTier, computeComposite, getCustomerPriority, SCORING_MODES,
} from '@/lib/data/priorities';

describe('scoreToTier', () => {
  it('maps scores to correct tiers', () => {
    expect(scoreToTier(95)).toBe('top25');
    expect(scoreToTier(80)).toBe('top25');
    expect(scoreToTier(70)).toBe('top50');
    expect(scoreToTier(60)).toBe('top50');
    expect(scoreToTier(50)).toBe('top60');
    expect(scoreToTier(45)).toBe('top60');
    expect(scoreToTier(30)).toBe('top80');
    expect(scoreToTier(25)).toBe('top80');
    expect(scoreToTier(10)).toBe('bottom20');
    expect(scoreToTier(0)).toBe('bottom20');
  });
});

describe('computeComposite', () => {
  it('uses balanced weights', () => {
    const { revenue, growth, recency } = SCORING_MODES.balanced;
    const result = computeComposite(80, 60, 40, 'balanced');
    expect(result).toBeCloseTo(80 * revenue + 60 * growth + 40 * recency);
  });

  it('uses revenue-dominant weights', () => {
    const { revenue, growth, recency } = SCORING_MODES.revenue;
    const result = computeComposite(100, 50, 50, 'revenue');
    expect(result).toBeCloseTo(100 * revenue + 50 * growth + 50 * recency);
  });

  it('uses coverage-focused weights', () => {
    const { revenue, growth, recency } = SCORING_MODES.coverage;
    const result = computeComposite(30, 30, 100, 'coverage');
    expect(result).toBeCloseTo(30 * revenue + 30 * growth + 100 * recency);
  });
});

describe('getCustomerPriority', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns computed priority for a permit', async () => {
    mockClient._qb.single.mockResolvedValueOnce({
      data: {
        tabc_permit_number: 'MB123', revenue_score: 80, growth_score: 60,
        recency_score: 40, total_revenue: 50000, growth_rate: 0.15,
        last_activity_date: '2026-03-01', activity_count: 5,
      },
      error: null,
    });

    const result = await getCustomerPriority('MB123');
    expect(result).not.toBeNull();
    expect(result!.revenue_score).toBe(80);
    expect(result!.growth_score).toBe(60);
    expect(result!.recency_score).toBe(40);
    expect(result!.total_revenue).toBe(50000);
    expect(result!.tier).toBeDefined();
    expect(result!.priority_score).toBeGreaterThan(0);
  });

  it('returns null when not found', async () => {
    mockClient._qb.single.mockResolvedValueOnce({
      data: null, error: { code: 'PGRST116', message: 'not found' },
    });
    const result = await getCustomerPriority('NONEXISTENT');
    expect(result).toBeNull();
  });
});
