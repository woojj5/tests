// components/MonthlySocLine.tsx
'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

type Point = { time: string; avg_soc: number | null };

export default function MonthlySocLine({ data }: { data: Point[] }) {
  // X축 라벨을 'YYYY. M.' 형식으로
  const labeled = data.map(d => ({
    ...d,
    label: new Date(d.time).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric' }),
  }));

  return (
    <div className="w-full min-w-0 min-h-[320px]">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={labeled}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          {/* null 값은 자동으로 gap 처리됩니다 */}
          <Line type="monotone" dataKey="avg_soc" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
