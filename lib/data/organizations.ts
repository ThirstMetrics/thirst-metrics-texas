/**
 * Organization Data Helpers
 * CRUD operations for organizations and org membership
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface Organization {
  id: string;
  name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  trial_used: boolean;
  seat_count: number;
  billing_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  org_role: 'owner' | 'member';
  joined_at: string;
}

/** Get organization by user ID (through org_members) */
export async function getOrgByUserId(userId: string): Promise<Organization | null> {
  const supabase = createServiceClient();

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .single();

  if (!member) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', member.org_id)
    .single();

  return org as Organization | null;
}

/** Get organization by Stripe customer ID */
export async function getOrgByStripeCustomerId(
  stripeCustomerId: string
): Promise<Organization | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();
  return data as Organization | null;
}

/** Create a new organization and set the creator as owner */
export async function createOrganization(
  name: string,
  ownerUserId: string,
  billingEmail: string
): Promise<Organization> {
  const supabase = createServiceClient();

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name,
      billing_email: billingEmail,
      subscription_status: 'trialing',
    })
    .select()
    .single();

  if (orgError || !org) {
    throw new Error(`Failed to create organization: ${orgError?.message}`);
  }

  // Add creator as owner
  const { error: memberError } = await supabase
    .from('org_members')
    .insert({ org_id: org.id, user_id: ownerUserId, org_role: 'owner' });

  if (memberError) {
    throw new Error(`Failed to add org owner: ${memberError.message}`);
  }

  // Link user to org
  await supabase.from('users').update({ org_id: org.id }).eq('id', ownerUserId);

  return org as Organization;
}

/** Update organization subscription fields from Stripe webhook data */
export async function updateSubscription(
  orgId: string,
  updates: {
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    stripe_price_id?: string;
    subscription_status?: string;
    trial_ends_at?: string | null;
    trial_used?: boolean;
    seat_count?: number;
  }
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('organizations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orgId);

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
}

/** Link Stripe customer ID to an organization */
export async function linkStripeCustomer(
  orgId: string,
  stripeCustomerId: string
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  if (error) {
    throw new Error(`Failed to link Stripe customer: ${error.message}`);
  }
}

/** Get org members count */
export async function getOrgMemberCount(orgId: string): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId);
  return count || 0;
}

/** Log a processed webhook event (for idempotency) */
export async function logWebhookEvent(
  stripeEventId: string,
  eventType: string,
  payload: unknown,
  error?: string
): Promise<boolean> {
  const supabase = createServiceClient();

  // Check if already processed
  const { data: existing } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .single();

  if (existing) return false; // Already processed

  await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
    payload,
    error: error || null,
  });

  return true; // First time processing
}
