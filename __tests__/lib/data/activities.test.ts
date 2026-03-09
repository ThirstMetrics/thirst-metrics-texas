/**
 * Tests for lib/data/activities.ts
 * Sales activity CRUD operations
 */

const { mockServiceClient, mockServerClient } = vi.hoisted(() => {
  function makeMock() {
    const qb: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((resolve: any) => resolve({ data: null, error: null })),
    };
    return {
      from: vi.fn().mockReturnValue(qb),
      _qb: qb,
    };
  }
  return { mockServiceClient: makeMock(), mockServerClient: makeMock() };
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue(mockServiceClient),
  createServerClient: vi.fn().mockResolvedValue(mockServerClient),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: vi.fn().mockReturnValue([]), set: vi.fn() }),
}));

import {
  createActivity, getUserActivities, getCustomerActivities,
  getActivityById, updateActivity, deleteActivity,
} from '@/lib/data/activities';

describe('createActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts via service client', async () => {
    const activity = {
      user_id: 'u1', tabc_permit_number: 'MB123',
      activity_type: 'visit' as const, activity_date: '2026-03-01', notes: 'Good meeting',
    };
    const inserted = { id: 'a1', ...activity };
    mockServiceClient._qb.single.mockResolvedValueOnce({ data: inserted, error: null });

    const result = await createActivity(activity);
    expect(result).toEqual(inserted);
    expect(mockServiceClient.from).toHaveBeenCalledWith('sales_activities');
    expect(mockServiceClient._qb.insert).toHaveBeenCalledWith([activity]);
  });

  it('throws on error', async () => {
    mockServiceClient._qb.single.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } });
    await expect(
      createActivity({ user_id: 'u1', tabc_permit_number: 'MB123', activity_type: 'visit', activity_date: '2026-03-01' })
    ).rejects.toThrow('Failed to create activity');
  });
});

describe('getUserActivities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches with filters', async () => {
    const activities = [{ id: 'a1', activity_type: 'visit' }];
    mockServerClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: activities, error: null })
    );

    const result = await getUserActivities('u1', { permitNumber: 'MB123', activityType: 'visit', limit: 10 });
    expect(result).toEqual(activities);
    expect(mockServerClient._qb.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(mockServerClient._qb.eq).toHaveBeenCalledWith('tabc_permit_number', 'MB123');
    expect(mockServerClient._qb.eq).toHaveBeenCalledWith('activity_type', 'visit');
    expect(mockServerClient._qb.limit).toHaveBeenCalledWith(10);
  });

  it('applies date range filters', async () => {
    mockServerClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: [], error: null })
    );

    await getUserActivities('u1', { startDate: '2026-01-01', endDate: '2026-03-01' });
    expect(mockServerClient._qb.gte).toHaveBeenCalledWith('activity_date', '2026-01-01');
    expect(mockServerClient._qb.lte).toHaveBeenCalledWith('activity_date', '2026-03-01');
  });

  it('throws on error', async () => {
    mockServerClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: null, error: { message: 'Fetch failed' } })
    );
    await expect(getUserActivities('u1')).rejects.toThrow('Failed to fetch activities');
  });
});

describe('getCustomerActivities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes nested photos via service client', async () => {
    const activities = [
      { id: 'a1', activity_photos: [{ id: 'p1', photo_url: 'https://example.com/photo.jpg' }] },
    ];
    mockServiceClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: activities, error: null })
    );

    const result = await getCustomerActivities('MB123');
    expect(result).toEqual(activities);
    expect(mockServiceClient._qb.select).toHaveBeenCalledWith('*, activity_photos(*)');
    expect(mockServiceClient._qb.eq).toHaveBeenCalledWith('tabc_permit_number', 'MB123');
  });
});

describe('getActivityById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns activity', async () => {
    const activity = { id: 'a1', activity_type: 'visit' };
    mockServerClient._qb.single.mockResolvedValueOnce({ data: activity, error: null });
    const result = await getActivityById('a1');
    expect(result).toEqual(activity);
  });

  it('returns null on PGRST116 (not found)', async () => {
    mockServerClient._qb.single.mockResolvedValueOnce({
      data: null, error: { code: 'PGRST116', message: 'not found' },
    });
    const result = await getActivityById('nonexistent');
    expect(result).toBeNull();
  });

  it('throws on other errors', async () => {
    mockServerClient._qb.single.mockResolvedValueOnce({
      data: null, error: { code: 'PGRST000', message: 'DB error' },
    });
    await expect(getActivityById('a1')).rejects.toThrow('Failed to fetch activity');
  });
});

describe('updateActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates via service client', async () => {
    const updated = { id: 'a1', notes: 'Updated notes' };
    mockServiceClient._qb.single.mockResolvedValueOnce({ data: updated, error: null });
    const result = await updateActivity('a1', { notes: 'Updated notes' });
    expect(result).toEqual(updated);
    expect(mockServiceClient._qb.update).toHaveBeenCalledWith({ notes: 'Updated notes' });
    expect(mockServiceClient._qb.eq).toHaveBeenCalledWith('id', 'a1');
  });
});

describe('deleteActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes via service client', async () => {
    mockServiceClient._qb.then.mockImplementationOnce((resolve: any) => resolve({ error: null }));
    await expect(deleteActivity('a1')).resolves.toBeUndefined();
    expect(mockServiceClient.from).toHaveBeenCalledWith('sales_activities');
    expect(mockServiceClient._qb.delete).toHaveBeenCalled();
  });

  it('throws on error', async () => {
    mockServiceClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ error: { message: 'Delete failed' } })
    );
    await expect(deleteActivity('a1')).rejects.toThrow('Failed to delete activity');
  });
});
