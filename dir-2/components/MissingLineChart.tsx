'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from 'recharts';

type Row = { date: string; bms?: number; gps?: number };

export default function MissingLineChart({ data }: { data: Row[] }) {
  // null → undefined는 서버에서 처리됨. 여기서는 렌더만 신경.
  const tickFormatter = (d: string) => d.slice(5); // 'YYYY-MM-DD' -> 'MM-DD'
  const valueFormatter = (v: number) =>
    Number.isFinite(v) ? `${Math.round(v)} s` : '-';

  const hasAny = data?.some(d =>
    Number.isFinite(d.bms as number) || Number.isFinite(d.gps as number)
  );

  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-zinc-800/60 p-6 bg-white dark:bg-zinc-900 text-zinc-400">
        표시할 Δt 중앙값 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800/60 p-3 bg-white dark:bg-zinc-900 h-[360px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="date" tickFormatter={tickFormatter} />
          <YAxis tickFormatter={(v)=>`${Math.round(Number(v))}s`} />
          <Tooltip
            formatter={(value) => valueFormatter(Number(value))}
            labelFormatter={(label) => `날짜: ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="bms"
            name="BMS Δt P50"
            dot={false}
            strokeWidth={2}
            connectNulls
            stroke="#22c55e"
          />
          <Line
            type="monotone"
            dataKey="gps"
            name="GPS Δt P50"
            dot={false}
            strokeWidth={2}
            connectNulls
            stroke="#3b82f6"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
