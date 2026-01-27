/**
 * Authentication and Role Helpers
 * Utilities for checking user roles and permissions
 */

import { createServerClient } from './supabase/server';
import { UserRole } from './types';

/**
 * Get the current user's role from the database
 * Returns null if user is not authenticated or not found
 */
export async function getUserRole(): Promise<UserRole | null> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }
    
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (error || !data) {
      // User record doesn't exist yet - default to salesperson
      return 'salesperson';
    }
    
    return data.role as UserRole;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

/**
 * Check if user has a specific role
 */
export async function hasRole(requiredRole: UserRole): Promise<boolean> {
  const userRole = await getUserRole();
  if (!userRole) return false;
  
  const roleHierarchy: Record<UserRole, number> = {
    salesperson: 1,
    manager: 2,
    admin: 3,
  };
  
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if user is admin
 */
export async function isAdmin(): Promise<boolean> {
  return hasRole('admin');
}

/**
 * Check if user is manager or admin
 */
export async function isManagerOrAdmin(): Promise<boolean> {
  const role = await getUserRole();
  return role === 'manager' || role === 'admin';
}

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}
