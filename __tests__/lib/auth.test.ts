/**
 * Tests for lib/auth.ts
 * Authentication and role helpers
 */

// vi.hoisted runs before vi.mock factories — safe to reference in mock factories
const mockClient = vi.hoisted(() => {
  const qb: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue(qb),
    _qb: qb,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  }),
}));

import { getUserRole, hasRole, isAdmin, isManagerOrAdmin, getCurrentUser } from '@/lib/auth';

describe('getUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  it('returns role from database', async () => {
    mockClient._qb.single.mockResolvedValueOnce({
      data: { role: 'manager' },
      error: null,
    });

    const role = await getUserRole();
    expect(role).toBe('manager');
    expect(mockClient.from).toHaveBeenCalledWith('users');
  });

  it('defaults to salesperson if no user record', async () => {
    mockClient._qb.single.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });

    const role = await getUserRole();
    expect(role).toBe('salesperson');
  });

  it('returns null if not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'not authenticated' },
    });

    const role = await getUserRole();
    expect(role).toBeNull();
  });
});

describe('hasRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  it('admin satisfies all role requirements', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    expect(await hasRole('salesperson')).toBe(true);
    expect(await hasRole('manager')).toBe(true);
    expect(await hasRole('admin')).toBe(true);
  });

  it('salesperson only satisfies salesperson', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'salesperson' },
      error: null,
    });

    expect(await hasRole('salesperson')).toBe(true);
    expect(await hasRole('manager')).toBe(false);
    expect(await hasRole('admin')).toBe(false);
  });

  it('returns false if not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    expect(await hasRole('salesperson')).toBe(false);
  });
});

describe('isAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  it('returns true for admin', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });
    expect(await isAdmin()).toBe(true);
  });

  it('returns false for manager', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'manager' },
      error: null,
    });
    expect(await isAdmin()).toBe(false);
  });
});

describe('isManagerOrAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
  });

  it('returns true for manager', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'manager' },
      error: null,
    });
    expect(await isManagerOrAdmin()).toBe(true);
  });

  it('returns true for admin', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });
    expect(await isManagerOrAdmin()).toBe(true);
  });

  it('returns false for salesperson', async () => {
    mockClient._qb.single.mockResolvedValue({
      data: { role: 'salesperson' },
      error: null,
    });
    expect(await isManagerOrAdmin()).toBe(false);
  });
});

describe('getCurrentUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns user when authenticated', async () => {
    const user = { id: 'user-123', email: 'test@example.com' };
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user },
      error: null,
    });

    const result = await getCurrentUser();
    expect(result).toEqual(user);
  });

  it('returns null when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'not authenticated' },
    });

    const result = await getCurrentUser();
    expect(result).toBeNull();
  });
});
