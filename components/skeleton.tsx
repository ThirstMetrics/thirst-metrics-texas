'use client';

import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

/**
 * Skeleton component for loading states
 * Uses shimmer animation with brand-consistent colors
 */
export default function Skeleton({
  variant = 'text',
  width,
  height,
  style,
}: SkeletonProps) {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'circular':
        return {
          borderRadius: '50%',
          width: width || 40,
          height: height || 40,
        };
      case 'rectangular':
        return {
          borderRadius: '4px',
          width: width || '100%',
          height: height || 100,
        };
      case 'text':
      default:
        return {
          borderRadius: '4px',
          width: width || '100%',
          height: height || 16,
        };
    }
  };

  const baseStyles: React.CSSProperties = {
    display: 'inline-block',
    backgroundColor: '#f0f0f0',
    backgroundImage: 'linear-gradient(90deg, #f0f0f0 0%, #e0e0e0 50%, #f0f0f0 100%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    ...getVariantStyles(),
    ...style,
  };

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
        `}
      </style>
      <span style={baseStyles} />
    </>
  );
}

/**
 * Skeleton row for table loading states
 */
export function SkeletonTableRow({ columns }: { columns: number }) {
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} style={{ padding: '12px' }}>
          <Skeleton variant="text" height={16} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Pre-built skeleton for customer list table
 */
export function CustomerListSkeleton({ rows = 6 }: { rows?: number }) {
  const columns = 5; // Name, Total Revenue, Location, Last Receipt, Actions

  return (
    <table style={skeletonTableStyles.table}>
      <thead>
        <tr>
          <th style={{ ...skeletonTableStyles.th, minWidth: 200 }}>Name</th>
          <th style={{ ...skeletonTableStyles.th, minWidth: 120, textAlign: 'right' }}>Total Revenue</th>
          <th style={{ ...skeletonTableStyles.th, minWidth: 150 }}>Location</th>
          <th style={{ ...skeletonTableStyles.th, minWidth: 110 }}>Last Receipt</th>
          <th style={{ ...skeletonTableStyles.th, minWidth: 80, textAlign: 'center' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <tr key={rowIndex} style={skeletonTableStyles.tr}>
            <td style={skeletonTableStyles.td}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Skeleton variant="text" width="80%" height={16} />
                <Skeleton variant="text" width="60%" height={12} />
              </div>
            </td>
            <td style={{ ...skeletonTableStyles.td, textAlign: 'right' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <Skeleton variant="text" width={80} height={16} />
                <Skeleton variant="text" width={50} height={12} />
              </div>
            </td>
            <td style={skeletonTableStyles.td}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Skeleton variant="text" width="70%" height={14} />
                <Skeleton variant="text" width="50%" height={12} />
              </div>
            </td>
            <td style={skeletonTableStyles.td}>
              <Skeleton variant="text" width={70} height={14} />
            </td>
            <td style={{ ...skeletonTableStyles.td, textAlign: 'center' }}>
              <Skeleton variant="rectangular" width={90} height={32} style={{ borderRadius: '6px' }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Skeleton for chart loading state
 */
export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div style={chartSkeletonStyles.container}>
      <div style={{ ...chartSkeletonStyles.chart, height }}>
        {/* Y-axis labels */}
        <div style={chartSkeletonStyles.yAxis}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="text" width={40} height={12} />
          ))}
        </div>
        {/* Chart bars/area */}
        <div style={chartSkeletonStyles.chartArea}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={chartSkeletonStyles.barWrapper}>
              <Skeleton
                variant="rectangular"
                width="100%"
                height={`${30 + Math.random() * 60}%`}
                style={{ borderRadius: '4px 4px 0 0' }}
              />
            </div>
          ))}
        </div>
      </div>
      {/* X-axis labels */}
      <div style={chartSkeletonStyles.xAxis}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="text" width={50} height={12} />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for map loading state
 */
export function MapSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div style={{ ...mapSkeletonStyles.container, height }}>
      <div style={mapSkeletonStyles.content}>
        <Skeleton variant="circular" width={48} height={48} />
        <Skeleton variant="text" width={120} height={16} style={{ marginTop: '12px' }} />
      </div>
    </div>
  );
}

// Skeleton table styles
const skeletonTableStyles: Record<string, React.CSSProperties> = {
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'white',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  th: {
    padding: '14px 12px',
    textAlign: 'left',
    background: '#e6f5f5',
    fontWeight: '600',
    fontSize: '13px',
    borderBottom: '2px solid rgba(13, 115, 119, 0.12)',
    color: '#042829',
  },
  tr: {
    borderBottom: '1px solid #eee',
  },
  td: {
    padding: '12px',
    fontSize: '14px',
  },
};

// Chart skeleton styles
const chartSkeletonStyles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
  },
  chart: {
    display: 'flex',
    gap: '16px',
  },
  yAxis: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: '40px',
    paddingRight: '8px',
  },
  chartArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '12px',
  },
  barWrapper: {
    flex: 1,
    display: 'flex',
    alignItems: 'flex-end',
    height: '100%',
  },
  xAxis: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '12px',
    marginLeft: '56px',
  },
};

// Map skeleton styles
const mapSkeletonStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
};
