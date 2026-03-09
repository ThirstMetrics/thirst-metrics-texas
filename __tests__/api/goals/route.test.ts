/**
 * Tests for app/api/goals/route.ts
 * GET: List goals | POST: Create goal
 */

import { NextRequest } from 'next/server';

const { mockServerClient, mockServiceClient } = vi.hoisted(() => {
  function makeMock() {
    const qb: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((resolve: any) => resolve({ data: null, error: null, count: 0 })),
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
  }
  return { mockServerClient: makeMock(), mockServiceClient: makeMock() };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
  createServiceClient: vi.fn().mockReturnValue(mockServiceClient),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn().mockReturnValue([]), set: vi.fn() }),
}));

const mockGetGoalsByUser = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockCreateGoal = vi.hoisted(() => vi.fn());

vi.mock('@/lib/data/goals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data/goals')>('@/lib/data/goals');
  return {
    ...actual,
    getGoalsByUser: mockGetGoalsByUser,
    createGoal: mockCreateGoal,
  };
});

import { GET, POST } from '@/app/api/goals/route';

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

describe('GET /api/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
    // enrichGoals calls countVisits which uses service client
    mockServiceClient._qb.then.mockImplementation((resolve: any) =>
      resolve({ count: 0, error: null })
    );
  });

  it('returns goals for authenticated user', async () => {
    const goals = [
      { id: 'g1', goal_type: 'revenue', target_value: 1000, current_value: 500, status: 'active', user_id: 'user-123', created_at: '2026-01-01T00:00:00Z', target_date: '2026-06-01' },
    ];
    mockGetGoalsByUser.mockResolvedValueOnce(goals);

    const res = await GET(makeRequest('/api/goals'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goals).toBeDefined();
    expect(mockGetGoalsByUser).toHaveBeenCalledWith('user-123', undefined);
  });

  it('filters by status', async () => {
    mockGetGoalsByUser.mockResolvedValueOnce([]);
    const res = await GET(makeRequest('/api/goals?status=active'));
    expect(res.status).toBe(200);
    expect(mockGetGoalsByUser).toHaveBeenCalledWith('user-123', 'active');
  });

  it('rejects invalid status filter', async () => {
    const res = await GET(makeRequest('/api/goals?status=invalid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid status filter');
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'not authenticated' },
    });
    const res = await GET(makeRequest('/api/goals'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/goals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
  });

  it('creates a goal with valid data', async () => {
    const newGoal = {
      id: 'g1', user_id: 'user-123', goal_type: 'revenue',
      target_value: 5000, target_date: '2026-06-01', current_value: 0, status: 'active',
    };
    mockCreateGoal.mockResolvedValueOnce(newGoal);

    const res = await POST(makeRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ goal_type: 'revenue', target_value: 5000, target_date: '2026-06-01' }),
    }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.goal).toEqual(newGoal);
  });

  it('rejects invalid goal_type', async () => {
    const res = await POST(makeRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ goal_type: 'invalid', target_value: 100, target_date: '2026-06-01' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects non-positive target_value', async () => {
    const res = await POST(makeRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ goal_type: 'revenue', target_value: -10, target_date: '2026-06-01' }),
    }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid target_date', async () => {
    const res = await POST(makeRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ goal_type: 'revenue', target_value: 100, target_date: 'not-a-date' }),
    }));
    expect(res.status).toBe(400);
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'not authenticated' },
    });
    const res = await POST(makeRequest('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ goal_type: 'revenue', target_value: 100, target_date: '2026-06-01' }),
    }));
    expect(res.status).toBe(401);
  });
});
