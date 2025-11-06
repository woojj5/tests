/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unstable_cache, revalidateTag } from 'next/cache';
import { cacheWrap, cacheWrapHeavy } from './cache';
import { cfg, monthStartISO, monthStopExclusiveISO } from './config';
import {
  bucket, FIELDS, MEASUREMENTS, TAGS, queryInflux,
  buildBaseRangeFlux, addFieldFilter, addKeep, addTagEquals, addYield, listDevices,
} from './database';

// 디스크 스냅샷 캐시 디렉토리 (프로젝트 루트 기준)
const SNAP_DIR = path.resolve(process.cwd(), '.cache', 'aicar');
const SNAP = {
  summary: path.join(SNAP_DIR, 'overview-summary.json'),
  fields: path.join(SNAP_DIR, 'all-fields.json'),
  perType: path.join(SNAP_DIR, 'field-counts-by-type.json'),
};

// 디스크 스냅샷 읽기/쓰기 헬퍼
async function readSnap<T>(file: string): Promise<T | null> {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

async function writeSnap(file: string, data: unknown): Promise<void> {
  try {
    await fs.mkdir(SNAP_DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[SNAP SAVED] ${path.basename(file)}`);
  } catch (err: any) {
    console.error(`[SNAP WRITE FAILED] ${file}:`, err?.message || err);
  }
}

export const START_TIME = monthStartISO(cfg.DATA_START_MONTH, cfg.DATA_TZ);
export const END_TIME   = monthStopExclusiveISO(cfg.DATA_STOP_MONTH, cfg.DATA_TZ);

export const CAR_TYPES = ['BONGO3', 'GV60', 'PORTER2'] as const;
const toNumber = (v: unknown, def=0)=> Number.isFinite(Number(v)) ? Number(v) : def;

export interface VehicleRecordCounts { BMS: number; GPS: number; 총합: number; }
export interface AvgSocSohResult { avg_soc: number; avg_soh: number; device_count: number; }
export interface DashboardSummary {
  total_vehicles: number; total_avg_soh: number; total_avg_soc: number;
  total_bms_records: number; total_gps_records: number;
  car_type_stats: Record<string, { BMS: number; GPS: number; total_records: number; device_count: number; avg_soc: number; avg_soh: number; }>;
}

/* -------------------- 대시보드 요약 -------------------- */
export async function getVehicleCounts(carTypes: readonly string[] = CAR_TYPES) {
  const out: Record<string, VehicleRecordCounts> = {};
  await Promise.all(carTypes.map(async (ct)=>{
    let bms = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: START_TIME, stop: END_TIME });
    bms = addTagEquals(bms, TAGS.CAR_TYPE, ct);
    bms = `${bms}\n|> count() |> keep(columns: ["_value"])`;

    let gps = buildBaseRangeFlux({ measurement: MEASUREMENTS.GPS, start: START_TIME, stop: END_TIME });
    gps = addTagEquals(gps, TAGS.CAR_TYPE, ct);
    gps = `${gps}\n|> count() |> keep(columns: ["_value"])`;

    let b=0,g=0;
    try { (await queryInflux(bms)).forEach((r:any)=> b += toNumber(r?._value,0)); } catch(e){ console.error('BMS count', ct, e); }
    try { (await queryInflux(gps)).forEach((r:any)=> g += toNumber(r?._value,0)); } catch(e){ console.error('GPS count', ct, e); }

    out[ct] = { BMS:b, GPS:g, 총합:b+g };
  }));
  return out;
}

export async function getAvgSocSoh(carTypes: readonly string[] = CAR_TYPES) {
  const out: Record<string, AvgSocSohResult> = {};
  await Promise.all(carTypes.map(async (ct)=>{
    try {
      let flux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: START_TIME, stop: END_TIME });
      flux = addFieldFilter(flux, [FIELDS.SOC, FIELDS.SOH]);
      flux = addTagEquals(flux, TAGS.CAR_TYPE, ct);
      flux = `${flux}
|> filter(fn:(r)=>exists r._value)
|> keep(columns: ["_field","_value"])`;

      let dev = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: START_TIME, stop: END_TIME });
      dev = addTagEquals(dev, TAGS.CAR_TYPE, ct);
      dev = `${dev}
|> keep(columns:["${TAGS.DEVICE_NO}"])
|> distinct(column:"${TAGS.DEVICE_NO}")`;

      const [rows, devices] = await Promise.all([queryInflux(flux), queryInflux(dev)]);
      const soc: number[] = [], soh: number[] = [];
      (rows as any[]).forEach(r=>{
        const v = Number(r?._value);
        if (Number.isFinite(v) && v>=0 && v<=100) {
          if (r?._field===FIELDS.SOC) soc.push(v);
          else if (r?._field===FIELDS.SOH) soh.push(v);
        }
      });
      const avg = (arr:number[]) => arr.length? parseFloat((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1)):0;
      out[ct] = { avg_soc: avg(soc), avg_soh: avg(soh), device_count: (devices as any[]).length };
    } catch(e) {
      console.error('AvgSocSoh', ct, e);
      out[ct] = { avg_soc:0, avg_soh:0, device_count:0 };
    }
  }));
  return out;
}

export function calculateTotalStats(rec: Record<string, VehicleRecordCounts>) {
  const totalBMS = Object.values(rec).reduce((s,r)=>s+toNumber(r.BMS,0),0);
  const totalGPS = Object.values(rec).reduce((s,r)=>s+toNumber(r.GPS,0),0);
  return { totalBMS, totalGPS, totalSum: totalBMS+totalGPS };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [counts, avgs] = await Promise.all([ getVehicleCounts(), getAvgSocSoh() ]);
  const { totalBMS, totalGPS } = calculateTotalStats(counts);

  let totalVehicles=0, sohSum=0, sohCnt=0, socSum=0, socCnt=0;
  const car_type_stats: DashboardSummary['car_type_stats'] = {};
  (CAR_TYPES as readonly string[]).forEach(ct=>{
    const c = counts[ct] ?? {BMS:0,GPS:0,총합:0};
    const a = avgs[ct] ?? {avg_soc:0,avg_soh:0,device_count:0};
    totalVehicles += a.device_count;
    if (a.avg_soh>0){ sohSum += a.avg_soh; sohCnt++; }
    if (a.avg_soc>0){ socSum += a.avg_soc; socCnt++; }
    car_type_stats[ct] = { BMS:c.BMS, GPS:c.GPS, total_records:c.총합, device_count:a.device_count, avg_soc:a.avg_soc, avg_soh:a.avg_soh };
  });

  const total_avg_soh = sohCnt? parseFloat((sohSum/sohCnt).toFixed(1)) : 0;
  const total_avg_soc = socCnt? parseFloat((socSum/socCnt).toFixed(1)) : 0;

  return {
    total_vehicles: totalVehicles,
    total_avg_soh,
    total_avg_soc,
    total_bms_records: totalBMS,
    total_gps_records: totalGPS,
    car_type_stats
  };
}

// RSC 캐시 + 디스크 스냅샷이 적용된 getDashboardSummaryCached
export const getDashboardSummaryCached = unstable_cache(
  async () => {
    // 1. 디스크 스냅샷 확인 (서버 재시작 후에도 빠른 응답)
    const snap = await readSnap<DashboardSummary>(SNAP.summary);
    if (snap) {
      console.log('[SNAP HIT] overview-summary');
      return snap;
    }
    
    // 2. 스냅샷이 없으면 실제 데이터 가져오기
    console.log('[SNAP MISS] overview-summary - fetching from InfluxDB...');
    const data = await getDashboardSummary();
    
    // 3. 스냅샷 저장 (await로 저장 완료 보장)
    await writeSnap(SNAP.summary, data);
    
    return data;
  },
  ['overview-summary'],
  {
    revalidate: 300, // 5분
    tags: ['overview'],
  }
);

/* -------------------- 주행거리 랭킹 (오도미터 기반) -------------------- */
// (월 30d 창 근사; 대량이면 배치/캐시 권장)
export async function getDistanceRanking(limit = 50) {
  const devices = await listDevices({});
  const results: { device_no: string; km_total: number }[] = [];
  for (const d of devices) {
    let flux = buildBaseRangeFlux({ measurement: MEASUREMENTS.BMS, start: START_TIME, stop: END_TIME });
    flux = addFieldFilter(flux, [FIELDS.ODOMETER]);
    flux = addTagEquals(flux, TAGS.DEVICE_NO, d);
    flux = `${flux}
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 30d, fn: last, createEmpty: false)
|> difference(nonNegative: true, columns: ["_value"])`;
    const rows = await queryInflux(flux);
    const km = (rows as any[]).reduce((acc,r)=> acc + (Number(r?._value)||0), 0);
    results.push({ device_no: d, km_total: km });
  }
  results.sort((a,b)=>b.km_total-a.km_total);
  return results.slice(0, limit);
}
export const getDistanceRankingCached = (limit=50) =>
  cacheWrapHeavy(`rank:distance:${START_TIME}:${END_TIME}:${limit}`, () => getDistanceRanking(limit));

/* -------------------- (단순화 규칙) 충전/차량 상태 + 최신값 -------------------- */

// 충전 상태(요청 규칙): 전류>0.5A=충전중, 케이블/포트 플래그는 연결 여부 표현
export const getChargingStatus = (
  packCurrent: number,
  cableConnected: number,
  fastCharging: number,
  slowCharging: number
) => {
  const I = Number(packCurrent) || 0;
  const isCharging = I > 0.5;
  const isCableConnected = Number(cableConnected) === 1;
  const isFastCharging  = Number(fastCharging)  === 1;
  const isSlowCharging  = Number(slowCharging)  === 1;

  const chargingStatus = isCharging
    ? '충전중'
    : (isCableConnected ? '연결됨' : '연결안됨');

  return {
    isCharging,
    isCableConnected,
    isFastCharging,
    isSlowCharging,
    chargingStatus,
  };
};

// 차량 상태(요청 규칙): 속도>5km/h=주행중, 아니면 충전중/정지
export const getVehicleStatus = (speed: number, isCharging: boolean) => {
  const v = Number(speed) || 0;
  const isMoving = v > 5;
  const vehicleStatus = isMoving
    ? '주행중'
    : (isCharging ? '충전중' : '정지');

  return { isMoving, vehicleStatus };
};

/**
 * 최신 BMS(전압/전류/케이블/포트) + 최신 GPS 속도 → 속도/충전상태/충전전력(kW)
 * charging_power: isCharging이면 pack_volt*pack_current/1000, 아니면 0
 */
export async function fetchLatestChargeAndSpeed(
  deviceNo: string,
  opts?: { start?: string; stop?: string }
) {
  const SNAP_START = opts?.start ?? START_TIME;
  const SNAP_STOP  = opts?.stop  ?? END_TIME;

  const bmsFlux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: time(v: ${JSON.stringify(SNAP_START)}), stop: time(v: ${JSON.stringify(SNAP_STOP)}))
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

  const gpsFlux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: time(v: ${JSON.stringify(SNAP_START)}), stop: time(v: ${JSON.stringify(SNAP_STOP)}))
|> filter(fn: (r) => r["_measurement"] == ${JSON.stringify(MEASUREMENTS.GPS)})
|> filter(fn: (r) => r._field == ${JSON.stringify(FIELDS.SPEED)})
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(deviceNo)})
|> filter(fn: (r) => exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}])
|> last()
|> keep(columns: [${JSON.stringify(TAGS.DEVICE_NO)}, "_value"])
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

  const chrg_cable_conn     = Number(b['chrg_cable_conn'])     || 0;
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

  const charging_power = chg.isCharging ? (pack_volt * pack_current / 1000) : 0;

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
    charging_power, // kW
  };
}

/* -------------------- 🔹 측정값의 전체 필드 목록 가져오기 -------------------- */
export async function listFieldKeys(p: {
  measurement: string;
  start?: string;
  stop?: string;
  deviceNo?: string;
  carType?: string;
}): Promise<string[]> {
  const { measurement, deviceNo, carType } = p;
  const start = p.start ?? START_TIME;
  const stop  = p.stop  ?? END_TIME;

  let flux = buildBaseRangeFlux({ measurement, start, stop });
  if (deviceNo) flux = addTagEquals(flux, TAGS.DEVICE_NO, deviceNo);
  if (carType)  flux = addTagEquals(flux, TAGS.CAR_TYPE,  carType);

  flux = `${flux}
|> keep(columns: ["_field"])
|> distinct(column: "_field")
|> sort(columns: ["_field"])
|> keep(columns: ["_field"])`;

  const rows = await queryInflux<{ _field: string }>(flux, r => ({ _field: String(r._field) }));
  return Array.from(new Set(rows.map(r => r._field)));
}

export const listBmsFieldKeys = (opts?: { start?: string; stop?: string; deviceNo?: string; carType?: string; }) =>
  listFieldKeys({ measurement: MEASUREMENTS.BMS, ...opts });

export const listGpsFieldKeys = (opts?: { start?: string; stop?: string; deviceNo?: string; carType?: string; }) =>
  listFieldKeys({ measurement: MEASUREMENTS.GPS, ...opts });

export async function listAllMeasurementFields(opts?: { start?: string; stop?: string; deviceNo?: string; carType?: string; }) {
  const [bms, gps] = await Promise.all([
    listBmsFieldKeys(opts),
    listGpsFieldKeys(opts),
  ]);
  return { bms, gps };
}

// RSC 캐시 + 디스크 스냅샷이 적용된 listAllMeasurementFieldsCached
export const listAllMeasurementFieldsCached = (opts?: { start?: string; stop?: string; deviceNo?: string; carType?: string; }) => {
  const cacheKey = `fields:${opts?.start || START_TIME}:${opts?.stop || END_TIME}:${opts?.deviceNo || 'all'}:${opts?.carType || 'all'}`;
  
  return unstable_cache(
    async () => {
      // 1. 디스크 스냅샷 확인
      const snap = await readSnap<{ bms: string[]; gps: string[] }>(SNAP.fields);
      if (snap) {
        console.log('[SNAP HIT] all-fields');
        return snap;
      }
      
      // 2. 스냅샷이 없으면 실제 데이터 가져오기
      console.log('[SNAP MISS] all-fields - fetching from InfluxDB...');
      const data = await listAllMeasurementFields(opts);
      
      // 3. 스냅샷 저장 (await로 저장 완료 보장)
      await writeSnap(SNAP.fields, data);
      
      return data;
    },
    [cacheKey],
    {
      revalidate: 3600, // 1시간
      tags: ['fields'],
    }
  )();
};

/** 차종별로 기간 내 관측된 `_field`(distinct) 개수 계산 */
export async function fetchFieldCountsByCarType() {
  const distinctFields = async (measurement: string, carType: string) => {
    let flux = buildBaseRangeFlux({ measurement, start: START_TIME, stop: END_TIME });
    flux = addTagEquals(flux, TAGS.CAR_TYPE, carType);
    flux = `${flux}
|> keep(columns: ["_field"])
|> distinct(column: "_field")
|> keep(columns: ["_field"])
|> sort(columns: ["_field"])
`;
    const rows = await queryInflux<{ _field: string }>(flux, r => ({ _field: String(r._field) }));
    return rows.map(r => r._field);
  };

  const out: Record<string, { bms: number; gps: number }> = {};
  await Promise.all(
    CAR_TYPES.map(async (ct) => {
      const [bmsList, gpsList] = await Promise.all([
        distinctFields(MEASUREMENTS.BMS, ct),
        distinctFields(MEASUREMENTS.GPS, ct),
      ]);
      out[ct] = { bms: bmsList.length, gps: gpsList.length };
    })
  );
  return out;
}

// RSC 캐시 + 디스크 스냅샷이 적용된 fetchFieldCountsByCarTypeCached
export const fetchFieldCountsByCarTypeCached = unstable_cache(
  async () => {
    // 1. 디스크 스냅샷 확인
    const snap = await readSnap<Record<string, { bms: number; gps: number }>>(SNAP.perType);
    if (snap) {
      console.log('[SNAP HIT] field-counts-by-type');
      return snap;
    }
    
    // 2. 스냅샷이 없으면 실제 데이터 가져오기
    console.log('[SNAP MISS] field-counts-by-type - fetching from InfluxDB...');
    const data = await fetchFieldCountsByCarType();
    
    // 3. 스냅샷 저장 (await로 저장 완료 보장)
    await writeSnap(SNAP.perType, data);
    
    return data;
  },
  ['field-counts-by-type'],
  {
    revalidate: 3600, // 1시간
    tags: ['fields-per-type'],
  }
);

/* -------------------- 월별 평균 SOC -------------------- */
export async function fetchMonthlyAvgSoc(deviceNo: string) {
  const START = "2022-12-01T00:00:00+09:00";
  const STOP  = "2023-09-01T00:00:00+09:00"; // 9/1 exclusive => 8월 말까지 포함

  const flux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: time(v: ${JSON.stringify(START)}), stop: time(v: ${JSON.stringify(STOP)}))
|> filter(fn: (r) => r["_measurement"] == ${JSON.stringify(MEASUREMENTS.BMS)})
|> filter(fn: (r) => r["_field"] == ${JSON.stringify(FIELDS.SOC)})
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(deviceNo)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 1mo, fn: mean, createEmpty: true)
|> keep(columns: ["_time","_value"])
|> yield(name: "soc_monthly_mean")
`;

  const rows = await queryInflux(flux, (r) => ({
    time: r._time as string,
    // createEmpty:true 이면 값이 null일 수 있으니 숫자화 실패 시 null로 둠
    avg_soc: Number.isFinite(Number(r._value)) ? Number(r._value) : null
  }));

  // 시간순 정렬
  rows.sort((a, b) => a.time.localeCompare(b.time));
  return rows as Array<{ time: string; avg_soc: number | null }>;
}

/* -------------------- (옵션) 상태 파이차트용 집계 -------------------- */
export async function fetchModeMinutes(
  deviceNo: string,
  opts?: { start?: string; stop?: string }
): Promise<{
  gps: { park: number; low: number; high: number; total: number };
  bms: { idle: number; chg_slow: number; chg_fast: number; discharged: number; total: number };
}> {
  const start = opts?.start ?? START_TIME;
  const stop  = opts?.stop  ?? END_TIME;

  // ---- 1) GPS: 1분 창으로 speed 집계 ----
  const gpsFlux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: time(v: ${JSON.stringify(start)}), stop: time(v: ${JSON.stringify(stop)}))
|> filter(fn: (r) => r._measurement == ${JSON.stringify(MEASUREMENTS.GPS)})
|> filter(fn: (r) => r._field == ${JSON.stringify(FIELDS.SPEED)})
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(deviceNo)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 1m, fn: mean, createEmpty: false, offset: 9h)
|> keep(columns: ["_time","_value"])
`;

  // ---- 2) BMS: 1분 창으로 전류/포트 집계 ----
  const bmsFlux = `
from(bucket: ${JSON.stringify(bucket)})
|> range(start: time(v: ${JSON.stringify(start)}), stop: time(v: ${JSON.stringify(stop)}))
|> filter(fn: (r) => r._measurement == ${JSON.stringify(MEASUREMENTS.BMS)})
|> filter(fn: (r) =>
  r._field == ${JSON.stringify(FIELDS.PACK_CURRENT)} or
  r._field == "fast_chrg_port_conn" or
  r._field == "slow_chrg_port_conn"
)
|> filter(fn: (r) => r[${JSON.stringify(TAGS.DEVICE_NO)}] == ${JSON.stringify(deviceNo)})
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: 1m, fn: mean, createEmpty: false, offset: 9h)
|> keep(columns: ["_time","_field","_value"])
|> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
`;

  const [gpsRows, bmsRows] = await Promise.all([
    queryInflux<{ _time: string; _value: number }>(gpsFlux, r => ({ _time: String(r._time), _value: Number(r._value) })),
    queryInflux<Record<string, any>>(bmsFlux, r => ({ ...r })),
  ]);

  // ---- JS에서 카테고리 분류 (분 단위 = row 개수) ----
  // GPS
  let park = 0, low = 0, high = 0;
  for (const r of gpsRows) {
    const v = Number(r._value) || 0;
    if (v <= 1) park++;
    else if (v < 30) low++;
    else high++;
  }
  const gps = { park, low, high, total: park + low + high };

  // BMS
  let idle = 0, chg_slow = 0, chg_fast = 0, discharged = 0;
  for (const r of bmsRows) {
    const I = Number(r[FIELDS.PACK_CURRENT]) || 0;
    const fast = Number(r['fast_chrg_port_conn']) || 0;
    const slow = Number(r['slow_chrg_port_conn']) || 0;

    if (I < -0.5) discharged++;
    else if (fast > 0 && I > 0.5) chg_fast++;
    else if (slow > 0 && I > 0.5) chg_slow++;
    else if (Math.abs(I) <= 0.5) idle++;
    else idle++; // 분류되지 않은 잔여치도 idle로
  }
  const bms = { idle, chg_slow, chg_fast, discharged, total: idle + chg_slow + chg_fast + discharged };

  return { gps, bms };
}

/* -------------------- 🔹 샘플링 간격(데이터 발생 주기) 통계 -------------------- */
export type IntervalStats = {
  count: number;
  min_s: number;
  p50_s: number;
  p95_s: number;
  max_s: number;
};

function calcStats(values: number[]): IntervalStats {
  if (!values.length) return { count: 0, min_s: 0, p50_s: 0, p95_s: 0, max_s: 0 };
  const arr = values.slice().sort((a,b)=>a-b);
  const n = arr.length;
  const q = (p:number)=> arr[Math.min(n-1, Math.max(0, Math.floor(p*(n-1))))];
  return {
    count: n,
    min_s: arr[0],
    p50_s: q(0.5),
    p95_s: q(0.95),
    max_s: arr[n-1],
  };
}

/** (글로벌) 디바이스 경계만 끊고 전체 기간에서 Δt 표본 추출 */
export async function getSamplingIntervalStats(p?: {
  bmsField?: string;
  gpsField?: string;
  start?: string;
  stop?: string;
  limitRows?: number;
}): Promise<{ bms: IntervalStats; gps: IntervalStats; }> {
  const start = p?.start ?? START_TIME;
  const stop  = p?.stop  ?? END_TIME;
  const limit = Math.max(1000, Math.min(20000, Number(p?.limitRows ?? 10000)));
  const bmsField = p?.bmsField ?? FIELDS.PACK_CURRENT;
  const gpsField = p?.gpsField ?? FIELDS.SPEED;

  const buildElapsedFlux = (measurement: string, fld: string) => {
    let f = buildBaseRangeFlux({ measurement, start, stop });
    f = addFieldFilter(f, [fld]);
    f = `${f}
|> filter(fn:(r)=> exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}])
|> elapsed(unit: 1s)
|> filter(fn:(r)=> exists r.elapsed and r.elapsed > 0)
|> keep(columns: ["elapsed"])
|> rename(columns: {elapsed: "_value"})
|> group()
|> limit(n: ${limit})
|> keep(columns: ["_value"])`;
    return f;
  };

  const [bmsRows, gpsRows] = await Promise.all([
    queryInflux<{ _value: number }>(buildElapsedFlux(MEASUREMENTS.BMS, bmsField), r=>({ _value: Number(r._value) || 0 })),
    queryInflux<{ _value: number }>(buildElapsedFlux(MEASUREMENTS.GPS, gpsField), r=>({ _value: Number(r._value) || 0 })),
  ]);

  const bmsVals = bmsRows.map(r=>r._value).filter(v=>v>0 && Number.isFinite(v));
  const gpsVals = gpsRows.map(r=>r._value).filter(v=>v>0 && Number.isFinite(v));

  return {
    bms: calcStats(bmsVals),
    gps: calcStats(gpsVals),
  };
}

/** (월별) 같은 월끼리만 Δt 계산 — date 모듈 임포트 필수! */
export async function getSamplingIntervalStatsMonthly(p?: {
  bmsField?: string;
  gpsField?: string;
  start?: string;
  stop?: string;
  limitRows?: number;
}): Promise<{ bms: IntervalStats; gps: IntervalStats; }> {
  const start = p?.start ?? START_TIME;
  const stop  = p?.stop  ?? END_TIME;
  const limit = Math.max(1000, Math.min(20000, Number(p?.limitRows ?? 10000)));
  const bmsField = p?.bmsField ?? FIELDS.PACK_CURRENT;
  const gpsField = p?.gpsField ?? FIELDS.SPEED;

  const buildElapsedFluxMonthly = (measurement: string, fld: string) => {
    // ⬇️ Flux date 패키지 임포트 추가 (중요)
    let f = `import "date"\n` + buildBaseRangeFlux({ measurement, start, stop });
    f = addFieldFilter(f, [fld]);
    f = `${f}
|> filter(fn:(r)=> exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}])
|> map(fn:(r)=> ({ r with y: date.year(t: r._time), m: date.month(t: r._time) }))
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}, "y", "m"])
|> elapsed(unit: 1s)
|> filter(fn:(r)=> exists r.elapsed and r.elapsed > 0)
|> keep(columns: ["elapsed"])
|> rename(columns: {elapsed: "_value"})
|> group()
|> limit(n: ${limit})
|> keep(columns: ["_value"])`;
    return f;
  };

  const [bmsRows, gpsRows] = await Promise.all([
    queryInflux<{ _value: number }>(buildElapsedFluxMonthly(MEASUREMENTS.BMS, bmsField), r=>({ _value: Number(r._value) || 0 })),
    queryInflux<{ _value: number }>(buildElapsedFluxMonthly(MEASUREMENTS.GPS, gpsField), r=>({ _value: Number(r._value) || 0 })),
  ]);

  const bmsVals = bmsRows.map(r=>r._value).filter(v=>v>0 && Number.isFinite(v));
  const gpsVals = gpsRows.map(r=>r._value).filter(v=>v>0 && Number.isFinite(v));

  return {
    bms: calcStats(bmsVals),
    gps: calcStats(gpsVals),
  };
}

export async function getSamplingIntervalSamplesMonthly(p?: {
  bmsField?: string;
  gpsField?: string;
  start?: string;
  stop?: string;
  limitRows?: number;
}): Promise<{ bms: number[]; gps: number[]; }> {
  const start = p?.start ?? START_TIME;
  const stop  = p?.stop  ?? END_TIME;
  const limit = Math.max(1000, Math.min(20000, Number(p?.limitRows ?? 10000)));
  const bmsField = p?.bmsField ?? FIELDS.PACK_CURRENT;
  const gpsField = p?.gpsField ?? FIELDS.SPEED;

  const buildElapsedFluxMonthly = (measurement: string, fld: string) => {
    // Flux date 모듈 임포트 필수!
    let f = `import "date"\n` + buildBaseRangeFlux({ measurement, start, stop });
    f = addFieldFilter(f, [fld]);
    f = `${f}
|> filter(fn:(r)=> exists r._value)
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}])
|> map(fn:(r)=> ({ r with y: date.year(t: r._time), m: date.month(t: r._time) }))
|> group(columns: [${JSON.stringify(TAGS.DEVICE_NO)}, "y", "m"])
|> elapsed(unit: 1s)
|> filter(fn:(r)=> exists r.elapsed and r.elapsed > 0)
|> keep(columns: ["elapsed"])
|> rename(columns: {elapsed: "_value"})
|> group()
|> limit(n: ${limit})
|> keep(columns: ["_value"])`;
    return f;
  };

  const [bmsRows, gpsRows] = await Promise.all([
    queryInflux<{ _value: number }>(buildElapsedFluxMonthly(MEASUREMENTS.BMS, bmsField), r=>({ _value: Number(r._value) || 0 })),
    queryInflux<{ _value: number }>(buildElapsedFluxMonthly(MEASUREMENTS.GPS, gpsField), r=>({ _value: Number(r._value) || 0 })),
  ]);

  const bmsVals = bmsRows.map(r=>r._value).filter(v=>v>0 && Number.isFinite(v));
  const gpsVals = gpsRows.map(r=>r._value).filter(v=>v>0 && Number.isFinite(v));

  return { bms: bmsVals, gps: gpsVals };
}


// lib/data-access.ts (파일 맨 아래에 추가)

export type OutlierSummary = {
  device_no: string;
  measurement: 'aicar_bms' | 'aicar_gps';
  field: 'pack_current' | 'speed';
  n_total: number;       // 샘플 수
  n_outlier: number;     // |z| >= zThresh
  rate: number;          // n_outlier / n_total
  mean: number;
  std: number;
};

export async function fetchOutlierSummary3Sigma(p?: {
  // 대상: BMS.pack_current, GPS.speed (고정)
  start?: string;
  stop?: string;
  // 총 샘플 상한 (두 측정 합계). 너무 크게 잡으면 느려질 수 있음.
  totalSampleCap?: number;   // default 50_000
  // 다운샘플 윈도우
  every?: string;            // default "1m"
  // 임계값 (기본 3σ)
  zThresh?: number;          // default 3
}): Promise<OutlierSummary[]> {
  const start = p?.start ?? START_TIME;
  const stop  = p?.stop  ?? END_TIME;
  const cap   = Math.max(10_000, Math.min(200_000, Number(p?.totalSampleCap ?? 50_000)));
  const every = p?.every ?? '1m';
  const zT    = Number(p?.zThresh ?? 3);

  const buildFlux = (measurement: string, field: string) => {
    // 1분 평균으로 소팅된 값을 모으고, 전체에서 cap/2 씩 제한
    let f = buildBaseRangeFlux({ measurement, start, stop });
    f = addFieldFilter(f, [field]);
    f = `${f}
|> filter(fn:(r)=>exists r._value)
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> aggregateWindow(every: ${every}, fn: mean, createEmpty: false, offset: 9h)
|> keep(columns: ["_time","_value","${TAGS.DEVICE_NO}"])
|> group()
|> sort(columns: ["_time"])
|> limit(n: ${Math.floor(cap/2)})
`;
    return f;
  };

  const [bmsRows, gpsRows] = await Promise.all([
    queryInflux<{ _time:string; _value:number; [k:string]:any }>(
      buildFlux(MEASUREMENTS.BMS, FIELDS.PACK_CURRENT),
      r=>({ _time: String(r._time), _value: Number(r._value) || 0, [TAGS.DEVICE_NO]: String(r[TAGS.DEVICE_NO]) })
    ),
    queryInflux<{ _time:string; _value:number; [k:string]:any }>(
      buildFlux(MEASUREMENTS.GPS, FIELDS.SPEED),
      r=>({ _time: String(r._time), _value: Number(r._value) || 0, [TAGS.DEVICE_NO]: String(r[TAGS.DEVICE_NO]) })
    ),
  ]);

  const calc = (rows: Array<{_value:number; [k:string]:any}>, measurement: 'aicar_bms'|'aicar_gps', field:'pack_current'|'speed'): OutlierSummary[] => {
    const byDev: Record<string, number[]> = {};
    for (const r of rows) {
      const d = String(r[TAGS.DEVICE_NO] ?? '');
      if (!d) continue;
      (byDev[d] ||= []).push(Number(r._value) || 0);
    }
    const out: OutlierSummary[] = [];
    for (const [dev, arr] of Object.entries(byDev)) {
      if (!arr.length) continue;
      const n = arr.length;
      const mean = arr.reduce((s,v)=>s+v,0)/n;
      const variance = arr.reduce((s,v)=>s + (v-mean)*(v-mean), 0) / n;
      const std = Math.sqrt(variance);
      let n_out = 0;
      if (std > 0) {
        const invStd = 1/std;
        for (const v of arr) {
          const z = Math.abs((v-mean)*invStd);
          if (z >= zT) n_out++;
        }
      }
      out.push({
        device_no: dev, measurement, field,
        n_total: n, n_outlier: n_out, rate: n ? n_out/n : 0,
        mean: Number(mean.toFixed(3)),
        std: Number(std.toFixed(3)),
      });
    }
    return out;
  };

  return [
    ...calc(bmsRows, 'aicar_bms', 'pack_current'),
    ...calc(gpsRows, 'aicar_gps', 'speed'),
  ].sort((a,b)=> b.rate - a.rate);
}

/* -------------------- 이상치(IQR) 분석용 유틸 -------------------- */
export type IqrStats = {
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  iqr: number;
  lowerFence: number; // Q1 - 1.5*IQR
  upperFence: number; // Q3 + 1.5*IQR
};

function quantile(sorted: number[], p: number) {
  const n = sorted.length;
  if (n === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[n - 1];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const h = idx - lo;
  return sorted[lo] * (1 - h) + sorted[hi] * h;
}

function calcIqr(values: number[]): IqrStats {
  if (!values.length) {
    return {
      count: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0,
      iqr: 0, lowerFence: 0, upperFence: 0,
    };
  }
  const arr = values.slice().sort((a, b) => a - b);
  const q1 = quantile(arr, 0.25);
  const q2 = quantile(arr, 0.5);
  const q3 = quantile(arr, 0.75);
  const iqr = q3 - q1;
  return {
    count: arr.length,
    min: arr[0],
    q1,
    median: q2,
    q3,
    max: arr[arr.length - 1],
    iqr,
    lowerFence: q1 - 1.5 * iqr,
    upperFence: q3 + 1.5 * iqr,
  };
}

/** 한 디바이스의 특정 필드 값 샘플 가져오기 (기간: START_TIME~END_TIME, 최대 limit개) */
export async function fetchFieldSamplesForDevice(p: {
  measurement: string;
  field: string;
  deviceNo: string;
  start?: string;
  stop?: string;
  limit?: number; // 최대 행 수 (기본 5000)
}): Promise<number[]> {
  const start = p.start ?? START_TIME;
  const stop  = p.stop  ?? END_TIME;
  const limit = Math.max(100, Math.min(20000, Number(p.limit ?? 5000)));

  let flux = buildBaseRangeFlux({ measurement: p.measurement, start, stop });
  flux = addFieldFilter(flux, [p.field]);
  flux = addTagEquals(flux, TAGS.DEVICE_NO, p.deviceNo);
  flux = `${flux}
|> filter(fn:(r)=> exists r._value)
|> map(fn:(r)=>({ r with _value: float(v:r._value) }))
|> keep(columns: ["_value"])
|> limit(n: ${limit})
`;

  const rows = await queryInflux<{ _value: number }>(flux, r => ({ _value: Number(r._value) || 0 }));
  return rows.map(r => r._value).filter(v => Number.isFinite(v));
}

/** 디바이스 단일 페이지용: BMS(pack_current) & GPS(speed) IQR 통계 반환 */
export async function getIqrStatsForDevice(deviceNo: string, opts?: {
  start?: string; stop?: string; limit?: number;
  bmsField?: string; gpsField?: string;
}) {
  const bmsField = opts?.bmsField ?? FIELDS.PACK_CURRENT;
  const gpsField = opts?.gpsField ?? FIELDS.SPEED;

  const [bmsVals, gpsVals] = await Promise.all([
    fetchFieldSamplesForDevice({
      measurement: MEASUREMENTS.BMS, field: bmsField, deviceNo,
      start: opts?.start, stop: opts?.stop, limit: opts?.limit,
    }),
    fetchFieldSamplesForDevice({
      measurement: MEASUREMENTS.GPS, field: gpsField, deviceNo,
      start: opts?.start, stop: opts?.stop, limit: opts?.limit,
    }),
  ]);

  return {
    bmsField,
    gpsField,
    bms: calcIqr(bmsVals),
    gps: calcIqr(gpsVals),
  };
}
/* --- 아래 두 함수만 추가하면 됩니다. (파일 맨 아래쪽 편한 곳) --- */

export type MonthlyCount = {
  device_no: string;
  month_end: string;   // 월 윈도우 끝(KST)
  count: number;       // 해당 월 수집 건수
};

export async function fetchMonthlyCountsByDevice(p: {
  measurement: string;      // MEASUREMENTS.BMS or MEASUREMENTS.GPS
  field: string;            // 대표 필드: BMS=pack_current, GPS=speed 등
  start?: string;           // 기본 START_TIME
  stop?: string;            // 기본 END_TIME
}): Promise<MonthlyCount[]> {
  const start = p.start ?? START_TIME;
  const stop  = p.stop  ?? END_TIME;

  // 월별 카운트: 1달 창으로 count() (KST offset 9h)
  let flux = buildBaseRangeFlux({ measurement: p.measurement, start, stop });
  flux = addFieldFilter(flux, [p.field]);
  flux = `${flux}
|> filter(fn:(r)=> exists r._value)
|> group(columns:["${TAGS.DEVICE_NO}"])
|> aggregateWindow(every: 1mo, fn: count, createEmpty: true, offset: 9h)
|> keep(columns: ["${TAGS.DEVICE_NO}","_time","_value"])
|> rename(columns: {_value: "count", ${JSON.stringify(TAGS.DEVICE_NO)}: "device_no"})
`;

  const rows = await queryInflux(flux, (r:any)=>({
    device_no: String(r.device_no),
    month_end: String(r._time),   // 윈도우 끝(월 말+offset)
    count: Number(r.count) || 0,
  }));

  // 정렬
  rows.sort((a,b)=> a.device_no.localeCompare(b.device_no) || a.month_end.localeCompare(b.month_end));
  return rows as MonthlyCount[];
}

export type LongGap = {
  device_no: string;
  start: string;     // gap 시작측 타임스탬프(앞 레코드 시간)
  end: string;       // gap 끝측 타임스탬프(뒤 레코드 시간)
  gap_sec: number;   // 차이(초)
};

export async function fetchLongGaps(p: {
  measurement: string;   // MEASUREMENTS.BMS or MEASUREMENTS.GPS
  field: string;         // BMS=pack_current, GPS=speed 등
  deviceNo?: string;     // 없으면 전체 디바이스
  minGapSec?: number;    // 임계값(초) 이상만 긴 공백으로 간주 (기본 600s=10분)
  start?: string; stop?: string;
  limitPerDevice?: number; // 장치별 상위 n개만 가져오기
}): Promise<LongGap[]> {
  const start = p.start ?? START_TIME;
  const stop  = p.stop  ?? END_TIME;
  const minGap = Math.max(1, Number(p.minGapSec ?? 600));
  const limitPerDevice = Math.max(1, Math.min(500, Number(p.limitPerDevice ?? 50)));

  let flux = buildBaseRangeFlux({ measurement: p.measurement, start, stop });
  flux = addFieldFilter(flux, [p.field]);
  if (p.deviceNo) flux = addTagEquals(flux, TAGS.DEVICE_NO, p.deviceNo);

  // 같은 디바이스 안에서 Δt(초) 계산 후 minGapSec 이상만 남김
  flux = `${flux}
|> filter(fn:(r)=> exists r._value)
|> group(columns:["${TAGS.DEVICE_NO}"])
|> elapsed(unit: 1s)
|> filter(fn:(r)=> exists r.elapsed and r.elapsed > ${minGap})
|> keep(columns: ["${TAGS.DEVICE_NO}","_time","elapsed"])
|> rename(columns: {elapsed: "gap_sec", ${JSON.stringify(TAGS.DEVICE_NO)}: "device_no"})
|> sort(columns: ["device_no","_time"], desc: true)
|> group(columns: ["device_no"])
|> limit(n: ${limitPerDevice})
`;

  // 주의: elapsed의 _time은 "뒤 레코드 시간"이므로 gap 시작은 end - gap_sec
  const rows = await queryInflux(flux, (r:any)=>({
    device_no: String(r.device_no),
    end: String(r._time),
    gap_sec: Number(r.gap_sec) || 0,
  }));

  return (rows as any[]).map(r=>{
    const endTs = new Date(r.end).getTime();
    const startTs = isFinite(endTs) ? endTs - r.gap_sec*1000 : NaN;
    return {
      device_no: r.device_no,
      start: isFinite(startTs) ? new Date(startTs).toISOString() : r.end,
      end: r.end,
      gap_sec: r.gap_sec,
    } as LongGap;
  });
}
