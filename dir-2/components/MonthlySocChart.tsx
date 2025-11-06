'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type Props = { data: Array<{ time: string; soc: number }> };

export default function MonthlySocChart({ data }: Props) {
  return (
    // 부모에 너비/높이 보장
    <div className="w-full min-w-0 min-h-[320px]">
      {/* 방법 A: 고정 높이 */}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="soc" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      {/*
      // 방법 B: 가로폭 기준 aspect 사용(고정 높이 대신)
      <ResponsiveContainer width="100%" aspect={2.0}>
        ...
      </ResponsiveContainer>
      */}
    </div>
  );
}
