import 'server-only';
export const runtime = 'nodejs';
// 동적 렌더링: 빌드 타임 정적 생성 제외
export const dynamic = 'force-dynamic';

import {
  fetchMonthlyDistanceByOdoExact,
  fetchAugustDailyDistanceByOdo,
  fetchTotalDistanceByOdoExact,
} from '@/lib/database';

const RS = '2022-12-01T00:00:00+09:00';
const RE = '2023-09-01T00:00:00+09:00';
const RANGE_LABEL = '2022-12-01 ~ 2023-08-31';

const nfKR = new Intl.NumberFormat('ko-KR');
const fmt = (n: unknown) =>
  n == null || Number.isNaN(Number(n)) ? '-' : nfKR.format(Number(n));

const toDate = (v: string | number | Date) => (v instanceof Date ? v : new Date(v));

type PageParams = { params: { deviceNo: string } };

export default async function RankingDeviceDetailPage(
  { params }: PageParams
) {
  const { deviceNo } = params;

  const [monthly, augustDaily, totalKmNum] = await Promise.all([
    fetchMonthlyDistanceByOdoExact({ deviceNo, rangeStartKST: RS, rangeStopKST: RE }),
    fetchAugustDailyDistanceByOdo({ deviceNo }),
    fetchTotalDistanceByOdoExact({ deviceNo }),
  ]);

  const toKm = (v: unknown) => Math.round(Number(v || 0));
  const sumKm = (arr: Array<{ km?: number }>) =>
    Math.round(arr.reduce((s, r) => s + Number(r.km || 0), 0));

  const totalKm     = toKm(totalKmNum);
  const monthlyTotal= sumKm(monthly);
  const monthlyMax  = Math.round(Math.max(0, ...monthly.map(r => Number(r.km || 0))));
  const monthlyAvg  = monthly.length ? Math.round(monthlyTotal / monthly.length) : 0;
  const augustSum   = sumKm(augustDaily);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">디바이스 상세(주행): {deviceNo}</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric title="전체 구간 누적(km)" value={fmt(totalKm)} sub={RANGE_LABEL} />
        <Metric title="8월 합계(km)" value={fmt(augustSum)} sub="2023-08-01 ~ 2023-08-31" />
        <Metric title="월평균 주행(km)" value={fmt(monthlyAvg)} sub="2022-12 ~ 2023-08" />
        <Metric title="최대 월 주행(km)" value={fmt(monthlyMax)} sub="2022-12 ~ 2023-08" />
      </section>

      <SectionTable
        title="전체 월별 주행거리 (2022-12 ~ 2023-08, KST)"
        head={['월(윈도우 끝)', '주행거리(km)']}
        rows={monthly.map(r => [
          toDate(r.time).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit' }),
          fmt(toKm(r.km)),
        ])}
      />

      <SectionTable
        title="마지막 30일 일별 주행거리 (2023-08-01 ~ 2023-08-31, KST)"
        head={['날짜(윈도우 끝)', '주행거리(km)']}
        rows={augustDaily.map(r => [
          toDate(r.time).toLocaleDateString('ko-KR'),
          fmt(toKm(r.km)),
        ])}
      />
    </div>
  );
}

function Metric({ title, value, sub }:{ title:string; value:string|number; sub?:string }) {
  return (
    <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
      <div className="text-sm text-zinc-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

function SectionTable(
  { title, head, rows }:{
    title: string; head: string[]; rows: (string|number)[][]
  }
) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-auto rounded-2xl border">
        <table className="min-w-[520px] w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
              {head.map((h, i) => (
                <th key={i} className={`px-4 py-2 ${i===head.length-1?'text-right':''}`} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((r, i) => (
              <tr key={i} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                {r.map((c, j) => (
                  <td key={j} className={`px-4 py-2 ${j===r.length-1?'text-right':''}`}>{c}</td>
                ))}
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={head.length}>
                  데이터 없음
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
