import 'server-only';
export const runtime = 'nodejs';

import Link from 'next/link';
import { listDevicesPaged } from '@/lib/database';

type SearchParams = { q?: string; page?: string; carType?: string };

export default async function DeviceListPage({ searchParams }: { searchParams?: SearchParams }) {
  const q = (searchParams?.q ?? '').trim();
  const page = Math.max(1, Number(searchParams?.page ?? '1'));
  const carType = (searchParams?.carType ?? '').trim() || undefined;

  const { devices, total, page: p, pageSize } = await listDevicesPaged({
    q, page, pageSize: 200, carType,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmtQS = (nextPage: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (carType) sp.set('carType', carType);
    sp.set('page', String(nextPage));
    return `/vehicle-details?${sp.toString()}`;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">디바이스 목록</h1>

      {/* 서버 GET 폼 */}
      <form action="/vehicle-details" method="get" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="q"
          placeholder="디바이스 검색..."
          defaultValue={q}
          className="px-3 py-2 rounded bg-zinc-900/20 border border-zinc-700 w-64"
        />
        <select
          name="carType"
          defaultValue={carType ?? ''}
          className="px-3 py-2 rounded bg-zinc-900/20 border border-zinc-700"
        >
          <option value="">모델 전체</option>
          <option value="BONGO3">BONGO3</option>
          <option value="GV60">GV60</option>
          <option value="PORTER2">PORTER2</option>
        </select>
        <input type="hidden" name="page" value="1" />
        <button className="px-3 py-2 rounded bg-zinc-700 text-white" type="submit">검색</button>
      </form>

      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-500">
          총 {total.toLocaleString('ko-KR')}개 · {p}/{totalPages}페이지
        </div>
        <nav className="flex items-center gap-2">
          <PageLink href={fmtQS(Math.max(1, p - 1))} disabled={p <= 1}>이전</PageLink>
          <span className="text-sm text-zinc-500">{p}/{totalPages}</span>
          <PageLink href={fmtQS(Math.min(totalPages, p + 1))} disabled={p >= totalPages}>다음</PageLink>
        </nav>
      </div>

      <div className="overflow-auto rounded-2xl border border-zinc-700/50">
        <table className="min-w-[420px] w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
              <Th style={{ width: 80 }}>#</Th>
              <Th>디바이스 번호</Th>
              <Th>상세</Th>
            </tr>
          </thead>
          <tbody>
            {devices.length ? devices.map((d, i) => (
              <tr key={d} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                <Td>{(p - 1) * pageSize + i + 1}</Td>
                <Td>{d}</Td>
                <Td><Link href={`/vehicle-details/${d}`} className="underline">보기</Link></Td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">결과 없음</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav className="flex items-center justify-end gap-2">
        <PageLink href={fmtQS(Math.max(1, p - 1))} disabled={p <= 1}>이전</PageLink>
        <span className="text-sm text-zinc-500">{p}/{totalPages}</span>
        <PageLink href={fmtQS(Math.min(totalPages, p + 1))} disabled={p >= totalPages}>다음</PageLink>
      </nav>
    </div>
  );
}

/* UI */
function Th({ children, style }:{ children: React.ReactNode; style?: React.CSSProperties }) {
  return <th className="px-4 py-2 text-left" style={style}>{children}</th>;
}
function Td({ children }:{ children: React.ReactNode }) {
  return <td className="px-4 py-2">{children}</td>;
}
function PageLink({ href, disabled, children }:{
  href: string; disabled?: boolean; children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="px-3 py-1 rounded bg-zinc-800/30 text-zinc-500 cursor-not-allowed">{children}</span>;
  }
  return <Link href={href} className="px-3 py-1 rounded bg-zinc-700 text-white">{children}</Link>;
}
