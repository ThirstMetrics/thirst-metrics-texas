'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useIsMobile } from '@/lib/hooks/use-media-query';

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
  gradient: 'linear-gradient(135deg, #042829 0%, #063a3c 50%, #021a1b 100%)',
};

interface NavBarProps {
  currentPath: string;
  userEmail: string;
  userRole: string;
}

export default function NavBar({ currentPath, userEmail, userRole }: NavBarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isMobile = useIsMobile();
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/customers', label: 'Customers' },
    { href: '/activities', label: 'Activities' },
  ];

  // Add Analytics for manager and admin
  if (userRole === 'manager' || userRole === 'admin') {
    navLinks.push({ href: '/analytics', label: 'Analytics' });
  }

  // Add Admin for admin only
  if (userRole === 'admin') {
    navLinks.push({ href: '/admin', label: 'Admin' });
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return currentPath === '/dashboard';
    }
    return currentPath.startsWith(href);
  };

  // User menu items
  const userMenuItems = [
    { label: 'Preferences', icon: '⚙️', href: '/preferences' },
    { label: 'Settings', icon: '🔧', href: '/settings' },
    { label: 'Billing', icon: '💳', href: '/billing' },
  ];

  // Get initials from email
  const initials = userEmail
    ? userEmail.substring(0, 2).toUpperCase()
    : '??';

  return (
    <header style={styles.navHeader}>
      <div style={styles.navContent}>
        <div style={styles.navLeft}>
          {/* Logo */}
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

          {/* Desktop Navigation */}
          {!isMobile && (
            <nav style={styles.nav}>
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={isActive(link.href) ? styles.navLinkActive : styles.navLink}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div style={styles.navRight}>
          {/* Desktop User Menu */}
          {!isMobile && (
            <div ref={userMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                style={styles.userButton}
                aria-label="User menu"
              >
                <div style={styles.avatar}>{initials}</div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  style={{ transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div style={styles.dropdown}>
                  {/* User info header */}
                  <div style={styles.dropdownHeader}>
                    <div style={styles.dropdownEmail}>{userEmail}</div>
                    <span style={styles.dropdownRole}>{userRole || 'salesperson'}</span>
                  </div>
                  <div style={styles.dropdownDivider} />
                  {/* Menu items */}
                  {userMenuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={styles.dropdownItem}
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <span style={{ marginRight: '10px' }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                  <div style={styles.dropdownDivider} />
                  <button
                    onClick={handleLogout}
                    style={styles.dropdownLogout}
                  >
                    <span style={{ marginRight: '10px' }}>🚪</span>
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mobile Hamburger Menu */}
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={styles.hamburgerButton}
              aria-label="Toggle menu"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {mobileMenuOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobile && mobileMenuOpen && (
        <div style={styles.mobileMenu}>
          <nav style={styles.mobileNav}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={isActive(link.href) ? styles.mobileNavLinkActive : styles.mobileNavLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div style={styles.mobileUserSection}>
            <div style={styles.mobileUserInfo}>
              <span style={styles.mobileUserEmail} title={userEmail}>{userEmail}</span>
              <span style={styles.mobileUserRole}>{userRole || 'salesperson'}</span>
            </div>
            {/* Mobile menu items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '8px' }}>
              {userMenuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={styles.mobileMenuItem}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span style={{ marginRight: '10px' }}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
            <button onClick={handleLogout} style={styles.mobileLogoutButton}>
              🚪 Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  navHeader: {
    background: brandColors.gradient,
    padding: '0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
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
  // Desktop user button (avatar + chevron)
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    padding: '4px 10px 4px 4px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: brandColors.primary,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.5px',
  },
  // Dropdown menu
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: '240px',
    backgroundColor: 'white',
    borderRadius: '10px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    zIndex: 1001,
  },
  dropdownHeader: {
    padding: '14px 16px',
  },
  dropdownEmail: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#1a1a1a',
    wordBreak: 'break-all',
    marginBottom: '4px',
  },
  dropdownRole: {
    display: 'inline-block',
    backgroundColor: 'rgba(13, 115, 119, 0.1)',
    color: brandColors.primary,
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  dropdownDivider: {
    height: '1px',
    backgroundColor: '#eee',
    margin: '0',
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    fontSize: '14px',
    color: '#333',
    textDecoration: 'none',
    transition: 'background 0.15s',
    cursor: 'pointer',
  },
  dropdownLogout: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '10px 16px',
    fontSize: '14px',
    color: '#c0392b',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  // Mobile styles
  hamburgerButton: {
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileMenu: {
    backgroundColor: brandColors.primaryDark,
    borderTop: '1px solid rgba(255,255,255,0.1)',
    padding: '16px 0',
  },
  mobileNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '16px',
  },
  mobileNavLink: {
    padding: '12px 24px',
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '500',
    display: 'block',
  },
  mobileNavLinkActive: {
    padding: '12px 24px',
    color: 'white',
    backgroundColor: 'rgba(255,255,255,0.1)',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: '500',
    display: 'block',
    borderLeft: `3px solid ${brandColors.primary}`,
  },
  mobileUserSection: {
    padding: '16px 24px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  mobileUserInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  mobileUserEmail: {
    color: 'white',
    fontSize: '14px',
    wordBreak: 'break-all',
  },
  mobileUserRole: {
    backgroundColor: 'rgba(34, 211, 230, 0.2)',
    color: brandColors.accent,
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    textTransform: 'capitalize',
    alignSelf: 'flex-start',
  },
  mobileMenuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    color: 'rgba(255,255,255,0.8)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: '500',
  },
  mobileLogoutButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: 'white',
    padding: '10px 16px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%',
    marginTop: '4px',
  },
};

// Mobile-specific styles override
if (typeof window !== 'undefined') {
  const mobileMediaQuery = window.matchMedia('(max-width: 767px)');
  if (mobileMediaQuery.matches) {
    styles.navContent = {
      ...styles.navContent,
      height: '56px',
    };
  }
}
