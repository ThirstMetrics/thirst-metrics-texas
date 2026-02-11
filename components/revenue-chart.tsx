/**
 * Revenue Chart Component
 * Displays monthly revenue using Recharts with toggle controls
 */

'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { MonthlyRevenue } from '@/lib/data/beverage-receipts';

interface VisibleSeries {
  total: boolean;
  liquor: boolean;
  wine: boolean;
  beer: boolean;
}

interface RevenueChartProps {
  data: MonthlyRevenue[];
  visibleSeries?: VisibleSeries;
  onSeriesToggle?: (series: keyof VisibleSeries) => void;
}

// Brand colors from thirstmetrics.com
const brandColors = {
  primary: '#0d7377',      // brand-500 (teal)
  primaryDark: '#042829',  // brand-900
  primaryLight: '#e6f5f5', // brand-50
  accent: '#22d3e6',       // accent-400 (cyan)
  hover: '#0a5f63',        // brand-600
};

const seriesColors = {
  total: brandColors.primary,  // teal (brand primary)
  liquor: '#f093fb',           // pink
  wine: '#4facfe',             // blue
  beer: '#43e97b',             // green
};

const seriesLabels = {
  total: 'Total Revenue',
  liquor: 'Liquor',
  wine: 'Wine',
  beer: 'Beer',
};

export default function RevenueChart({ data, visibleSeries, onSeriesToggle }: RevenueChartProps) {
  // Default all series to visible if not provided
  const series = visibleSeries ?? { total: true, liquor: true, wine: true, beer: true };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const safe = (v: unknown): number => {
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'number' && !isNaN(v)) return v;
    return 0;
  };

  // Format data for chart (match MonthlyRevenue field names)
  const chartData = (data ?? []).map((item: MonthlyRevenue) => ({
    month: typeof item.month === 'string' ? item.month : String(item.month ?? ''),
    total: safe(item.total_receipts),
    liquor: safe(item.liquor_receipts),
    wine: safe(item.wine_receipts),
    beer: safe(item.beer_receipts),
    cover: safe(item.cover_charge_receipts),
  }));

  if (chartData.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No revenue data available</div>;
  }

  return (
    <div>
      {/* Series Toggle Buttons */}
      {onSeriesToggle && (
        <div style={styles.seriesToggleRow}>
          <span style={styles.seriesLabel}>Show:</span>
          {(Object.keys(seriesColors) as (keyof VisibleSeries)[]).map((key) => (
            <button
              key={key}
              onClick={() => onSeriesToggle(key)}
              style={{
                ...styles.seriesToggle,
                backgroundColor: series[key] ? seriesColors[key] : '#e5e7eb',
                color: series[key] ? 'white' : '#6b7280',
                borderColor: series[key] ? seriesColors[key] : '#d1d5db',
              }}
            >
              {seriesLabels[key]}
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelStyle={{ color: '#333' }}
          />
          <Legend />
          {series.total && <Bar dataKey="total" fill={seriesColors.total} name="Total Revenue" />}
          {series.liquor && <Bar dataKey="liquor" fill={seriesColors.liquor} name="Liquor" />}
          {series.wine && <Bar dataKey="wine" fill={seriesColors.wine} name="Wine" />}
          {series.beer && <Bar dataKey="beer" fill={seriesColors.beer} name="Beer" />}
        </BarChart>
      </ResponsiveContainer>

      {/* Line chart for trend */}
      <ResponsiveContainer width="100%" height={300} style={{ marginTop: '24px' }}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelStyle={{ color: '#333' }}
          />
          <Legend />
          {series.total && (
            <Line
              type="monotone"
              dataKey="total"
              stroke={seriesColors.total}
              strokeWidth={2}
              name="Total Revenue"
            />
          )}
          {series.liquor && (
            <Line
              type="monotone"
              dataKey="liquor"
              stroke={seriesColors.liquor}
              strokeWidth={2}
              name="Liquor"
            />
          )}
          {series.wine && (
            <Line
              type="monotone"
              dataKey="wine"
              stroke={seriesColors.wine}
              strokeWidth={2}
              name="Wine"
            />
          )}
          {series.beer && (
            <Line
              type="monotone"
              dataKey="beer"
              stroke={seriesColors.beer}
              strokeWidth={2}
              name="Beer"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const styles = {
  seriesToggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const,
  },
  seriesLabel: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginRight: '4px',
  },
  seriesToggle: {
    padding: '8px 14px',
    border: '2px solid',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
};
