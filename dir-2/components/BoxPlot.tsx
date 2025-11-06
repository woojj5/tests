'use client';

import React from 'react';

export type BoxPlotStats = {
  min: number; q1: number; median: number; q3: number; max: number;
  lowerFence?: number; upperFence?: number;
};

type Props = {
  title: string;
  stats: BoxPlotStats;
  width?: number;
  height?: number;
  padding?: number;
  formatter?: (v:number)=>string;
};

/** 아주 가벼운 수평 박스플롯 (SVG) */
export default function BoxPlot({
  title,
  stats,
  width = 600,
  height = 80,
  padding = 24,
  formatter = (v)=>String(Math.round(v)),
}: Props) {
  const { min, q1, median, q3, max, lowerFence, upperFence } = stats;
  const lo = Math.min(min, lowerFence ?? min);
  const hi = Math.max(max, upperFence ?? max);
  const scale = (v:number)=> padding + ( (v - lo) / (hi - lo || 1) ) * (width - 2*padding);

  const yMid = height/2;
  const boxH = 24;

  return (
    <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
      <div className="mb-2 font-semibold">{title}</div>
      <svg width={width} height={height} style={{ maxWidth: '100%' }}>
        {/* 축 라인 */}
        <line x1={scale(lo)} y1={yMid} x2={scale(hi)} y2={yMid} stroke="currentColor" opacity={0.4} />
        {/* lower/upper fence 표시 */}
        {lowerFence!=null && <line x1={scale(lowerFence)} y1={yMid-10} x2={scale(lowerFence)} y2={yMid+10} stroke="currentColor" opacity={0.5} />}
        {upperFence!=null && <line x1={scale(upperFence)} y1={yMid-10} x2={scale(upperFence)} y2={yMid+10} stroke="currentColor" opacity={0.5} />}
        {/* min/max */}
        <line x1={scale(min)} y1={yMid-6} x2={scale(min)} y2={yMid+6} stroke="currentColor" />
        <line x1={scale(max)} y1={yMid-6} x2={scale(max)} y2={yMid+6} stroke="currentColor" />
        {/* 박스(Q1~Q3) */}
        <rect
          x={scale(q1)} y={yMid - boxH/2}
          width={Math.max(1, scale(q3)-scale(q1))}
          height={boxH}
          fill="currentColor"
          opacity={0.2}
          rx={6}
        />
        {/* 중앙선 */}
        <line x1={scale(median)} y1={yMid - boxH/2} x2={scale(median)} y2={yMid + boxH/2} stroke="currentColor" />
        {/* 라벨 */}
        <text x={scale(min)} y={yMid + 28} fontSize={12} textAnchor="middle">{formatter(min)}</text>
        <text x={scale(q1)}  y={yMid - 16} fontSize={12} textAnchor="middle">Q1 {formatter(q1)}</text>
        <text x={scale(median)} y={yMid - 16} fontSize={12} textAnchor="middle">P50 {formatter(median)}</text>
        <text x={scale(q3)}  y={yMid - 16} fontSize={12} textAnchor="middle">Q3 {formatter(q3)}</text>
        <text x={scale(max)} y={yMid + 28} fontSize={12} textAnchor="middle">{formatter(max)}</text>
      </svg>
    </div>
  );
}
