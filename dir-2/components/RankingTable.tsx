'use client';

import Link from 'next/link';
import { useMemo, useState, memo, useCallback } from 'react';

type Row = { device_no: string; km_total: number };

function RankingTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(true);

  const filtered = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().trim();
    const nq = norm(q);
    let out = rows;
    if (nq) out = out.filter(r => norm(r.device_no).includes(nq));
    out = [...out].sort((a, b) => (desc ? b.km_total - a.km_total : a.km_total - b.km_total));
    return out;
  }, [rows, q, desc]);

  const handleSortToggle = useCallback(() => {
    setDesc(d => !d);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input
          className="px-3 py-2 rounded bg-zinc-900/20 border border-zinc-700 w-64"
          placeholder="디바이스 검색..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="px-3 py-2 rounded bg-zinc-700 text-white" onClick={handleSortToggle}>
          {desc ? '내림차순' : '오름차순'}
        </button>
      </div>

      <div className="overflow-auto rounded-2xl border border-zinc-700/50">
        <table className="min-w-[520px] w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
              <Th>순위</Th>
              <Th>디바이스</Th>
              <Th align="right">주행거리(km)</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((r, i) => (
              <tr key={r.device_no} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                <Td>{i + 1}</Td>
                <Td>
                  <Link href={`/ranking/${r.device_no}`} className="underline">{r.device_no}</Link>
                </Td>
                <Td align="right">{Math.round(r.km_total).toLocaleString('ko-KR')}</Td>
              </tr>
            )) : (
              <tr><td className="px-4 py-8 text-center text-zinc-500" colSpan={3}>결과 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(RankingTable);

const Th = memo(({ children, align='left' }: { children: React.ReactNode; align?: 'left'|'right'}) => {
  return <th className={`px-4 py-2 text-${align}`}>{children}</th>;
});
Th.displayName = 'Th';

const Td = memo(({ children, align='left' }: { children: React.ReactNode; align?: 'left'|'right'}) => {
  return <td className={`px-4 py-2 text-${align}`}>{children}</td>;
});
Td.displayName = 'Td';
