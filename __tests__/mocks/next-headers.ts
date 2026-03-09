/**
 * Mock for next/headers
 * Required by Supabase SSR server client
 */

export const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  get: vi.fn().mockReturnValue(null),
};

export function createNextHeadersMock() {
  return {
    cookies: vi.fn().mockResolvedValue(mockCookieStore),
    headers: vi.fn().mockReturnValue(new Map()),
  };
}
