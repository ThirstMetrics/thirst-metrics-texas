/**
 * Global test setup
 * Sets environment variables and suppresses noisy console output
 */

// Set required env vars before any module loads
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DUCKDB_PATH = '/tmp/test-analytics.duckdb';

// Suppress console.error in tests (most are expected from error-path testing)
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});
