// app/analysis/page.tsx  (서버 컴포넌트)
import 'server-only';
export const runtime = 'nodejs';
// force-dynamic 제거: RSC 캐시를 활성화하여 성능 최적화
// export const dynamic = 'force-dynamic'; // 주석 처리

import SummaryCards from '@/components/SummaryCards';
import InferenceDemo from '@/components/InferenceDemo';
import SOCEstimationDemo from '@/components/SOCEstimationDemo';

import {
  getDashboardSummaryCached,
  listAllMeasurementFieldsCached,
  fetchFieldCountsByCarTypeCached,
  START_TIME,
  END_TIME,
} from '@/lib/data-access';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR');
const fmtNum = (n: number) =>
  Number.isFinite(Number(n)) ? Number(n).toLocaleString('ko-KR') : '-';

const CAR_TYPES: Array<'PORTER2' | 'BONGO3' | 'GV60'> = ['PORTER2', 'BONGO3', 'GV60'];

export default async function AnalysisPage() {
  console.time('[AnalysisRender] total');

  // 병렬로 캐시된 데이터 가져오기
  console.time('[AnalysisRender] data-fetch');
  const [s, fieldsResult, perTypeFieldCounts] = await Promise.all([
    getDashboardSummaryCached(),
    listAllMeasurementFieldsCached({
      start: START_TIME,
      stop: END_TIME,
    }),
    fetchFieldCountsByCarTypeCached(),
  ]);
  console.timeEnd('[AnalysisRender] data-fetch');

  const { bms, gps } = fieldsResult;
  const order = CAR_TYPES;
  
  console.timeEnd('[AnalysisRender] total');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">개괄 분석</h1>

      <SummaryCards
        total_vehicles={s.total_vehicles}
        total_avg_soh={s.total_avg_soh}
        total_avg_soc={s.total_avg_soc}
        total_bms_records={s.total_bms_records}
        total_gps_records={s.total_gps_records}
      />

      {/* 차종별 레코드 개수 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">차종별 레코드 개수 (BMS / GPS)</h2>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-zinc-50/60 dark:bg-zinc-900/40">
              <tr className="text-zinc-500">
                <th className="text-left px-4 py-2">차종</th>
                <th className="text-right px-4 py-2">BMS</th>
                <th className="text-right px-4 py-2">GPS</th>
                <th className="text-right px-4 py-2">총합</th>
                <th className="text-right px-4 py-2">디바이스 수</th>
                <th className="text-right px-4 py-2">평균 SOC</th>
                <th className="text-right px-4 py-2">평균 SOH</th>
              </tr>
            </thead>
            <tbody>
              {order.map((ct) => {
                const row = s.car_type_stats[ct];
                if (!row) return null;
                return (
                  <tr key={ct} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <td className="px-4 py-2 font-medium">{ct}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(row.BMS)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(row.GPS)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(row.total_records)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(row.device_count)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(row.avg_soc)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(row.avg_soh)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          집계 기간: {fmtDate(START_TIME)} ~ {fmtDate(new Date(new Date(END_TIME).getTime() - 1).toISOString())}
        </p>
      </section>

      {/* 차종별 필드 수 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">차종별 필드 수 (관측된 `_field` 개수)</h2>
        <div className="overflow-x-auto rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
          <table className="min-w-[560px] w-full text-sm">
            <thead className="bg-zinc-50/60 dark:bg-zinc-900/40">
              <tr className="text-zinc-500">
                <th className="text-left px-4 py-2">차종</th>
                <th className="text-right px-4 py-2">BMS 필드 수</th>
                <th className="text-right px-4 py-2">GPS 필드 수</th>
              </tr>
            </thead>
            <tbody>
              {order.map((ct) => {
                const c = perTypeFieldCounts[ct] || { bms: 0, gps: 0 };
                return (
                  <tr key={ct} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <td className="px-4 py-2 font-medium">{ct}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(c.bms)}</td>
                    <td className="px-4 py-2 text-right">{fmtNum(c.gps)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          기준 기간: {fmtDate(START_TIME)} ~ {fmtDate(new Date(new Date(END_TIME).getTime() - 1).toISOString())}
        </p>
      </section>

      {/* 전체 필드 목록 */}
      <section className="space-y-3">
        <div className="text-sm text-zinc-500">
          전체 필드 목록 기준 기간: {fmtDate(START_TIME)} ~ {fmtDate(new Date(new Date(END_TIME).getTime() - 1).toISOString())}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold">aicar_bms</div>
              <div className="text-sm text-zinc-500">필드 수: {bms.length.toLocaleString('ko-KR')}</div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400">필드 목록 펼치기</summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {bms.map((f) => <div key={f} className="truncate">{f}</div>)}
              </div>
            </details>
          </div>

          <div className="rounded-2xl shadow p-4 bg-white dark:bg-zinc-900">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold">aicar_gps</div>
              <div className="text-sm text-zinc-500">필드 수: {gps.length.toLocaleString('ko-KR')}</div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400">필드 목록 펼치기</summary>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {gps.map((f) => <div key={f} className="truncate">{f}</div>)}
              </div>
            </details>
          </div>
        </div>

        <p className="text-xs text-zinc-500">※ 목록과 개수는 지정 기간 내에 실제로 관측된 `_field` 기준입니다.</p>
      </section>

      {/* 머신러닝 추론 API 통합 데모 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">머신러닝 추론 API 통합</h2>
        <InferenceDemo />
      </section>

      {/* SOC 추정 API 통합 데모 */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">SOC 추정 (RevIN + GRU + UKF)</h2>
        <SOCEstimationDemo />
      </section>

    </div>
  );
}
