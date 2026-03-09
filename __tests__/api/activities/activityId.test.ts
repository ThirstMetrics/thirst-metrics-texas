/**
 * Tests for app/api/activities/[activityId]/route.ts
 * PATCH: Update activity | DELETE: Delete activity
 */

import { NextRequest } from 'next/server';

const { mockServerClient, mockServiceClient } = vi.hoisted(() => {
  function makeMock() {
    const qb: any = {
      select: vi.fn().mockReturnThis(),
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

const mockUpdateActivity = vi.hoisted(() => vi.fn());
const mockDeleteActivity = vi.hoisted(() => vi.fn());

vi.mock('@/lib/data/activities', () => ({
  updateActivity: mockUpdateActivity,
  deleteActivity: mockDeleteActivity,
}));

import { PATCH, DELETE } from '@/app/api/activities/[activityId]/route';

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

function makeParams(activityId: string) {
  return { params: Promise.resolve({ activityId }) };
}

describe('PATCH /api/activities/[activityId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
    mockServiceClient._qb.single.mockResolvedValue({
      data: { user_id: 'user-123' }, error: null,
    });
  });

  it('updates with allowed fields', async () => {
    const updated = { id: 'a1', notes: 'Updated', outcome: 'positive' };
    mockUpdateActivity.mockResolvedValueOnce(updated);

    const res = await PATCH(
      makeRequest('/api/activities/a1', {
        method: 'PATCH', body: JSON.stringify({ notes: 'Updated', outcome: 'positive' }),
      }),
      makeParams('a1')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activity).toEqual(updated);
    expect(mockUpdateActivity).toHaveBeenCalledWith('a1', expect.objectContaining({ notes: 'Updated', outcome: 'positive' }));
  });

  it('ignores disallowed fields', async () => {
    const updated = { id: 'a1', notes: 'Good' };
    mockUpdateActivity.mockResolvedValueOnce(updated);

    const res = await PATCH(
      makeRequest('/api/activities/a1', {
        method: 'PATCH',
        body: JSON.stringify({ user_id: 'hacker', id: 'fake', tabc_permit_number: 'MB999', notes: 'Good' }),
      }),
      makeParams('a1')
    );
    expect(res.status).toBe(200);
    const callArgs = mockUpdateActivity.mock.calls[0][1];
    expect(callArgs.user_id).toBeUndefined();
    expect(callArgs.id).toBeUndefined();
    expect(callArgs.tabc_permit_number).toBeUndefined();
    expect(callArgs.notes).toBe('Good');
  });

  it('returns 404 if not owned by user', async () => {
    mockServiceClient._qb.single.mockResolvedValueOnce({
      data: { user_id: 'other-user' }, error: null,
    });
    const res = await PATCH(
      makeRequest('/api/activities/a1', { method: 'PATCH', body: JSON.stringify({ notes: 'X' }) }),
      makeParams('a1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'not authenticated' },
    });
    const res = await PATCH(
      makeRequest('/api/activities/a1', { method: 'PATCH', body: JSON.stringify({ notes: 'X' }) }),
      makeParams('a1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for empty valid updates', async () => {
    const res = await PATCH(
      makeRequest('/api/activities/a1', { method: 'PATCH', body: JSON.stringify({ random: 'ignored' }) }),
      makeParams('a1')
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/activities/[activityId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServerClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } }, error: null,
    });
    mockServiceClient._qb.single.mockResolvedValue({
      data: { user_id: 'user-123' }, error: null,
    });
  });

  it('deletes an activity', async () => {
    mockDeleteActivity.mockResolvedValueOnce(undefined);
    const res = await DELETE(
      makeRequest('/api/activities/a1', { method: 'DELETE' }),
      makeParams('a1')
    );
    expect(res.status).toBe(200);
    expect(mockDeleteActivity).toHaveBeenCalledWith('a1');
  });

  it('returns 404 if not owned', async () => {
    mockServiceClient._qb.single.mockResolvedValueOnce({
      data: { user_id: 'other' }, error: null,
    });
    const res = await DELETE(
      makeRequest('/api/activities/a1', { method: 'DELETE' }),
      makeParams('a1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 if unauthenticated', async () => {
    mockServerClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null }, error: { message: 'unauthed' },
    });
    const res = await DELETE(
      makeRequest('/api/activities/a1', { method: 'DELETE' }),
      makeParams('a1')
    );
    expect(res.status).toBe(401);
  });
});
