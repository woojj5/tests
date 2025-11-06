'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';

type Row = { car_type: string; BMS: number; GPS: number; total_records: number; device_count: number };

export default function BarChartByModel({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
      <div className="mb-2 font-semibold">차종별 포인트/디바이스</div>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="car_type" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="BMS" stackId="a" />
          <Bar dataKey="GPS" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 text-xs text-zinc-500">* 막대는 기록 수(BMS/GPS), 디바이스 수는 테이블이나 카드에서 확인</div>
    </div>
  );
}
