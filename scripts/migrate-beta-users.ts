/**
 * Migrate Beta Users
 * One-time script: creates an organization for each existing user who doesn't have one,
 * sets them as org owner with a 14-day trial.
 *
 * Usage: npx tsx scripts/migrate-beta-users.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('Starting beta user migration...\n');

  // Get all users without an org_id
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, role')
    .is('org_id', null);

  if (usersError) {
    console.error('Failed to fetch users:', usersError.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('No users without organizations found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${users.length} user(s) without organizations.\n`);

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  let created = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Get email from auth.users
      const { data: authData } = await supabase.auth.admin.getUserById(user.id);
      const email = authData?.user?.email || '';

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: `${email.split('@')[0]}'s Team`,
          subscription_status: 'trialing',
          trial_ends_at: trialEnd.toISOString(),
          trial_used: false,
          seat_count: 1,
          billing_email: email,
        })
        .select()
        .single();

      if (orgError || !org) {
        throw new Error(orgError?.message || 'Failed to create org');
      }

      // Add user as org owner
      const { error: memberError } = await supabase
        .from('org_members')
        .insert({ org_id: org.id, user_id: user.id, org_role: 'owner' });

      if (memberError) throw new Error(memberError.message);

      // Link user to org
      const { error: updateError } = await supabase
        .from('users')
        .update({ org_id: org.id })
        .eq('id', user.id);

      if (updateError) throw new Error(updateError.message);

      created++;
      console.log(`  Created org for ${email} (${user.role})`);
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR for user ${user.id}: ${msg}`);
    }
  }

  console.log(`\nMigration complete.`);
  console.log(`  Created: ${created}`);
  console.log(`  Errors:  ${errors}`);
}

main();
