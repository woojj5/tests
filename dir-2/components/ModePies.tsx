// components/ModePies.tsx
'use client';

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

type Slice = { name: string; value: number };
export default function ModePies(props: {
  title?: string;
  leftTitle: string;
  rightTitle: string;
  left: Slice[];
  right: Slice[];
  leftTotalLabel?: string;   // 예: "total 63248m"
  rightTotalLabel?: string;  // 예: "total 7462m"
}) {
  const { title, leftTitle, rightTitle, left, right, leftTotalLabel, rightTotalLabel } = props;

  const renderLabel = (entry: Slice) => {
    const sum = (arr: Slice[]) => arr.reduce((s, d) => s + (d.value || 0), 0);
    const pct = (entry.value / Math.max(1, sum(left))) * 100;
    return `${entry.name} ${pct.toFixed(1)}%`;
  };

  const COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#06b6d4'];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
        <div className="text-sm text-zinc-500 mb-1">
          {leftTitle}{leftTotalLabel ? ` (${leftTotalLabel})` : ''}
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={left} dataKey="value" nameKey="name" label={({ name, value }) => renderLabel({ name, value })}>
                {left.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
        <div className="text-sm text-zinc-500 mb-1">
          {rightTitle}{rightTotalLabel ? ` (${rightTotalLabel})` : ''}
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={right} dataKey="value" nameKey="name" label={({ name, value }) => `${name} ${(value / Math.max(1, right.reduce((s,d)=>s+d.value,0)) * 100).toFixed(1)}%`}>
                {right.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
