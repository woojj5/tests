import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { listDevices } from '@/lib/database';

export default async function OutliersPage() {
  const devices = await listDevices({}); // device_no 배열

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">이상치 분석</h1>
      <p className="text-sm text-zinc-400">
        디바이스를 선택하면 IQR(사분위 범위) 기반의 분포 요약과 박스플롯을 볼 수 있습니다.
      </p>

      <div className="rounded-2xl border border-zinc-700/50 overflow-hidden">
        <table className="min-w-[480px] w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
              <th className="px-4 py-2 text-left">디바이스</th>
              <th className="px-4 py-2 text-right">분석 보기</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d: string) => (
              <tr key={d} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                <td className="px-4 py-2">{d}</td>
                <td className="px-4 py-2 text-right">
                  <a className="underline" href={`/outliers/${encodeURIComponent(d)}`}>이상치(IQR)</a>
                </td>
              </tr>
            ))}
            {!devices.length && (
              <tr><td className="px-4 py-6 text-center text-zinc-500" colSpan={2}>디바이스 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
