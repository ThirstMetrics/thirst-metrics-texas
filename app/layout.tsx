/**
 * Root Layout
 * Provides the base HTML structure for all pages
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Thirst Metrics Texas',
  description: 'Sales intelligence platform for beverage distributors in Texas',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>{children}</body>
    </html>
  );
}
