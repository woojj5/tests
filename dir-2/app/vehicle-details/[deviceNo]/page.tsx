// app/vehicle-details/[deviceNo]/page.tsx
import 'server-only';
export const runtime = 'nodejs';

import { notFound } from 'next/navigation';
import {
  FIELDS, MEASUREMENTS, TAGS,
  queryInflux, buildBaseRangeFlux, addFieldFilter, addTagEquals,
} from '@/lib/database';
import {
  START_TIME, END_TIME,
  fetchLatestChargeAndSpeed, fetchMonthlyAvgSoc,
  fetchModeMinutes,                 // ✅ 추가
} from '@/lib/data-access';
import { MonthlyDistanceChart, DailyDistanceChart } from '@/components/DistanceCharts';
import MonthlySocLine from '@/components/MonthlySocLine';
import ModePies from '@/components/ModePies';      // ✅ 추가

const fmt = (n: number, d = 0) =>
  Number.isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: d }) : '-';

type Props = { params: { deviceNo: string } };

export default async function VehicleDetailsPage({ params }: Props) {
  const deviceNo = params.deviceNo;
  if (!deviceNo) notFound();

  /* ---------- 전체 구간 월별 주행거리(오도미터 차분) ---------- */
  let monthlyFlux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: START_TIME, stop: END_TIME });
  monthlyFlux = addFieldFilter(monthlyFlux, [FIELDS.ODOMETER]);
  monthlyFlux = addTagEquals(monthlyFlux, TAGS.DEVICE_NO, deviceNo);
  monthlyFlux = `${monthlyFlux}
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 30d, fn: last, createEmpty: false)
|> difference(nonNegative: true, columns: ["_value"])
|> keep(columns: ["_time","_value"])
|> yield(name: "monthly")`;

  const monthlyRows = await queryInflux(monthlyFlux, (r:any)=>({ time:r._time as string, km:Number(r._value)||0 }));

  /* ---------- 8월(2023-08-01 ~ 2023-08-31) 일별 주행거리 ---------- */
  const last30Start = '2023-08-01T00:00:00+09:00';
  const last30Stop  = '2023-09-01T00:00:00+09:00';
  let dailyFlux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: last30Start, stop: last30Stop });
  dailyFlux = addFieldFilter(dailyFlux, [FIELDS.ODOMETER]);
  dailyFlux = addTagEquals(dailyFlux, TAGS.DEVICE_NO, deviceNo);
  dailyFlux = `${dailyFlux}
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 1d, fn: last, createEmpty: false)
|> difference(nonNegative: true, columns: ["_value"])
|> keep(columns: ["_time","_value"])
|> yield(name: "daily")`;

  const dailyRows = await queryInflux(dailyFlux, (r:any)=>({ time:r._time as string, km:Number(r._value)||0 }));

  // 집계값
  const totalKm   = monthlyRows.reduce((s:any,r:any)=>s+(r.km||0),0);
  const monthSum  = dailyRows.reduce((s:any,r:any)=>s+(r.km||0),0);
  const monthCnt  = monthlyRows.length || 1;
  const monthAvg  = totalKm / monthCnt;
  const monthMax  = monthlyRows.reduce((m:any,r:any)=> Math.max(m, r.km||0), 0);

  /* ---------- 최신 속도/충전 상태/충전 전력 ---------- */
  const live = await fetchLatestChargeAndSpeed(deviceNo, { start: START_TIME, stop: END_TIME });

  /* ---------- 월별 평균 SOC 데이터 ---------- */
  const monthlySoc = await fetchMonthlyAvgSoc(deviceNo); // [{ time, avg_soc|null }]

  /* ---------- 모드 분포(파이 차트) 데이터 ---------- */
  const mode = await fetchModeMinutes(deviceNo, { start: START_TIME, stop: END_TIME });
  const gpsPie = [
    { name: 'park', value: mode.gps.park },
    { name: 'low',  value: mode.gps.low },
    { name: 'high', value: mode.gps.high },
  ];
  const bmsPie = [
    { name: 'idle',       value: mode.bms.idle },
    { name: 'chg_slow',   value: mode.bms.chg_slow },
    { name: 'chg_fast',   value: mode.bms.chg_fast },
    { name: 'discharged', value: mode.bms.discharged },
  ];

  /* ---------- 차트용 데이터 ---------- */
  const monthlyChartData = monthlyRows.map((r:any) => ({
    label: new Date(r.time).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit' }),
    value: Math.round(r.km),
  }));

  const dailyChartData = dailyRows.map((r:any) => ({
    label: new Date(r.time).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }),
    value: Math.round(r.km),
  }));

  /* ---------- UI ---------- */
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">디바이스 종합 상세: {deviceNo}</h1>

      {/* 상단 카드: 실시간/최신 주행·충전 요약 */}
      <div className="grid gap-4 md:grid-cols-6">
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">속도 (km/h)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(live.speed, 0)}</div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">충전 상태</div>
          <div className="mt-1 text-2xl font-semibold">{live.charging_status ?? '-'}</div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">충전 전력 (kW)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(live.charging_power, 1)}</div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">팩 전압 (V)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(live.pack_volt, 1)}</div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">팩 전류 (A)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(live.pack_current, 1)}</div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">차량 상태</div>
          <div className="mt-1 text-2xl font-semibold">{live.vehicle_status ?? '-'}</div>
        </div>
      </div>

      {/* 누적/8월 합계/평균/최대 */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">전체 구간 누적 주행(km)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(totalKm)}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {new Date(START_TIME).toLocaleDateString('ko-KR')} ~ {new Date(new Date(END_TIME).getTime()-1).toLocaleDateString('ko-KR')}
          </div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">8월 합계(km)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(monthSum)}</div>
          <div className="text-xs text-zinc-500 mt-1">2023-08-01 ~ 2023-08-31</div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">월평균 주행(km)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(monthAvg)}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {new Date(START_TIME).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit' })} ~ {new Date(new Date(END_TIME).getTime()-1).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit' })}
          </div>
        </div>
        <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
          <div className="text-sm text-zinc-500">최대 월 주행(km)</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(monthMax)}</div>
          <div className="text-xs text-zinc-500 mt-1">
            {new Date(START_TIME).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit' })} ~ {new Date(new Date(END_TIME).getTime()-1).toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit' })}
          </div>
        </div>
      </div>

      {/* 🔹 차트 영역: 주행거리 */}
      <div className="grid gap-4 md:grid-cols-2">
        <MonthlyDistanceChart data={monthlyChartData} />
        <DailyDistanceChart data={dailyChartData} />
      </div>

      {/* 🔹 월별 평균 SOC 선 그래프 */}
      <section className="space-y-3 w-full min-w-0">
        <h2 className="text-lg font-semibold">전체 월별 평균 SOC (2022-12 ~ 2023-08, KST)</h2>
        <MonthlySocLine data={monthlySoc} />
      </section>

      {/* 🔹 모드 분포 파이 차트 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">모드 분포 (분 단위)</h2>
        <ModePies
          leftTitle={`GPS (total ${mode.gps.total}m)`}
          rightTitle={`BMS (total ${mode.bms.total}m)`}
          left={gpsPie}
          right={bmsPie}
        />
      </section>

      {/* 표 - 전체 월별 */}
      <div className="space-y-2">
        <h2 className="font-semibold">전체 월별 주행거리 (KST)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500">
              <th className="text-left py-2">월(윈도우 끝)</th>
              <th className="text-right py-2">주행거리(km)</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRows.map((r:any, idx:number)=>(
              <tr key={idx} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                <td className="py-2">{new Date(r.time).toLocaleDateString('ko-KR', { year:'numeric', month:'numeric' })}</td>
                <td className="py-2 text-right">{fmt(r.km)}</td>
              </tr>
            ))}
            {monthlyRows.length===0 && (
              <tr><td className="py-4 text-zinc-500" colSpan={2}>데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 표 - 일별(8월) */}
      <div className="space-y-2">
        <h2 className="font-semibold">마지막 30일 일별 주행거리 (2023-08-01 ~ 2023-08-31, KST)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-500">
              <th className="text-left py-2">날짜(윈도우 끝)</th>
              <th className="text-right py-2">주행거리(km)</th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.map((r:any, idx:number)=>(
              <tr key={idx} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                <td className="py-2">{new Date(r.time).toLocaleDateString('ko-KR')}</td>
                <td className="py-2 text-right">{fmt(r.km)}</td>
              </tr>
            ))}
            {dailyRows.length===0 && (
              <tr><td className="py-4 text-zinc-500" colSpan={2}>데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
