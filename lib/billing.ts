/**
 * Billing Access Checks
 * Determines whether a user/org has active subscription access
 */

import { getOrgByUserId, Organization } from '@/lib/data/organizations';

export type AccessStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'no_org';

export interface BillingAccess {
  allowed: boolean;
  status: AccessStatus;
  showWarning: boolean;
  org: Organization | null;
}

/** Check if a subscription status grants app access */
export function isStatusAllowed(status: string): boolean {
  return ['active', 'trialing', 'past_due'].includes(status);
}

/** Get full billing access info for a user */
export async function getAccessStatus(userId: string): Promise<BillingAccess> {
  const org = await getOrgByUserId(userId);

  if (!org) {
    return { allowed: false, status: 'no_org', showWarning: false, org: null };
  }

  const status = org.subscription_status as AccessStatus;
  const allowed = isStatusAllowed(status);
  const showWarning = status === 'past_due';

  return { allowed, status, showWarning, org };
}
