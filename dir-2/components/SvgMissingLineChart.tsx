'use client';

import * as React from 'react';

type Row = { date: string; bms?: number; gps?: number };
type Props = { data: Row[]; width?: number | '100%'; height?: number };

function buildPath(points: Array<[number, number | undefined]>, h: number) {
  // undefined를 만나면 세그먼트를 끊는다
  let d = '';
  let penDown = false;
  for (const [x, y] of points) {
    if (y == null || Number.isNaN(y)) {
      penDown = false;
      continue;
    }
    if (!penDown) {
      d += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
      penDown = true;
    } else {
      d += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
    }
  }
  return d.trim();
}

export default function SvgMissingLineChart({ data, width = '100%', height = 320 }: Props) {
  // 데이터가 없으면 안내
  const hasAny = data?.some(d => Number.isFinite(d.bms as number) || Number.isFinite(d.gps as number));
  if (!hasAny) {
    return (
      <div className="rounded-2xl border border-zinc-800/60 p-6 bg-white dark:bg-zinc-900 text-zinc-400">
        표시할 Δt 중앙값 데이터가 없습니다.
      </div>
    );
  }

  // 마진 & 내부 크기
  const m = { t: 12, r: 16, b: 28, l: 40 };
  const w = typeof width === 'number' ? width : 800; // responsive가 아니라면 부모가 알아서 가로를 잡아줌
  const h = height;
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;

  // X 스케일: 등간격 (일 단위)
  const n = data.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * iw);

  // Y 도메인: 두 시리즈의 유효값에서 min/max
  const vals = [
    ...data.map(d => d.bms).filter((v): v is number => Number.isFinite(v as number)),
    ...data.map(d => d.gps).filter((v): v is number => Number.isFinite(v as number)),
  ];
  const yMin = Math.min(...vals, 0);
  const yMax = Math.max(...vals, 1);
  const y = (v: number) => ih - ((v - yMin) / Math.max(1e-9, (yMax - yMin))) * ih;

  // 경로 생성
  const bmsPts = data.map((d, i) => [x(i), d.bms != null ? y(d.bms) : undefined] as [number, number | undefined]);
  const gpsPts = data.map((d, i) => [x(i), d.gps != null ? y(d.gps) : undefined] as [number, number | undefined]);

  const bmsPath = buildPath(bmsPts, ih);
  const gpsPath = buildPath(gpsPts, ih);

  // X축 라벨 (월-일)
  const ticks = Math.min(8, n);
  const tickIdxs = Array.from({ length: ticks }, (_, k) => Math.round((k / Math.max(1, ticks - 1)) * (n - 1)));
  const fmtDate = (s: string) => s.slice(5); // YYYY-MM-DD -> MM-DD

  return (
    <div className="rounded-2xl border border-zinc-800/60 p-3 bg-white dark:bg-zinc-900">
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {/* 배경 */}
        <rect x={0} y={0} width={w} height={h} fill="transparent" />

        {/* 차트 영역 테두리 */}
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="none" stroke="rgba(148,163,184,0.25)" />

        {/* 그리드 Y (4줄) */}
        {Array.from({ length: 4 }, (_, i) => {
          const gy = m.t + (ih / 3) * i;
          return <line key={i} x1={m.l} x2={m.l + iw} y1={gy} y2={gy} stroke="rgba(148,163,184,0.2)" />;
        })}

        {/* 라인들 */}
        {/* BMS (초록) */}
        <path d={bmsPath} fill="none" stroke="#22c55e" strokeWidth={2} transform={`translate(${m.l},${m.t})`} />
        {/* GPS (파랑) */}
        <path d={gpsPath} fill="none" stroke="#3b82f6" strokeWidth={2} transform={`translate(${m.l},${m.t})`} />

        {/* 범례 */}
        <g transform={`translate(${m.l + 8}, ${m.t + 12})`} fontSize="12" fill="#e5e7eb">
          <rect x={0} y={-8} width={10} height={2} fill="#22c55e" />
          <text x={14} y={0}>BMS Δt P50</text>
          <rect x={120} y={-8} width={10} height={2} fill="#3b82f6" />
          <text x={134} y={0}>GPS Δt P50</text>
        </g>

        {/* X축 라벨 */}
        {tickIdxs.map((idx, k) => {
          const cx = m.l + x(idx);
          const label = fmtDate(data[idx].date);
          return (
            <g key={k} transform={`translate(${cx}, ${m.t + ih + 16})`} fontSize="11" fill="#94a3b8">
              <text textAnchor="middle">{label}</text>
            </g>
          );
        })}

        {/* Y축 라벨 (min / max) */}
        <g transform={`translate(${8}, ${m.t + ih})`} fontSize="11" fill="#94a3b8">
          <text>{Math.round(yMin)}s</text>
        </g>
        <g transform={`translate(${8}, ${m.t + 12})`} fontSize="11" fill="#94a3b8">
          <text>{Math.round(yMax)}s</text>
        </g>
      </svg>
    </div>
  );
}
