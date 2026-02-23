/**
 * Page Content Wrapper
 * Applies responsive padding: 12px on mobile, 24px on desktop.
 * Reusable across all pages.
 */

'use client';

import { useIsMobile } from '@/lib/hooks/use-media-query';

interface PageContentWrapperProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export default function PageContentWrapper({
  children,
  maxWidth = '1400px',
}: PageContentWrapperProps) {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        padding: isMobile ? '12px' : '24px',
        maxWidth,
        margin: '0 auto',
      }}
    >
      {children}
    </div>
  );
}
