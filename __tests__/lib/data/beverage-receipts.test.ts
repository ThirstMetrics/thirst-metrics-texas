/**
 * Tests for lib/data/beverage-receipts.ts
 * DuckDB-backed customer revenue queries
 */

import { mockQuery, mockQueryOne } from '../../mocks/duckdb';

vi.mock('@/lib/duckdb/connection', () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

import {
  getCustomerByPermit,
  getCustomerMonthlyRevenue,
} from '@/lib/data/beverage-receipts';

describe('getCustomerByPermit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries DuckDB with permit number', async () => {
    const customer = {
      tabc_permit_number: 'MB123',
      location_name: 'Test Bar',
      total_revenue: 50000,
      receipt_count: 12,
    };
    mockQueryOne.mockResolvedValueOnce(customer);

    const result = await getCustomerByPermit('MB123');
    expect(result).toEqual(customer);
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('tabc_permit_number = ?'),
      ['MB123']
    );
  });

  it('returns null when customer not found', async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    const result = await getCustomerByPermit('NONEXISTENT');
    expect(result).toBeNull();
  });
});

describe('getCustomerMonthlyRevenue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns monthly data array', async () => {
    const monthlyData = [
      { month: '2026-01', total_receipts: 5000, liquor_receipts: 3000, wine_receipts: 1000, beer_receipts: 1000, cover_charge_receipts: 0 },
      { month: '2026-02', total_receipts: 6000, liquor_receipts: 3500, wine_receipts: 1200, beer_receipts: 1300, cover_charge_receipts: 0 },
    ];
    mockQuery.mockResolvedValueOnce(monthlyData);

    const result = await getCustomerMonthlyRevenue('MB123', 12);
    expect(result).toEqual(monthlyData);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('tabc_permit_number = ?'),
      expect.arrayContaining(['MB123'])
    );
  });

  it('defaults to 12 months', async () => {
    mockQuery.mockResolvedValueOnce([]);

    await getCustomerMonthlyRevenue('MB123');
    // Should be called with permit and a cutoff YYYYMM string
    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['MB123', expect.stringMatching(/^\d{6}$/)])
    );
  });
});
