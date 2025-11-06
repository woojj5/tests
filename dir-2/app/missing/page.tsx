// app/missing/page.tsx
import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import SafeLink from '@/components/SafeLink';
import { listDevices } from '@/lib/database';

export default async function MissingOverviewPage() {
  // 디바이스 목록만 보여주고, 상세는 /missing/[deviceNo]로 이동
  const devices = await listDevices({});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">결측치 점검 — 디바이스 목록</h1>

      <div className="overflow-auto rounded-2xl border border-zinc-800/60">
        <table className="min-w-[520px] w-full text-sm">
          <thead className="bg-zinc-50/60 dark:bg-zinc-900/40">
            <tr className="text-zinc-500">
              <th className="text-left px-4 py-2">디바이스</th>
              <th className="text-right px-4 py-2">상세</th>
            </tr>
          </thead>
          <tbody>
            {devices.length ? devices.map((d) => (
              <tr key={d} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                <td className="px-4 py-2 font-medium">{d}</td>
                <td className="px-4 py-2 text-right">
                  <SafeLink className="underline" href={`/missing/${d}`}>
                    보기
                  </SafeLink>
                </td>
              </tr>
            )) : (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={2}>
                  디바이스가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        디바이스를 클릭하면 해당 디바이스의 결측치 분석 상세로 이동합니다.
      </p>
    </div>
  );
}
