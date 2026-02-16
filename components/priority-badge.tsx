/**
 * Priority Badge Component
 * Displays a customer's revenue tier as a colored pill badge
 */

'use client';

import React from 'react';

interface PriorityBadgeProps {
  tier: 'top25' | 'top50' | 'top60' | 'top80' | 'bottom20';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const tierConfig: Record<
  PriorityBadgeProps['tier'],
  { background: string; color: string; label: string; icon: string }
> = {
  top25: {
    background: '#10b981',
    color: '#ffffff',
    label: 'Top 25%',
    icon: '\u{1F525}',
  },
  top50: {
    background: '#86efac',
    color: '#14532d',
    label: 'Top 50%',
    icon: '\u{1F4C8}',
  },
  top60: {
    background: '#fde047',
    color: '#422006',
    label: 'Top 60%',
    icon: '\u{1F4CA}',
  },
  top80: {
    background: '#fb923c',
    color: '#ffffff',
    label: 'Top 80%',
    icon: '\u{1F4C9}',
  },
  bottom20: {
    background: '#f87171',
    color: '#ffffff',
    label: 'Bottom 20%',
    icon: '\u26A0\uFE0F',
  },
};

const sizeConfig: Record<
  NonNullable<PriorityBadgeProps['size']>,
  { fontSize: string; padding: string }
> = {
  sm: { fontSize: '11px', padding: '2px 6px' },
  md: { fontSize: '13px', padding: '4px 10px' },
  lg: { fontSize: '15px', padding: '6px 14px' },
};

export default function PriorityBadge({
  tier,
  size = 'md',
  showLabel = true,
}: PriorityBadgeProps) {
  const config = tierConfig[tier];
  const sizing = sizeConfig[size];

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: config.background,
    color: config.color,
    fontSize: sizing.fontSize,
    fontWeight: '600',
    padding: sizing.padding,
    borderRadius: '12px',
    lineHeight: '1.4',
    whiteSpace: 'nowrap',
  };

  return (
    <span style={style}>
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
