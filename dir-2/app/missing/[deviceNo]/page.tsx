// app/missing/[deviceNo]/page.tsx
import 'server-only';
export const runtime = 'nodejs';

import dynamic from 'next/dynamic';
import { bucket, FIELDS, MEASUREMENTS, TAGS, queryInflux } from '@/lib/database';
import { START_TIME, END_TIME } from '@/lib/data-access';

const SvgMissingLineChart = dynamic(() => import('@/components/SvgMissingLineChart'), { ssr: false });

type PageParams = { params: { deviceNo: string } };
type Point = { time: string; value: number | null };

async function fetchDailyMedianDeltaSeconds(p: {
  measurement: string;
  field: string;
  deviceNo: string;
  start?: string;
  stop?: string;
}): Promise<Point[]> {
  const start = p.start ?? START_TIME;
  const stop  = p.stop  ?? END_TIME;

  const flux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: time(v: ${JSON.stringify(start)}), stop: time(v: ${JSON.stringify(stop)}))
|> filter(fn: (r) => r._measurement == ${JSON.stringify(p.measurement)})
|> filter(fn: (r) => r._field == ${JSON.stringify(p.field)})
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(p.deviceNo)})
|> filter(fn: (r) => exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}])
|> elapsed(unit: 1s)
|> filter(fn: (r) => exists r.elapsed and r.elapsed > 0)
|> keep(columns: ["_time","elapsed"])
|> rename(columns: {elapsed: "_value"})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 1d, fn: median, createEmpty: true, offset: 9h)
|> keep(columns: ["_time","_value"])
`;

  const rows = await queryInflux<{ _time: string; _value: number | null }>(flux, r => ({
    _time: String(r._time),
    _value: r._value == null ? null : Number(r._value),
  }));

  return rows
    .map(r => ({ time: new Date(r._time).toISOString().slice(0, 10), value: r._value }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export default async function MissingDeviceDetailPage({ params }: PageParams) {
  const { deviceNo } = params;

  const [bms, gps] = await Promise.all([
    fetchDailyMedianDeltaSeconds({ measurement: MEASUREMENTS.BMS, field: FIELDS.PACK_CURRENT, deviceNo }),
    fetchDailyMedianDeltaSeconds({ measurement: MEASUREMENTS.GPS, field: FIELDS.SPEED, deviceNo }),
  ]);

  const dates = Array.from(new Set([...bms.map(d => d.time), ...gps.map(d => d.time)])).sort();
  const data = dates.map(d => ({
    date: d,
    bms: bms.find(x => x.time === d)?.value ?? undefined,
    gps: gps.find(x => x.time === d)?.value ?? undefined,
  }));

  const startLabel = new Date(START_TIME).toLocaleDateString('ko-KR');
  const endLabel = new Date(new Date(END_TIME).getTime() - 1).toLocaleDateString('ko-KR');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">결측치(Δt) 분포 — {deviceNo}</h1>
        <a href="/missing" className="underline text-sm text-zinc-400">← 목록으로</a>
      </div>

      <p className="text-sm text-zinc-400">
        각 일자별로, 같은 디바이스 내 연속 레코드 간 시간 간격(초)의 중앙값(P50)을 라인으로 표시합니다.
        값이 클수록 해당 일의 데이터 간격이 벌어진(결측 구간 가능성 ↑) 것으로 해석할 수 있습니다.
      </p>

      <SvgMissingLineChart data={data} height={360} />

      <div className="text-xs text-zinc-500">
        기준 필드: BMS → <code>pack_current</code>, GPS → <code>speed</code>. 기간: {startLabel} ~ {endLabel} (KST)
      </div>
    </div>
  );
}
