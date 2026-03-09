/**
 * DuckDB connection mock
 * Mocks lib/duckdb/connection module
 */

export const mockQuery = vi.fn().mockResolvedValue([]);
export const mockQueryOne = vi.fn().mockResolvedValue(null);

/**
 * Call this in vi.mock('lib/duckdb/connection') factory
 */
export function createDuckDBMock() {
  return {
    query: mockQuery,
    queryOne: mockQueryOne,
    closeDuckDB: vi.fn().mockResolvedValue(undefined),
  };
}
