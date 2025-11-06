/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { InfluxDB } from '@influxdata/influxdb-client';
import { cfg } from './config';
import { cacheWrapHeavy } from './cache';

/* -------------------- Influx client & schema -------------------- */
export const influxDB = new InfluxDB({
  url: cfg.INFLUXDB_URL,
  token: cfg.INFLUXDB_TOKEN,
  timeout: cfg.INFLUXDB_TIMEOUT,
});
export const org = cfg.INFLUXDB_ORG;
export const bucket = cfg.INFLUXDB_BUCKET;

export const MEASUREMENTS = {
  BMS: cfg.EXACT_MEASUREMENT,
  GPS: cfg.GPS_MEASUREMENT,
} as const;

export const FIELDS = {
  SOC: cfg.SOC_FIELD,
  SOH: 'soh',
  PACK_VOLT: cfg.PACK_VOLT_FIELD,
  PACK_CURRENT: cfg.PACK_CURRENT_FIELD,
  MOD_AVG_TEMP: 'mod_avg_temp',
  ODOMETER: cfg.ODOMETER_FIELD,
  SPEED: cfg.SPEED_FIELD,
  CHARGE_STATE: cfg.CHARGE_STATE_FIELD,
} as const;

export const TAGS = {
  DEVICE_NO: cfg.DEVICE_KEY_TAG,
  CAR_TYPE:  cfg.MODEL_KEY_TAG,
} as const;

type RowObj = Record<string, any>;

export const parseInfluxValue = (value: any): any => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
    const low = value.toLowerCase();
    if (low === 'true') return true;
    if (low === 'false') return false;
  }
  return value;
};

export async function queryInflux<T = RowObj>(
  query: string,
  map: (r: RowObj) => T = (r) => r as T
): Promise<T[]> {
  const api = influxDB.getQueryApi(org);
  const results: T[] = [];
  return new Promise((resolve, reject) => {
    api.queryRows(query, {
      next(row: string[], meta: any) {
        const rec = meta.toObject(row) as RowObj;
        results.push(map(rec));
      },
      error(err: any) {
        console.error('[InfluxDB] Query error:', err?.message || err, '\nQ:', query);
        reject(err);
      },
      complete() { resolve(results); },
    });
  });
}

/* -------------------- Flux helpers -------------------- */
const js = JSON.stringify;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// duration(-30d, 15m 등)은 그대로, 절대시는 time(v:"…")
// ⚠️ s가 undefined/null/빈문자열일 때도 안전하게 처리
const timeArg = (s: string | undefined | null) => {
  const raw = (s ?? '').trim();
  const t = raw.length > 0 ? raw : '-30d'; // 기본 fallback
  const isDuration = /^-?\d+\s*(ms|s|m|h|d|w|mo|y)$/.test(t);
  return isDuration ? t : `time(v: ${js(t)})`;
};

// aggregateWindow.every는 따옴표 없이
// ⚠️ s가 비정상이면 명확한 에러 메시지로 throw
const durationArg = (s: string | undefined | null) => {
  const t = (s ?? '').trim();
  if (/^-?\d+\s*(ms|s|m|h|d|w|mo|y)$/.test(t)) return t;
  throw new Error(`Invalid duration for aggregateWindow.every: ${s}`);
};

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildBaseRangeFlux(p: { measurement: string; start: string | undefined | null; stop?: string | undefined | null }) {
  const range = p.stop
    ? `|> range(start: ${timeArg(p.start)}, stop: ${timeArg(p.stop)})`
    : `|> range(start: ${timeArg(p.start)})`;
  return [
    `from(bucket: ${js(bucket)})`,
    range,
    `|> filter(fn: (r) => r["_measurement"] == "${esc(p.measurement)}")`,
  ].join('\n');
}
export function addFieldFilter(flux: string, fields: string[]) {
  if (!fields.length) return flux;
  const cond = fields.map((f) => `r["_field"] == "${esc(f)}"`).join(' or ');
  return `${flux}\n|> filter(fn: (r) => ${cond})`;
}
export function addTagEquals(flux: string, key: string, value: string) {
  return `${flux}\n|> filter(fn: (r) => r["${esc(key)}"] == "${esc(value)}")`;
}
export function addKeep(flux: string, cols: string[]) {
  return `${flux}\n|> keep(columns: [${cols.map((c) => js(c)).join(', ')}])`;
}
export function addYield(flux: string, name = 'result') {
  return `${flux}\n|> yield(name: "${esc(name)}")`;
}

/* -------------------- Common data access -------------------- */

// 빠른 디바이스 목록(검색/정렬/페이징) — schema.tagValues 사용
export async function listDevicesPaged(params?: {
  carType?: string;
  q?: string;
  page?: number;       // 1-base
  pageSize?: number;   // default 200
}): Promise<{ devices: string[]; total: number; page: number; pageSize: number; }> {
  const { carType, q } = params ?? {};
  const page = Math.max(1, Number(params?.page ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Number(params?.pageSize ?? 200)));
  const offset = (page - 1) * pageSize;

  const pred =
    `r._measurement == ${js(MEASUREMENTS.BMS)}`
    + (carType ? ` and r[${js(TAGS.CAR_TYPE)}] == ${js(carType)}` : '');
  const searchFilter = q ? `|> filter(fn: (r) => r._value =~ /(?i)${escRe(q)}/)` : '';

  const countFlux = `
import "influxdata/influxdb/schema"
schema.tagValues(
  bucket: ${js(bucket)},
  tag: ${js(TAGS.DEVICE_NO)},
  predicate: (r) => ${pred},
  start: -100y
)
${searchFilter}
|> count(column: "_value")
|> keep(columns: ["_value"])
|> rename(columns: {_value: "total"})
`;

  const pageFlux = `
import "influxdata/influxdb/schema"
schema.tagValues(
  bucket: ${js(bucket)},
  tag: ${js(TAGS.DEVICE_NO)},
  predicate: (r) => ${pred},
  start: -100y
)
${searchFilter}
|> keep(columns: ["_value"])
|> rename(columns: {_value: ${js(TAGS.DEVICE_NO)}})
|> sort(columns: [${js(TAGS.DEVICE_NO)}])
|> limit(n: ${pageSize}, offset: ${offset})
`;

  const [countRows, pageRows] = await Promise.all([
    queryInflux<{ total: number }>(countFlux, r => ({ total: Number(r.total) || 0 })),
    queryInflux<{ [k: string]: string }>(pageFlux, r => ({ [TAGS.DEVICE_NO]: String(r[TAGS.DEVICE_NO]) })),
  ]);

  const total = countRows[0]?.total ?? 0;
  const devices = pageRows.map(r => r[TAGS.DEVICE_NO]);
  return { devices, total, page, pageSize };
}

// (레거시) 전체 목록이 정말 필요할 때만
export async function listDevices(params?: { carType?: string; limit?: number }) {
  const { carType, limit = 10000 } = params ?? {};
  let flux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: '-3650d' });
  if (carType) flux = addTagEquals(flux, TAGS.CAR_TYPE, carType);
  flux = `${flux}
|> keep(columns: [${js(TAGS.DEVICE_NO)}])
|> distinct(column: ${js(TAGS.DEVICE_NO)})
|> keep(columns: [${js(TAGS.DEVICE_NO)}])
|> sort(columns: [${js(TAGS.DEVICE_NO)}])
|> limit(n: ${limit})
`;
  const rows = await queryInflux(flux, (r) => r[TAGS.DEVICE_NO] as string);
  return Array.from(new Set(rows)).sort();
}

// 디바이스 번호로 차종 조회
export async function getCarTypesByDevices(deviceNos: string[]): Promise<Record<string, string>> {
  if (deviceNos.length === 0) return {};
  
  const deviceNoFilter = deviceNos.map(d => `r[${js(TAGS.DEVICE_NO)}] == ${js(d)}`).join(' or ');
  let flux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: '-3650d' });
  flux = `${flux}
|> filter(fn: (r) => ${deviceNoFilter})
|> keep(columns: [${js(TAGS.DEVICE_NO)}, ${js(TAGS.CAR_TYPE)}])
|> distinct(column: ${js(TAGS.DEVICE_NO)})
|> keep(columns: [${js(TAGS.DEVICE_NO)}, ${js(TAGS.CAR_TYPE)}])`;
  
  const rows = await queryInflux(flux, (r) => ({
    device_no: r[TAGS.DEVICE_NO] as string,
    car_type: r[TAGS.CAR_TYPE] as string,
  }));
  
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.device_no && row.car_type) {
      result[row.device_no] = row.car_type;
    }
  }
  return result;
}

// 시계열(최근 24h 15분 평균 등)
export async function fetchBmsTimeseries(p: {
  start: string; stop?: string; fields: string[]; every?: string;
  deviceNo?: string; carType?: string; createEmpty?: boolean;
}) {
  const { start, stop, fields, every, deviceNo, carType, createEmpty = false } = p;
  let flux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start, stop });
  if (fields?.length) flux = addFieldFilter(flux, fields);
  if (deviceNo) flux = addTagEquals(flux, TAGS.DEVICE_NO, deviceNo);
  if (carType) flux = addTagEquals(flux, TAGS.CAR_TYPE, carType);
  if (every) {
    flux = `${flux}
|> map(fn:(r)=>({ r with _value: float(v: r._value) }))
|> aggregateWindow(every: ${durationArg(every)}, fn: mean, createEmpty: ${createEmpty}, offset: 9h)`;
  }
  flux = addKeep(flux, ['_time','_value','_field','_measurement',TAGS.DEVICE_NO,TAGS.CAR_TYPE]);
  flux = addYield(flux, 'bms_timeseries');
  return queryInflux(flux, (r) => ({
    time: r._time as string,
    value: parseInfluxValue(r._value),
    field: r._field as string,
    device_no: r[TAGS.DEVICE_NO] as string | undefined,
    car_type: r[TAGS.CAR_TYPE] as string | undefined,
  }));
}

/* -------------------- Distance (Exact, KST 일관) -------------------- */
const RANGE_START = '2022-12-01T00:00:00+09:00';
const RANGE_STOP  = '2023-09-01T00:00:00+09:00'; // exclusive
const LEAD_DAY    = '2022-11-30T00:00:00+09:00'; // difference 안정화

/** 단일 디바이스: 전체 구간 정확 누적(km) — _time 기준 */
export async function fetchTotalDistanceByOdoExact(p: {
  deviceNo: string;
  rangeStartKST?: string;
  rangeStopKST?: string;
}) {
  const deviceNo = p.deviceNo;
  const startISO = p.rangeStartKST ?? RANGE_START;
  const stopISO  = p.rangeStopKST  ?? RANGE_STOP;

  const flux = `
from(bucket: ${js(bucket)})
|> range(start: ${timeArg(LEAD_DAY)}, stop: ${timeArg(stopISO)})
|> filter(fn: (r) => r["_measurement"] == ${js(MEASUREMENTS.BMS)})
|> filter(fn: (r) => r["_field"] == ${js(FIELDS.ODOMETER)})
|> filter(fn: (r) => r[${js(TAGS.DEVICE_NO)}] == ${js(deviceNo)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> group(columns:[${js(TAGS.DEVICE_NO)}])
|> aggregateWindow(every: 1d, fn: last, createEmpty: false, offset: 9h)
|> difference(nonNegative: true, columns: ["_value"])
|> filter(fn: (r) => r._time >= ${timeArg(startISO)} and r._time < ${timeArg(stopISO)})
|> group(columns:[${js(TAGS.DEVICE_NO)}])
|> sum(column: "_value")
|> keep(columns: [${js(TAGS.DEVICE_NO)},"_value"])
|> yield(name:"odo_total_exact")
`;
  const rows = await queryInflux<{ _value: number }>(flux, r => ({ _value: Number(r._value) || 0 }));
  return rows[0]?.['_value'] ?? 0;
}

/** 합계가 있는 장비들의 거리 합계 전체 (랭킹 병합용) */
export async function fetchAllDistanceSumsExact(): Promise<{ device_no: string; km_total: number }[]> {
  const flux = `
from(bucket: ${js(bucket)})
|> range(start: ${timeArg(LEAD_DAY)}, stop: ${timeArg(RANGE_STOP)})
|> filter(fn: (r) => r["_measurement"] == ${js(MEASUREMENTS.BMS)})
|> filter(fn: (r) => r["_field"] == ${js(FIELDS.ODOMETER)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> group(columns:[${js(TAGS.DEVICE_NO)}])
|> aggregateWindow(every: 1d, fn: last, createEmpty: false, offset: 9h)
|> difference(nonNegative: true, columns: ["_value"])
|> filter(fn: (r) => r._time >= ${timeArg(RANGE_START)} and r._time < ${timeArg(RANGE_STOP)})
|> group(columns:[${js(TAGS.DEVICE_NO)}])
|> sum(column: "_value")
|> keep(columns: [${js(TAGS.DEVICE_NO)},"_value"])
|> rename(columns: {_value: "km_total"})
|> yield(name:"rank_total_km_all")
`;
  const rows = await queryInflux(flux, r => ({
    device_no: String(r[TAGS.DEVICE_NO]),
    km_total: Number(r.km_total) || 0,
  }));
  return rows;
}

/** 0km 장비까지 포함한 랭킹 */
export async function fetchDistanceRankingExactIncludingZero(limit = 500) {
  const [sums, allDevices] = await Promise.all([
    fetchAllDistanceSumsExact(),
    listDevices({ limit: 10000 }),
  ]);
  const byId = new Map<string, number>();
  for (const r of sums) byId.set(r.device_no, r.km_total);

  const merged = allDevices.map(d => ({
    device_no: d,
    km_total: byId.get(d) ?? 0,
  }));
  merged.sort((a, b) => b.km_total - a.km_total);
  return merged.slice(0, limit);
}

/** 0km 장비까지 포함한 랭킹 (캐싱 적용) */
export const getDistanceRankingExactIncludingZeroCached = (limit = 500) =>
  cacheWrapHeavy(
    `rank:distance:exact:including-zero:${RANGE_START}:${RANGE_STOP}:${limit}`,
    () => fetchDistanceRankingExactIncludingZero(limit)
  );

/** 월별 정확 주행거리 (빈 달 0 포함) */
export async function fetchMonthlyDistanceByOdoExact(p: {
  deviceNo: string;
  rangeStartKST: string; // ex) "2022-12-01T00:00:00+09:00"
  rangeStopKST: string;  // ex) "2023-09-01T00:00:00+09:00"
}) {
  const { deviceNo, rangeStartKST, rangeStopKST } = p;
  const leadStart = "2022-11-01T00:00:00+09:00";

  const flux = `
from(bucket: ${js(bucket)})
|> range(start: ${timeArg(leadStart)}, stop: ${timeArg(rangeStopKST)})
|> filter(fn: (r) => r["_measurement"] == ${js(MEASUREMENTS.BMS)})
|> filter(fn: (r) => r["_field"] == ${js(FIELDS.ODOMETER)})
|> filter(fn: (r) => r[${js(TAGS.DEVICE_NO)}] == ${js(deviceNo)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> group(columns:[${js(TAGS.DEVICE_NO)}])
|> aggregateWindow(every: 1mo, fn: last, createEmpty: true, offset: 9h)
|> fill(usePrevious: true)
|> difference(nonNegative: true, columns: ["_value"])
|> filter(fn: (r) => r._time >= ${timeArg(rangeStartKST)} and r._time < ${timeArg(rangeStopKST)})
|> keep(columns: ["_time","_value"])
|> yield(name:"odo_monthly_exact_fill0")
`;
  type Row = { _time: string; _value: number };
  const rows = await queryInflux<Row>(flux, r => ({
    _time: String(r._time),
    _value: Number(r._value) || 0,
  }));
  return rows.map(r => ({ time: r._time, km: r._value }));
}

/** 8월(마지막 30일) 일별 주행거리: 2023-08-01 ~ 2023-08-31 */
export async function fetchAugustDailyDistanceByOdo(p: { deviceNo: string; }) {
  const { deviceNo } = p;
  const leadDayStart = "2023-07-31T00:00:00+09:00";
  const augStart     = "2023-08-01T00:00:00+09:00";
  const sep1Stop     = "2023-09-01T00:00:00+09:00";

  const flux = `
from(bucket: ${js(bucket)})
|> range(start: ${timeArg(leadDayStart)}, stop: ${timeArg(sep1Stop)})
|> filter(fn: (r) => r["_measurement"] == ${js(MEASUREMENTS.BMS)})
|> filter(fn: (r) => r["_field"] == ${js(FIELDS.ODOMETER)})
|> filter(fn: (r) => r[${js(TAGS.DEVICE_NO)}] == ${js(deviceNo)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> group(columns:[${js(TAGS.DEVICE_NO)}])
|> aggregateWindow(every: 1d, fn: last, createEmpty: false, offset: 9h)
|> difference(nonNegative: true, columns: ["_value"])
|> filter(fn: (r) => r._time >= ${timeArg(augStart)} and r._time < ${timeArg(sep1Stop)})
|> keep(columns: ["_time","_value"])
|> yield(name:"odo_august_1d")
`;
  type Row = { _time: string; _value: number };
  const rows = await queryInflux<Row>(flux, r => ({
    _time: String(r._time),
    _value: Number(r._value) || 0,
  }));
  return rows.map(r => ({ time: r._time, km: r._value }));
}

// ===== Realtime helpers (speed / charging) =====

/** 간단한 SOH 성능 등급 */
export function getPerformanceGrade(soh: number): 'A'|'B'|'C'|'D' {
  const v = Number(soh);
  if (!Number.isFinite(v)) return 'D';
  if (v >= 95) return 'A';
  if (v >= 90) return 'B';
  if (v >= 85) return 'C';
  return 'D';
}

/** 충전 상태 판정 (케이블/포트 + 전류) */
export function getChargingStatus(
  packCurrentA: number,
  chrgCableConn = 0,
  fastPortConn = 0,
  slowPortConn = 0
) {
  const CURRENT_CHARGING_THRESHOLD = 1.0; // A
  const anyCable =
    (Number(chrgCableConn) || 0) > 0 ||
    (Number(fastPortConn) || 0) > 0 ||
    (Number(slowPortConn) || 0) > 0;

  const I = Number(packCurrentA) || 0;
  const absI = Math.abs(I);

  const isCharging = anyCable && absI >= CURRENT_CHARGING_THRESHOLD && I > 0;
  const isFastCharging = isCharging && (Number(fastPortConn) || 0) > 0;
  const isSlowCharging = isCharging && !isFastCharging && (Number(slowPortConn) || 0) > 0;

  let chargingStatus: '충전중(급속)' | '충전중(완속)' | '대기(케이블연결)' | '비충전' = '비충전';
  if (isFastCharging) chargingStatus = '충전중(급속)';
  else if (isSlowCharging) chargingStatus = '충전중(완속)';
  else if (anyCable) chargingStatus = '대기(케이블연결)';

  return { chargingStatus, isCharging, isFastCharging, isSlowCharging };
}

/** 차량 상태 판정 (속도 + 충전중 여부) */
export function getVehicleStatus(speedKmh: number, isCharging: boolean) {
  const v = Number(speedKmh) || 0;
  const MOVING_THRESHOLD = 1.0; // km/h
  const isMoving = v >= MOVING_THRESHOLD;

  let vehicleStatus: '주행중' | '충전중' | '정차' = '정차';
  if (isMoving) vehicleStatus = '주행중';
  else if (isCharging) vehicleStatus = '충전중';

  return { vehicleStatus, isMoving };
}

/**
 * 디바이스별 최신 BMS(전압/전류/충전포트/케이블) + 최신 GPS 속도를 가져와
 * 속도/충전 상태/충전전력(kW)를 계산해 반환.
 *
 * 반환:
 * {
 *   speed, pack_volt, pack_current,
 *   charging_status, is_charging, is_fast_charging, is_slow_charging,
 *   vehicle_status, is_moving, charging_power_kw
 * }
 */
export async function fetchLatestChargeAndSpeed(deviceNo: string, opts?: {
  start?: string; // ISO or relative flux duration
  stop?: string;  // ISO
}) {
  const SNAP_START = opts?.start ?? '2022-12-01T00:00:00+09:00';
  const SNAP_STOP  = opts?.stop  ?? '2023-09-01T00:00:00+09:00';

  // 최신 BMS (pack_volt/pack_current/충전 포트/케이블)
  const bmsFlux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: ${timeArg(SNAP_START)}, stop: ${timeArg(SNAP_STOP)})
|> filter(fn: (r) => r["_measurement"] == ${JSON.stringify(MEASUREMENTS.BMS)})
|> filter(fn: (r) =>
  r._field == ${JSON.stringify(FIELDS.PACK_VOLT)} or
  r._field == ${JSON.stringify(FIELDS.PACK_CURRENT)} or
  r._field == "chrg_cable_conn" or
  r._field == "fast_chrg_port_conn" or
  r._field == "slow_chrg_port_conn"
)
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(deviceNo)})
|> filter(fn: (r) => exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}, "_field"])
|> last()
|> keep(columns: [${JSON.stringify(TAGS.DEVICE_NO)}, "_field", "_value"])
|> pivot(rowKey: [${JSON.stringify(TAGS.DEVICE_NO)}], columnKey: ["_field"], valueColumn: "_value")
`;

  // 최신 GPS speed
  const gpsFlux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: ${timeArg(SNAP_START)}, stop: ${timeArg(SNAP_STOP)})
|> filter(fn: (r) => r["_measurement"] == ${JSON.stringify(MEASUREMENTS.GPS)})
|> filter(fn: (r) => r._field == ${JSON.stringify(FIELDS.SPEED)})
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(deviceNo)})
|> filter(fn: (r) => exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}])
|> last()
|> keep(columns: [${JSON.stringify(TAGS.DEVICE_NO)}, "_value", "_time"])
|> rename(columns: {_value: "speed"})
`;

  const [bmsRows, gpsRows] = await Promise.all([
    queryInflux<Record<string, any>>(bmsFlux, (r) => ({ ...r })),
    queryInflux<Record<string, any>>(gpsFlux, (r) => ({ ...r })),
  ]);

  const b = bmsRows[0] ?? {};
  const g = gpsRows[0] ?? {};

  const pack_volt = Number(b[FIELDS.PACK_VOLT]) || 0;
  const pack_current = Number(b[FIELDS.PACK_CURRENT]) || 0;

  const chrg_cable_conn = Number(b['chrg_cable_conn']) || 0;
  const fast_chrg_port_conn = Number(b['fast_chrg_port_conn']) || 0;
  const slow_chrg_port_conn = Number(b['slow_chrg_port_conn']) || 0;

  const speed = Number(g['speed']) || 0;

  const chg = getChargingStatus(
    pack_current,
    chrg_cable_conn,
    fast_chrg_port_conn,
    slow_chrg_port_conn
  );
  const veh = getVehicleStatus(speed, chg.isCharging);

  // 충전 중일 때만 V*A의 절대값/1000 (kW)
  const charging_power_kw = chg.isCharging ? Math.abs(pack_volt * pack_current) / 1000 : 0;

  return {
    speed,
    pack_volt,
    pack_current,
    charging_status: chg.chargingStatus,
    is_charging: chg.isCharging,
    is_fast_charging: chg.isFastCharging,
    is_slow_charging: chg.isSlowCharging,
    vehicle_status: veh.vehicleStatus,
    is_moving: veh.isMoving,
    charging_power_kw,
  };
}
