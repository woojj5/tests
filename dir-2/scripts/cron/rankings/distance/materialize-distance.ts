/* eslint-disable no-console */
import { ensureTables, upsertRankingDistance } from '@/lib/psql';
import { cacheRankingDistanceZSet } from '@/lib/redis';
import { queryInflux } from '@/lib/database';

const bucket = process.env.INFLUXDB_BUCKET!;
const DEVICE = process.env.DEVICE_KEY_TAG || 'device_no';
const MEAS_BMS = process.env.EXACT_MEASUREMENT || 'aicar_bms';
const ODOM = process.env.ODOMETER_FIELD || 'odometer';

// 기간(절대값) — 필요시 ENV로 빼도 OK
const PERIOD_START = '2022-12-01T00:00:00+09:00';
const PERIOD_END   = '2023-09-01T00:00:00+09:00';
// 하루 리드(차분 안정화/월경계 안전)용
const LEAD_DAY     = '2022-11-30T00:00:00+09:00';

const js = JSON.stringify;
const timeArg = (s: string) =>
  /^-?\d+\s*(ms|s|m|h|d|w|mo|y)$/.test(s) ? s : `time(v:${js(s)})`;

// 표기용 기간 문자열(Primary key의 period)
function periodLabel(startISO: string, endISO: string) {
  // 예시: '2022-12-01..2023-09-01' 형태 (스키마 자유)
  return `${startISO.slice(0, 10)}..${endISO.slice(0, 10)}`;
}

type InfluxRow = { device_no: string; km_total: number };

/**
 * Influx에서 기간 내 주행거리 합(km_total)을 장비별로 가져옴
 * - 일일 last 후 nonNegative difference → 구간별 Δodometer
 * - 기간 필터링 → sum
 */
async function fetchAllDistanceSumsExact(): Promise<InfluxRow[]> {
  const flux = `
from(bucket: ${js(bucket)})
  |> range(start: ${timeArg(LEAD_DAY)}, stop: ${timeArg(PERIOD_END)})
  |> filter(fn: (r) => r._measurement == ${js(MEAS_BMS)})
  |> filter(fn: (r) => r._field == ${js(ODOM)})
  |> map(fn:(r)=>({ r with _value: float(v:r._value) }))
  |> group(columns:[${js(DEVICE)}])
  |> aggregateWindow(every: 1d, fn: last, createEmpty: false, offset: 9h)
  |> difference(nonNegative: true, columns: ["_value"])
  |> filter(fn: (r) => r._time >= ${timeArg(PERIOD_START)} and r._time < ${timeArg(PERIOD_END)})
  |> group(columns:[${js(DEVICE)}])
  |> sum(column: "_value")
  |> keep(columns: [${js(DEVICE)},"_value"])
  |> rename(columns: {_value: "km_total"})
`;

  const rows = await queryInflux(flux, (r: Record<string, unknown>) => ({
    device_no: String(r[DEVICE]),
    km_total: Number(r.km_total) || 0,
  }));

  // 방어적으로 음수/NaN 제거
  return (rows as InfluxRow[]).filter(
    (x) => Number.isFinite(x.km_total) && x.km_total >= 0 && x.device_no
  );
}

async function main() {
  const period = periodLabel(PERIOD_START, PERIOD_END);

  console.log('[materialize-distance] period =', period);
  console.log('[materialize-distance] ensuring tables...');
  await ensureTables();

  console.log('[materialize-distance] querying Influx...');
  const raw = await fetchAllDistanceSumsExact();
  if (raw.length === 0) {
    console.warn('[materialize-distance] no rows from influx; abort.');
    return;
  }

  // Influx 결과 → 업서트 형식으로 변환
  const rows = raw.map((r) => ({
    device: r.device_no,
    distance_km: r.km_total,
  }));

  console.log(`[materialize-distance] upserting ${rows.length} rows ...`);
  await upsertRankingDistance(period, rows);

  // Redis 캐시도 periodEnd 기준으로 유지하고 싶다고 했으니 기존 시그니처 유지
  // (cacheRankingDistanceZSet 내부 구현에 맞게 키/스코어 반영)
  console.log('[materialize-distance] caching zset ...');
  await cacheRankingDistanceZSet({
    periodEndISO: PERIOD_END,
    rows: raw, // { device_no, km_total }[]
    ttlSec: 60,
  });

  console.log('[materialize-distance] done.');
}

main().catch((e) => {
  console.error('[materialize-distance] fatal:', e);
  process.exit(1);
});
