/**
 * Mobile Bottom Spacer
 * Adds padding at the bottom of the page on mobile to prevent content
 * from being hidden behind the fixed bottom tab bar.
 */

'use client';

import { useIsMobile } from '@/lib/hooks/use-media-query';

export default function MobileBottomSpacer() {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <div
      style={{
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        flexShrink: 0,
      }}
      aria-hidden="true"
    />
  );
}
