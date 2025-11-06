'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export type HistogramDatum = { bin: string; bms: number; gps: number };

export default function IntervalHistogram({ data, title }: { data: HistogramDatum[]; title: string; }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900 w-full h-[360px]">
      <div className="mb-2 font-semibold">{title}</div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bin" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="bms" name="BMS Δt 개수" />
          <Bar dataKey="gps" name="GPS Δt 개수" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
