/**
 * Root Page (SaaS app)
 * Marketing traffic is proxied to the landing page app by middleware.
 * This page only handles app.whiskeyrivertx.com — redirect to dashboard or login.
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
