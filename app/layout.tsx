/**
 * Root Layout
 * Provides the base HTML structure for all pages
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Thirst Metrics Texas',
  description: 'Sales intelligence platform for beverage distributors in Texas',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
