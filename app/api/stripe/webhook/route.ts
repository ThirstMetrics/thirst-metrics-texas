/**
 * Stripe Webhook Handler
 * Processes Stripe events to sync subscription state with our database.
 * Must use raw body for signature verification — Next.js route segment config disables body parsing.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/client';
import {
  getOrgByStripeCustomerId,
  updateSubscription,
  logWebhookEvent,
} from '@/lib/data/organizations';

export const runtime = 'nodejs';

// Disable body parsing so we get the raw body for signature verification
export const dynamic = 'force-dynamic';

async function getRawBody(req: NextRequest): Promise<Buffer> {
  const arrayBuffer = await req.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  const stripe = getStripe();
  const rawBody = await getRawBody(req);
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  // Idempotency check — skip if already processed
  const isNew = await logWebhookEvent(event.id, event.type, event.data.object);
  if (!isNew) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.trial_will_end':
        // Could send email notification — for now just log
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Log error but return 200 so Stripe doesn't retry
    await logWebhookEvent(event.id, event.type, event.data.object, message);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  if (!session.customer || !session.subscription) return;

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer.id;

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;

  await updateSubscription(org.id, {
    stripe_subscription_id: subscriptionId,
    subscription_status: 'active',
  });
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  const item = subscription.items.data[0];
  const priceId = item?.price?.id;
  const quantity = item?.quantity || 1;

  await updateSubscription(org.id, {
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    subscription_status: subscription.status,
    seat_count: quantity,
    trial_ends_at: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    trial_used: subscription.trial_end !== null,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  await updateSubscription(org.id, {
    subscription_status: 'canceled',
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.customer) return;

  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer.id;

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  // Ensure status is active after successful payment
  if (org.subscription_status === 'past_due') {
    await updateSubscription(org.id, { subscription_status: 'active' });
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.customer) return;

  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer.id;

  const org = await getOrgByStripeCustomerId(customerId);
  if (!org) return;

  await updateSubscription(org.id, { subscription_status: 'past_due' });
}
