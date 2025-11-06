// components/DeviceList.tsx
'use client';

import { useMemo, useState } from 'react';

export default function DeviceList({ devices, pageSize=50 }: { devices: string[]; pageSize?: number; }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    ()=> devices.filter(d => d.toLowerCase().includes(q.toLowerCase())),
    [devices, q]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page-1)*pageSize, page*pageSize);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          placeholder="디바이스 검색…"
          value={q}
          onChange={e=>{ setQ(e.target.value); setPage(1); }}
          className="border rounded px-3 py-2 w-full"
        />
      </div>

      <div className="overflow-auto rounded-2xl border">
        <table className="min-w-[520px] w-full">
          <thead>
            <tr className="bg-zinc-50">
              <th className="text-left px-4 py-2">#</th>
              <th className="text-left px-4 py-2">디바이스 번호</th>
              <th className="text-left px-4 py-2">상세</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((d, i)=>(
              <tr key={d} className="border-t">
                <td className="px-4 py-2">{(page-1)*pageSize + i + 1}</td>
                <td className="px-4 py-2">{d}</td>
                <td className="px-4 py-2">
                  <a className="text-blue-600 hover:underline" href={`/vehicle-details/${encodeURIComponent(d)}`}>
                    상세 보기
                  </a>
                </td>
              </tr>
            ))}
            {pageItems.length===0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-zinc-500">결과 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-600">
          {filtered.length.toLocaleString()}개 중 {(page-1)*pageSize+1}–{Math.min(page*pageSize, filtered.length)} 표시
        </div>
        <div className="flex gap-2">
          <button
            className="border rounded px-3 py-2 disabled:opacity-50"
            onClick={()=> setPage(p=> Math.max(1, p-1))}
            disabled={page<=1}
          >
            이전
          </button>
          <span className="px-2 py-2 text-sm">{page}/{totalPages}</span>
          <button
            className="border rounded px-3 py-2 disabled:opacity-50"
            onClick={()=> setPage(p=> Math.min(totalPages, p+1))}
            disabled={page>=totalPages}
          >
            다음
          </button>
        </div>
      </div>
    </div>
  );
}
