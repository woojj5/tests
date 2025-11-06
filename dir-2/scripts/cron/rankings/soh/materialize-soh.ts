/* eslint-disable no-console */
import { ensureTables, upsertRankingSoh } from '@/lib/psql';
import { cacheRankingSohZSet } from '@/lib/redis';
import { queryInflux } from '@/lib/database';

const bucket = process.env.INFLUXDB_BUCKET!;
const DEVICE = process.env.DEVICE_KEY_TAG || 'device_no';
const MEAS_BMS = process.env.EXACT_MEASUREMENT || 'aicar_bms';
const SOH_FIELD = process.env.SOH_FIELD || 'soh';

const PERIOD_START = '2022-12-01T00:00:00+09:00';
const PERIOD_END   = '2023-09-01T00:00:00+09:00';

const js = JSON.stringify;
const timeArg = (s: string) =>
  /^-?\d+\s*(ms|s|m|h|d|w|mo|y)$/.test(s) ? s : `time(v:${js(s)})`;

function periodLabel(startISO: string, endISO: string) {
  return `${startISO.slice(0, 10)}..${endISO.slice(0, 10)}`;
}

type SohRow = { device_no: string; avg_soh: number };

async function fetchAllSohMeans(): Promise<SohRow[]> {
  const flux = `
from(bucket: ${js(bucket)})
  |> range(start: ${timeArg(PERIOD_START)}, stop: ${timeArg(PERIOD_END)})
  |> filter(fn: (r) => r._measurement == ${js(MEAS_BMS)})
  |> filter(fn: (r) => r._field == ${js(SOH_FIELD)})
  |> filter(fn: (r) => exists r._value)
  |> map(fn:(r)=>({ r with _value: float(v:r._value) }))
  |> group(columns:[${js(DEVICE)}])
  |> mean()
  |> keep(columns: [${js(DEVICE)},"_value"])
  |> rename(columns: {_value: "avg_soh"})
`;

  const rows = await queryInflux(flux, (r: Record<string, unknown>) => ({
    device_no: String(r[DEVICE]),
    avg_soh: Number(r.avg_soh) || 0,
  }));

  return (rows as SohRow[]).filter(
    (x) => Number.isFinite(x.avg_soh) && x.device_no
  );
}

async function main() {
  const period = periodLabel(PERIOD_START, PERIOD_END);

  console.log('[materialize-soh] period =', period);
  console.log('[materialize-soh] ensuring tables...');
  await ensureTables();

  console.log('[materialize-soh] querying Influx...');
  const raw = await fetchAllSohMeans();
  if (raw.length === 0) {
    console.warn('[materialize-soh] no rows from influx; abort.');
    return;
  }

  // Influx 결과 → 업서트 포맷으로 변환
  const rows = raw.map((r) => ({
    device: r.device_no,
    avg_soh: r.avg_soh,
  }));

  console.log(`[materialize-soh] upserting ${rows.length} rows ...`);
  await upsertRankingSoh(period, rows);

  console.log('[materialize-soh] caching zset ...');
  await cacheRankingSohZSet({
    periodEndISO: PERIOD_END,
    rows: raw, // { device_no, avg_soh }[]
    ttlSec: 60,
  });

  console.log('[materialize-soh] done.');
}

main().catch((e) => {
  console.error('[materialize-soh] fatal:', e);
  process.exit(1);
});
