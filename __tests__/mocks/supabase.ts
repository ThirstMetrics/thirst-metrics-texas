/**
 * Supabase mock factory
 * Returns a chainable query builder that matches the Supabase JS client API.
 *
 * IMPORTANT: For use in vi.mock() factories, call this inside vi.hoisted()
 * so the variable is available when the mock factory runs.
 */

export function createMockSupabaseClient() {
  let currentResult: { data: any; error: any; count?: number | null } = {
    data: null,
    error: null,
  };

  const queryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => Promise.resolve(currentResult)),
    then: vi.fn().mockImplementation((resolve: any) => resolve(currentResult)),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(queryBuilder),
    _queryBuilder: queryBuilder,
    _setResult: (result: { data: any; error: any; count?: number | null }) => {
      currentResult = result;
    },
  };
}
