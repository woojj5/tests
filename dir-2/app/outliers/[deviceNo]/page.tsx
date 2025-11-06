// app/outliers/[deviceNo]/page.tsx
import 'server-only';
export const runtime = 'nodejs';

import { getIqrStatsForDevice, START_TIME, END_TIME } from '@/lib/data-access';
import BoxPlot from '@/components/BoxPlot';

type Params = { params: { deviceNo: string } };

const nf = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

export default async function OutlierDevicePage({ params }: Params) {
  const deviceNo = decodeURIComponent(params.deviceNo);

  // 표본을 너무 많이 긁으면 무거워지니 최대 5000개로 제한
  const stats = await getIqrStatsForDevice(deviceNo, { limit: 5000 });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">이상치 분석: {deviceNo}</h1>
      <p className="text-sm text-zinc-400">
        기간: {new Date(START_TIME).toLocaleDateString('ko-KR')} ~ {new Date(new Date(END_TIME).getTime()-1).toLocaleDateString('ko-KR')} (표본 최대 5,000개)
      </p>

      {/* 요약 표 */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="font-semibold mb-2">BMS: {stats.bmsField}</div>
          <SummaryTable {...stats.bms} />
        </div>
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
          <div className="font-semibold mb-2">GPS: {stats.gpsField}</div>
          <SummaryTable {...stats.gps} />
        </div>
      </section>

      {/* 박스플롯 (formatter prop 제거!) */}
      <section className="space-y-6">
        <BoxPlot
          title={`BMS • ${stats.bmsField} (IQR=${nf.format(stats.bms.iqr)})`}
          stats={{
            min: stats.bms.min, q1: stats.bms.q1, median: stats.bms.median,
            q3: stats.bms.q3, max: stats.bms.max,
            lowerFence: stats.bms.lowerFence, upperFence: stats.bms.upperFence,
          }}
          width={780}
          height={100}
        />
        <BoxPlot
          title={`GPS • ${stats.gpsField} (IQR=${nf.format(stats.gps.iqr)})`}
          stats={{
            min: stats.gps.min, q1: stats.gps.q1, median: stats.gps.median,
            q3: stats.gps.q3, max: stats.gps.max,
            lowerFence: stats.gps.lowerFence, upperFence: stats.gps.upperFence,
          }}
          width={780}
          height={100}
        />
      </section>
    </div>
  );
}

function SummaryTable(p: {
  count: number; min: number; q1: number; median: number; q3: number; max: number;
  iqr: number; lowerFence: number; upperFence: number;
}) {
  const rows: [string, string][] = [
    ['표본 수', String(p.count)],
    ['최소', nf.format(p.min)],
    ['Q1', nf.format(p.q1)],
    ['중앙값(P50)', nf.format(p.median)],
    ['Q3', nf.format(p.q3)],
    ['최대', nf.format(p.max)],
    ['IQR(Q3-Q1)', nf.format(p.iqr)],
    ['하한 울타리', nf.format(p.lowerFence)],
    ['상한 울타리', nf.format(p.upperFence)],
  ];
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k,v])=>(
          <tr key={k}>
            <td className="py-1 pr-2 text-zinc-400">{k}</td>
            <td className="py-1 text-right">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
