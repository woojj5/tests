// components/OutlierSummaryTable.tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type Row = {
  device_no: string;
  measurement: 'aicar_bms' | 'aicar_gps';
  field: 'pack_current' | 'speed';
  n_total: number;
  n_outlier: number;
  rate: number;
  mean: number;
  std: number;
};

export default function OutlierSummaryTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(true);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    let out = rows;
    if (nq) {
      out = out.filter(r =>
        r.device_no.toLowerCase().includes(nq) ||
        r.measurement.toLowerCase().includes(nq) ||
        r.field.toLowerCase().includes(nq)
      );
    }
    out = [...out].sort((a,b)=> desc ? (b.rate - a.rate) : (a.rate - b.rate));
    return out;
  }, [rows, q, desc]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input
          className="px-3 py-2 rounded border w-72 dark:bg-zinc-900 dark:border-zinc-700"
          placeholder="검색: device/measurement/field"
          value={q}
          onChange={(e)=>setQ(e.target.value)}
        />
        <button className="px-3 py-2 rounded bg-zinc-700 text-white" onClick={()=>setDesc(d=>!d)}>
          {desc ? '이상치율 높은순' : '낮은순'}
        </button>
      </div>

      <div className="overflow-auto rounded-2xl border dark:border-zinc-800">
        <table className="min-w-[880px] w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-900/40 text-zinc-500">
              <Th>디바이스</Th>
              <Th>측정값</Th>
              <Th>필드</Th>
              <Th align="right">표본 수</Th>
              <Th align="right">이상치 수</Th>
              <Th align="right">이상치율</Th>
              <Th align="right">평균</Th>
              <Th align="right">표준편차</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map((r, i)=>(
              <tr key={`${r.device_no}-${r.measurement}-${r.field}-${i}`} className="border-t dark:border-zinc-800">
                <Td>
                  {/* 필요하면 디바이스 상세 링크로 변경 */}
                  <Link className="underline" href={`/ranking/${r.device_no}`}>{r.device_no}</Link>
                </Td>
                <Td>{r.measurement}</Td>
                <Td>{r.field}</Td>
                <Td align="right">{r.n_total.toLocaleString('ko-KR')}</Td>
                <Td align="right">{r.n_outlier.toLocaleString('ko-KR')}</Td>
                <Td align="right">{(r.rate*100).toFixed(2)}%</Td>
                <Td align="right">{r.mean.toLocaleString('ko-KR')}</Td>
                <Td align="right">{r.std.toLocaleString('ko-KR')}</Td>
              </tr>
            )) : (
              <tr><td className="px-4 py-10 text-center text-zinc-500" colSpan={8}>데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align='left' }:{ children: React.ReactNode; align?: 'left'|'right'}) {
  return <th className={`px-4 py-2 text-${align}`}>{children}</th>;
}
function Td({ children, align='left' }:{ children: React.ReactNode; align?: 'left'|'right'}) {
  return <td className={`px-4 py-2 text-${align}`}>{children}</td>;
}
