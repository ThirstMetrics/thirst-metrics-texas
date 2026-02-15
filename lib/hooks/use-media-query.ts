/**
 * Media Query Hook
 * Provides responsive breakpoint detection for mobile-first design
 */

'use client';

import { useState, useEffect } from 'react';

/**
 * SSR-safe hook that returns boolean for media query matches
 * Handles hydration mismatch by starting with false
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

/**
 * Hook to detect mobile viewport (max-width: 768px)
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

/**
 * Hook to detect tablet viewport (max-width: 1024px)
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(max-width: 1024px)');
}

/**
 * Hook to detect small mobile viewport (max-width: 480px)
 */
export function useIsSmallMobile(): boolean {
  return useMediaQuery('(max-width: 480px)');
}

export default useMediaQuery;
