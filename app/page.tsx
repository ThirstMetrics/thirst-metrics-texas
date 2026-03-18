/**
 * Root Page
 * - whiskeyrivertx.com / www.whiskeyrivertx.com → marketing landing page
 * - app.whiskeyrivertx.com and all other hosts → redirect to dashboard or login
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import MarketingLanding from '@/components/marketing-landing';

const MARKETING_DOMAINS = new Set(['whiskeyrivertx.com', 'www.whiskeyrivertx.com']);

export const metadata: Metadata = {
  title: 'Whiskey River TX — Sales Intelligence for Texas Beverage Distributors',
  description:
    'Know which Texas bars and restaurants are worth your time. Whiskey River TX combines real TABC revenue data with field-ready CRM tools — GPS verification, territory management, and growth analytics.',
  keywords: [
    'Texas beverage distributor software',
    'TABC license data',
    'liquor distributor CRM',
    'Texas mixed beverage receipts',
    'beverage sales intelligence Texas',
    'beer wine spirits distributor tool',
    'field sales GPS verification',
    'Texas alcohol distributor',
  ],
  openGraph: {
    title: 'Whiskey River TX — Sales Intelligence for Texas Beverage Distributors',
    description:
      'Real TABC revenue data + field-ready CRM. Know which accounts to hit, prove your reps were there, and outwork the competition.',
    url: 'https://whiskeyrivertx.com',
    siteName: 'Whiskey River TX',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Whiskey River TX — Sales Intelligence for Texas Beverage Distributors',
    description:
      'Real TABC revenue data + field-ready CRM. Know which accounts to hit, prove your reps were there.',
  },
  alternates: {
    canonical: 'https://whiskeyrivertx.com',
  },
};

export default async function HomePage() {
  const headersList = await headers();
  // Check x-forwarded-host first (set by Nginx reverse proxy), fall back to host
  const rawHost = headersList.get('x-forwarded-host') || headersList.get('host') || '';
  // Strip port number if present (e.g. "whiskeyrivertx.com:80" → "whiskeyrivertx.com")
  const host = rawHost.split(':')[0].toLowerCase();

  // Show marketing landing page on the marketing domain
  if (MARKETING_DOMAINS.has(host)) {
    return <MarketingLanding />;
  }

  // SaaS app — redirect based on auth status
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
