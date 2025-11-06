'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export default function DeviceListClient({ devices }: { devices: string[] }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? devices.filter(d => d.toLowerCase().includes(s)) : devices;
  }, [devices, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="border rounded px-3 py-2"
          placeholder="디바이스 검색…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select
          className="border rounded px-2 py-2"
          value={pageSafe}
          onChange={(e) => setPage(Number(e.target.value))}
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <option key={p} value={p}>페이지 {p}/{totalPages}</option>
          ))}
        </select>
      </div>

      <div className="overflow-auto rounded-2xl border">
        <table className="min-w-[520px] w-full">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/40">
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">디바이스 번호</th>
            </tr>
          </thead>
          <tbody>
            {slice.length ? slice.map((d, i) => (
              <tr key={d} className="border-t">
                <td className="px-4 py-2">{(pageSafe - 1) * pageSize + i + 1}</td>
                <td className="px-4 py-2">
                  <Link className="text-blue-600 hover:underline" href={`/vehicle-details/${encodeURIComponent(d)}`}>
                    {d}
                  </Link>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-zinc-500">결과 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
