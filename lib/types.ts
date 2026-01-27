/**
 * Shared TypeScript types for the application
 */

export type UserRole = 'salesperson' | 'manager' | 'admin';

export interface User {
  id: string;
  role: UserRole;
  territory_id: string | null;
  created_at: string;
  updated_at: string;
}
