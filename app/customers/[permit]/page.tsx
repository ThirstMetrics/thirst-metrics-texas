/**
 * Customer Detail Page
 * Shows customer information, revenue charts, and activities
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getCustomerByPermit, getCustomerMonthlyRevenue } from '@/lib/data/beverage-receipts';
import { getCustomerActivities } from '@/lib/data/activities';
import { getCustomerPriority } from '@/lib/data/priorities';
import CustomerDetailClient from '@/components/customer-detail-client';

export default async function CustomerDetailPage({
  params,
}: {
  params: { permit: string };
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const permitNumber = decodeURIComponent(params.permit);

  // Fetch customer data + priority scores
  const [customer, monthlyRevenue, activities, priority] = await Promise.all([
    getCustomerByPermit(permitNumber),
    getCustomerMonthlyRevenue(permitNumber, 12),
    getCustomerActivities(permitNumber),
    getCustomerPriority(permitNumber).catch(() => null),
  ]);

  if (!customer) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h1>Customer Not Found</h1>
        <p>No customer found with permit number: {permitNumber}</p>
      </div>
    );
  }

  return (
    <CustomerDetailClient
      customer={customer}
      monthlyRevenue={monthlyRevenue}
      activities={activities}
      userId={user.id}
      priority={priority}
    />
  );
}
