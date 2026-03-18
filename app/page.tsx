/**
 * Root Page
 * - whiskeyrivertx.com / www.whiskeyrivertx.com → marketing landing page
 * - app.whiskeyrivertx.com and all other hosts → redirect to dashboard or login
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import MarketingLanding from '@/components/marketing-landing';

const MARKETING_DOMAINS = new Set(['whiskeyrivertx.com', 'www.whiskeyrivertx.com']);

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get('host') || '';

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
