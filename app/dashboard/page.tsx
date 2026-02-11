/**
 * Dashboard Page
 * Main dashboard for authenticated users
 */

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth';
import DashboardClient from '@/components/dashboard-client';
import Link from 'next/link';

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',      // brand-500 (teal)
  primaryDark: '#042829',  // brand-900
  primaryLight: '#e6f5f5', // brand-50
  accent: '#22d3e6',       // accent-400 (cyan)
  gradient: 'linear-gradient(135deg, #042829 0%, #063a3c 50%, #021a1b 100%)',
};

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = await getUserRole();

  return (
    <div style={styles.container}>
      {/* Navigation Header */}
      <header style={styles.navHeader}>
        <div style={styles.navContent}>
          <div style={styles.navLeft}>
            <Link href="/dashboard" style={styles.logoLink}>
              <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={styles.logoIcon}>
                <rect width="40" height="40" rx="9" fill="#0d7377"/>
                <rect x="6" y="22" width="5.5" height="12" rx="1.5" fill="white" opacity="0.55"/>
                <rect x="7.25" y="19.5" width="3" height="3" rx="0.8" fill="white" opacity="0.55"/>
                <rect x="13.5" y="16" width="5.5" height="18" rx="1.5" fill="white" opacity="0.7"/>
                <rect x="14.75" y="13" width="3" height="3.5" rx="0.8" fill="white" opacity="0.7"/>
                <rect x="21" y="11" width="5.5" height="23" rx="1.5" fill="white" opacity="0.85"/>
                <rect x="22.25" y="7.5" width="3" height="4" rx="0.8" fill="white" opacity="0.85"/>
                <rect x="28.5" y="6" width="5.5" height="28" rx="1.5" fill="white"/>
                <rect x="29.75" y="3" width="3" height="3.5" rx="0.8" fill="white"/>
                <path d="M8.5 26 L16.25 20 L23.75 14.5 L31.25 9" stroke="#22d3e6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
                <circle cx="8.5" cy="26" r="1.5" fill="#22d3e6"/>
                <circle cx="16.25" cy="20" r="1.5" fill="#22d3e6"/>
                <circle cx="23.75" cy="14.5" r="1.5" fill="#22d3e6"/>
                <circle cx="31.25" cy="9" r="1.5" fill="#22d3e6"/>
              </svg>
              <span style={styles.logoText}>Thirst Metrics</span>
            </Link>
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
          </div>
          <div style={styles.navRight}>
            <span style={styles.userEmail}>{user.email}</span>
            <span style={styles.userRole}>{role || 'salesperson'}</span>
          </div>
        </div>
      </header>

      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div style={styles.pageHeaderContent}>
          <h1 style={styles.title}>Dashboard</h1>
          <p style={styles.subtitle}>Welcome back! Here's your sales overview.</p>
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <DashboardClient />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#f8fafc',
  },
  navHeader: {
    background: 'linear-gradient(135deg, #042829 0%, #063a3c 50%, #021a1b 100%)',
    padding: '0 24px',
  },
  navContent: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '64px',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  logoLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textDecoration: 'none',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'white',
  },
  nav: {
    display: 'flex',
    gap: '8px',
  },
  navLink: {
    padding: '8px 16px',
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
    transition: 'all 0.2s',
  },
  navLinkActive: {
    padding: '8px 16px',
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.1)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '6px',
  },
  navRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userEmail: {
    color: 'white',
    fontSize: '14px',
  },
  userRole: {
    backgroundColor: 'rgba(34, 211, 230, 0.2)',
    color: '#22d3e6',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    textTransform: 'capitalize' as const,
  },
  pageHeader: {
    background: 'linear-gradient(135deg, #0d7377 0%, #0a5f63 100%)',
    padding: '24px',
  },
  pageHeaderContent: {
    maxWidth: '1400px',
    margin: '0 auto',
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.8)',
    marginTop: '4px',
  },
  content: {
    padding: '24px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
};
