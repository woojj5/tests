// components/SummaryCards.tsx
'use client';

type Props = {
  total_vehicles: number;
  total_avg_soh: number;
  total_avg_soc: number;
  total_bms_records: number;
  total_gps_records: number;
};

export default function SummaryCards(p: Props) {
  const { total_bms_records, total_gps_records } = p;
  const total_points = (total_bms_records || 0) + (total_gps_records || 0);

  const Card = ({ title, value }: { title: string; value: string | number }) => (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
      <div className="text-sm text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="BMS 레코드" value={total_bms_records.toLocaleString()} />
      <Card title="GPS 레코드" value={total_gps_records.toLocaleString()} />
      <Card title="전체 레코드" value={total_points.toLocaleString()} />
    </div>
  );
}
