/**
 * Subscription Status API
 * Returns current subscription state for the billing page.
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getOrgByUserId } from '@/lib/data/organizations';
import { getTierByPriceId } from '@/lib/stripe/prices';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = await getOrgByUserId(user.id);
    if (!org) {
      return NextResponse.json({
        hasOrg: false,
        subscription: null,
      });
    }

    const tier = org.stripe_price_id
      ? getTierByPriceId(org.stripe_price_id)
      : null;

    return NextResponse.json({
      hasOrg: true,
      subscription: {
        status: org.subscription_status,
        seatCount: org.seat_count,
        tierName: tier?.name || null,
        pricePerSeat: tier?.pricePerSeat || null,
        trialEndsAt: org.trial_ends_at,
        trialUsed: org.trial_used,
        hasPaymentMethod: !!org.stripe_subscription_id,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
