/**
 * Tests for lib/data/goals.ts
 * Goal CRUD operations
 */

const mockClient = vi.hoisted(() => {
  const qb: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((resolve: any) => resolve({ data: null, error: null })),
  };
  return {
    from: vi.fn().mockReturnValue(qb),
    _qb: qb,
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn().mockReturnValue(mockClient),
}));

import { getGoalsByUser, createGoal, updateGoal, deleteGoal } from '@/lib/data/goals';

describe('getGoalsByUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns goals for a user', async () => {
    const goals = [
      { id: 'g1', user_id: 'u1', goal_type: 'revenue', target_value: 1000, status: 'active' },
    ];
    mockClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: goals, error: null })
    );

    const result = await getGoalsByUser('u1');
    expect(result).toEqual(goals);
    expect(mockClient.from).toHaveBeenCalledWith('goals');
    expect(mockClient._qb.eq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('filters by status when provided', async () => {
    mockClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: [], error: null })
    );

    await getGoalsByUser('u1', 'achieved');
    expect(mockClient._qb.eq).toHaveBeenCalledWith('status', 'achieved');
  });

  it('throws on error', async () => {
    mockClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ data: null, error: { message: 'DB error' } })
    );

    await expect(getGoalsByUser('u1')).rejects.toThrow('Failed to fetch goals');
  });
});

describe('createGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts with correct fields', async () => {
    const newGoal = {
      id: 'g1', user_id: 'u1', goal_type: 'revenue' as const,
      target_value: 5000, target_date: '2026-06-01', current_value: 0, status: 'active' as const,
    };
    mockClient._qb.single.mockResolvedValueOnce({ data: newGoal, error: null });

    const result = await createGoal({
      user_id: 'u1', goal_type: 'revenue', target_value: 5000, target_date: '2026-06-01',
    });

    expect(result).toEqual(newGoal);
    expect(mockClient._qb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1', goal_type: 'revenue', target_value: 5000,
        target_date: '2026-06-01', current_value: 0, status: 'active',
      })
    );
  });

  it('throws on error', async () => {
    mockClient._qb.single.mockResolvedValueOnce({ data: null, error: { message: 'Insert failed' } });

    await expect(
      createGoal({ user_id: 'u1', goal_type: 'revenue', target_value: 100, target_date: '2026-06-01' })
    ).rejects.toThrow('Failed to create goal');
  });
});

describe('updateGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates partial fields', async () => {
    const updated = { id: 'g1', target_value: 2000, status: 'active' };
    mockClient._qb.single.mockResolvedValueOnce({ data: updated, error: null });

    const result = await updateGoal('g1', { target_value: 2000 });
    expect(result).toEqual(updated);
    expect(mockClient._qb.update).toHaveBeenCalledWith(expect.objectContaining({ target_value: 2000 }));
    expect(mockClient._qb.eq).toHaveBeenCalledWith('id', 'g1');
  });

  it('throws on error', async () => {
    mockClient._qb.single.mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } });
    await expect(updateGoal('g1', { status: 'achieved' })).rejects.toThrow('Failed to update goal');
  });
});

describe('deleteGoal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes by id', async () => {
    mockClient._qb.then.mockImplementationOnce((resolve: any) => resolve({ error: null }));

    await expect(deleteGoal('g1')).resolves.toBeUndefined();
    expect(mockClient.from).toHaveBeenCalledWith('goals');
    expect(mockClient._qb.delete).toHaveBeenCalled();
    expect(mockClient._qb.eq).toHaveBeenCalledWith('id', 'g1');
  });

  it('throws on error', async () => {
    mockClient._qb.then.mockImplementationOnce((resolve: any) =>
      resolve({ error: { message: 'Delete failed' } })
    );
    await expect(deleteGoal('g1')).rejects.toThrow('Failed to delete goal');
  });
});
