/**
 * Revenue Chart Component
 * Displays monthly revenue using Recharts
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

interface RevenueChartProps {
  data: MonthlyRevenue[];
}

export default function RevenueChart({ data }: RevenueChartProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  // Format data for chart
  const chartData = data.map((item) => ({
    month: item.month,
    total: item.total_receipts || 0,
    liquor: item.liquor_receipts || 0,
    wine: item.wine_receipts || 0,
    beer: item.beer_receipts || 0,
    cover: item.cover_charge_receipts || 0,
  }));
  
  if (chartData.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No revenue data available</div>;
  }
  
  return (
    <div>
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
          <Bar dataKey="total" fill="#667eea" name="Total Revenue" />
          <Bar dataKey="liquor" fill="#f093fb" name="Liquor" />
          <Bar dataKey="wine" fill="#4facfe" name="Wine" />
          <Bar dataKey="beer" fill="#43e97b" name="Beer" />
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
          <Line
            type="monotone"
            dataKey="total"
            stroke="#667eea"
            strokeWidth={2}
            name="Total Revenue"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
