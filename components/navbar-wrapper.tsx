'use client';

import { usePathname } from 'next/navigation';
import NavBar from './navbar';

interface NavBarWrapperProps {
  userEmail: string;
  userRole: string;
}

// Routes where we should NOT show the navbar
const publicRoutes = ['/', '/login', '/signup'];

export default function NavBarWrapper({ userEmail, userRole }: NavBarWrapperProps) {
  const pathname = usePathname();

  // Don't show navbar on public routes
  const isPublicRoute = publicRoutes.some(route =>
    pathname === route || pathname.startsWith('/login') || pathname.startsWith('/signup')
  );

  if (isPublicRoute) {
    return null;
  }

  return (
    <NavBar
      currentPath={pathname}
      userEmail={userEmail}
      userRole={userRole}
    />
  );
}
