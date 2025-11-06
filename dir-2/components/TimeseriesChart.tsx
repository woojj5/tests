// components/TimeseriesChart.tsx
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';

type Row = { time: string; value: number; field: string };

export default function TimeseriesChart({
  rows,
  title = 'Timeseries',
}: {
  rows: Row[];
  title?: string;
}) {
  const fields = Array.from(new Set(rows.map((r) => r.field)));

  return (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
      <div className="mb-2 font-semibold">{title}</div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" tickFormatter={(v) => new Date(v).toLocaleString()} />
          <YAxis />
          <Tooltip labelFormatter={(v) => new Date(String(v)).toLocaleString()} />
          <Legend />
          {fields.map((f) => (
            <Line
              key={f}
              name={f}
              dot={false}
              isAnimationActive={false}
              connectNulls
              // 이 라인의 값만 그리도록 함수형 dataKey 사용
              dataKey={(d: Row) => (d.field === f ? d.value : null)}
              type="monotone"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
