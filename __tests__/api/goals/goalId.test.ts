/**
 * Tests for app/api/goals/[goalId]/route.ts
 * PATCH: Update goal | DELETE: Delete goal
 */

import { NextRequest } from 'next/server';

const { mockServerClient, mockServiceClient } = vi.hoisted(() => {
  function makeMock() {
    const qb: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((resolve: any) => resolve({ data: null, error: null })),
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

const mockUpdateGoal = vi.hoisted(() => vi.fn());
const mockDeleteGoal = vi.hoisted(() => vi.fn());

vi.mock('@/lib/data/goals', () => ({
  updateGoal: mockUpdateGoal,
  deleteGoal: mockDeleteGoal,
}));

import { PATCH, DELETE } from '@/app/api/goals/[goalId]/route';

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

function makeParams(goalId: string) {
  return { params: Promise.resolve({ goalId }) };
}

describe('PATCH /api/goals/[goalId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
    // Default ownership check passes
    mockServiceClient._qb.single.mockResolvedValue({
      data: { user_id: 'user-123' }, error: null,
    });
  });

  it('updates a goal', async () => {
    const updated = { id: 'g1', target_value: 2000, status: 'active' };
    mockUpdateGoal.mockResolvedValueOnce(updated);

    const res = await PATCH(
      makeRequest('/api/goals/g1', { method: 'PATCH', body: JSON.stringify({ target_value: 2000 }) }),
      makeParams('g1')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.goal).toEqual(updated);
  });

  it('returns 404 if not owned by user', async () => {
    mockServiceClient._qb.single.mockResolvedValueOnce({
      data: { user_id: 'other-user' }, error: null,
    });
    const res = await PATCH(
      makeRequest('/api/goals/g1', { method: 'PATCH', body: JSON.stringify({ target_value: 2000 }) }),
      makeParams('g1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'not authenticated' },
    });
    const res = await PATCH(
      makeRequest('/api/goals/g1', { method: 'PATCH', body: JSON.stringify({ target_value: 2000 }) }),
      makeParams('g1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty updates', async () => {
    const res = await PATCH(
      makeRequest('/api/goals/g1', { method: 'PATCH', body: JSON.stringify({ random_field: 'ignored' }) }),
      makeParams('g1')
    );
    expect(res.status).toBe(400);
  });

  it('validates target_value is positive', async () => {
    const res = await PATCH(
      makeRequest('/api/goals/g1', { method: 'PATCH', body: JSON.stringify({ target_value: -5 }) }),
      makeParams('g1')
    );
    expect(res.status).toBe(400);
  });

  it('validates status is valid', async () => {
    const res = await PATCH(
      makeRequest('/api/goals/g1', { method: 'PATCH', body: JSON.stringify({ status: 'invalid' }) }),
      makeParams('g1')
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/goals/[goalId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
    mockServiceClient._qb.single.mockResolvedValue({
      data: { user_id: 'user-123' }, error: null,
    });
  });

  it('deletes a goal', async () => {
    mockDeleteGoal.mockResolvedValueOnce(undefined);
    const res = await DELETE(makeRequest('/api/goals/g1', { method: 'DELETE' }), makeParams('g1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 if not owned by user', async () => {
    mockServiceClient._qb.single.mockResolvedValueOnce({
      data: { user_id: 'other-user' }, error: null,
    });
    const res = await DELETE(makeRequest('/api/goals/g1', { method: 'DELETE' }), makeParams('g1'));
    expect(res.status).toBe(404);
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'not authenticated' },
    });
    const res = await DELETE(makeRequest('/api/goals/g1', { method: 'DELETE' }), makeParams('g1'));
    expect(res.status).toBe(401);
  });
});
