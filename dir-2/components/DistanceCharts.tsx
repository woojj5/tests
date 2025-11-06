'use client';

import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

type Point = { label: string; value: number };

export function MonthlyDistanceChart({ data }: { data: Point[] }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
      <div className="mb-2 text-sm text-zinc-500">전체 월별 주행거리</div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function DailyDistanceChart({ data }: { data: Point[] }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
      <div className="mb-2 text-sm text-zinc-500">마지막 30일 일별 주행거리</div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
