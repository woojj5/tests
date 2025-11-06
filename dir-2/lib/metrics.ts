// lib/metrics.ts
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse/sync';

export type MetricRow = {
  device: string;
  car_type: string;
  distance_km: number | null;
  avg_soc_per_km: number | null;
  idle_pct: number | null;
  chg_slow_pct: number | null;
  chg_fast_pct: number | null;
  discharge_pct: number | null;
  cell_imbalance_mv: number | null;
  temp_range: number | null;
};

// 🔧 숫자 컬럼 키를 리터럴로 고정하고 별도 타입으로 분리
const NUM_KEYS = [
  'distance_km',
  'avg_soc_per_km',
  'idle_pct',
  'chg_slow_pct',
  'chg_fast_pct',
  'discharge_pct',
  'cell_imbalance_mv',
  'temp_range',
] as const;
type NumericKey = typeof NUM_KEYS[number];

const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// 메모리 캐시: CSV 파싱 결과를 캐시하여 반복 로딩 방지
let cachedMetrics: MetricRow[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

export async function loadMetricsCsv(): Promise<MetricRow[]> {
  const now = Date.now();
  
  // 메모리 캐시 확인
  if (cachedMetrics !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedMetrics;
  }

  const filePath = path.join(process.cwd(), 'metrics.csv');
  const raw = await fs.readFile(filePath, 'utf-8');
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // BOM 제거

  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  const result = records.map((r) => {
    // 기본 스칼라 컬럼
    const base = {
      device: r.device ?? '',
      car_type: r.car_type ?? '',
    };

    // 숫자 컬럼만 안전하게 채우기
    const numeric: Record<NumericKey, number | null> = {
      distance_km: null,
      avg_soc_per_km: null,
      idle_pct: null,
      chg_slow_pct: null,
      chg_fast_pct: null,
      discharge_pct: null,
      cell_imbalance_mv: null,
      temp_range: null,
    };

    for (const k of NUM_KEYS) {
      numeric[k] = toNum(r[k]);
    }

    // 결합해서 MetricRow로 반환
    return { ...base, ...numeric } as MetricRow;
  });

  // 캐시 업데이트
  cachedMetrics = result;
  cacheTimestamp = now;
  
  return result;
}

// 동기 버전 (하위 호환성, 비권장)
export function loadMetricsCsvSync(): MetricRow[] {
  if (cachedMetrics !== null) {
    return cachedMetrics;
  }
  // 동기 버전은 캐시를 사용하지 않음 (빌드 타임에만 사용)
  const filePath = path.join(process.cwd(), 'metrics.csv');
  const raw = require('fs').readFileSync(filePath, 'utf-8');
  const content = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const records = parse(content, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  return records.map((r) => {
    const base = { device: r.device ?? '', car_type: r.car_type ?? '' };
    const numeric: Record<NumericKey, number | null> = {
      distance_km: null, avg_soc_per_km: null, idle_pct: null,
      chg_slow_pct: null, chg_fast_pct: null, discharge_pct: null,
      cell_imbalance_mv: null, temp_range: null,
    };
    for (const k of NUM_KEYS) numeric[k] = toNum(r[k]);
    return { ...base, ...numeric } as MetricRow;
  });
}
