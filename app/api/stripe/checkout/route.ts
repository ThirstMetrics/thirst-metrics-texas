/**
 * Stripe Checkout Session API
 * Creates a Checkout Session and returns the redirect URL.
 * Supports both card and ACH (us_bank_account) payment methods.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe/client';
import { getTierForSeats } from '@/lib/stripe/prices';
import { createServerClient } from '@/lib/supabase/server';
import {
  getOrgByUserId,
  createOrganization,
  linkStripeCustomer,
} from '@/lib/data/organizations';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const seatCount: number = Math.max(1, Math.floor(body.seatCount || 1));
    const tier = getTierForSeats(seatCount);

    if (!tier.id) {
      return NextResponse.json(
        { error: 'Stripe price not configured for this tier' },
        { status: 500 }
      );
    }

    const stripe = getStripe();

    // Get or create organization
    let org = await getOrgByUserId(user.id);
    if (!org) {
      org = await createOrganization(
        body.orgName || `${user.email}'s Team`,
        user.id,
        user.email || ''
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId = org.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { org_id: org.id, user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await linkStripeCustomer(org.id, stripeCustomerId);
    }

    // Build the checkout session
    const origin = req.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card', 'us_bank_account'],
      line_items: [
        {
          price: tier.id,
          quantity: seatCount,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: org.trial_used ? undefined : 14,
        metadata: { org_id: org.id },
      },
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?canceled=true`,
      metadata: { org_id: org.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
