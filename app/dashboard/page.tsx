/**
 * Dashboard Page
 * Main dashboard for authenticated users
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth';
import DashboardClient from '@/components/dashboard-client';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = await getUserRole();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Welcome back! Here's your sales overview.</p>
        </div>
        <div style={styles.userInfo}>
          <span style={styles.userEmail}>{user.email}</span>
          <span style={styles.role}>{role || 'salesperson'}</span>
        </div>
      </div>

      <nav style={styles.nav}>
        <Link href="/dashboard" style={styles.navLinkActive}>Dashboard</Link>
        <Link href="/customers" style={styles.navLink}>Customers</Link>
        <Link href="/activities" style={styles.navLink}>Activities</Link>
        {(role === 'manager' || role === 'admin') && (
          <Link href="/analytics" style={styles.navLink}>Analytics</Link>
        )}
        {role === 'admin' && (
          <Link href="/admin" style={styles.navLink}>Admin</Link>
        )}
      </nav>

      <div style={styles.content}>
        <DashboardClient />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#f5f7fa',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '24px 40px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: 0,
  },
  subtitle: {
    fontSize: '16px',
    opacity: 0.9,
    marginTop: '4px',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: '4px',
  },
  userEmail: {
    fontSize: '14px',
  },
  role: {
    fontSize: '12px',
    padding: '2px 8px',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: '12px',
    textTransform: 'capitalize' as const,
  },
  nav: {
    display: 'flex',
    gap: '4px',
    padding: '0 40px',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  navLink: {
    padding: '16px 20px',
    color: '#666',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderBottom: '2px solid transparent',
    transition: 'color 0.2s, border-color 0.2s',
  },
  navLinkActive: {
    padding: '16px 20px',
    color: '#667eea',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderBottom: '2px solid #667eea',
  },
  content: {
    padding: '24px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
};
