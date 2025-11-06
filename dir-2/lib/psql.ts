/* eslint-disable @typescript-eslint/no-explicit-any */
try {
  if (process.env.NEXT_RUNTIME) {
    // Next.js Server Components에서만 로드되도록
    require('server-only');
  }
} catch {}

import pg from 'pg';
const { Pool } = pg;

// ---------- Pool ----------
export const pgPool = new Pool({
  connectionString: process.env.PG_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

// ---------- Query Helper ----------
export async function pgQuery<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const client = await pgPool.connect();
  try {
    const res = await client.query(text, params);
    return { rows: res.rows as T[] };
  } finally {
    client.release();
  }
}

// ---------- Schema Bootstrap (idempotent) ----------
/**
 * 랭킹 집계에 필요한 테이블/인덱스를 보장 (distance + soh).
 * 여러 번 호출해도 안전(idempotent).
 */
export async function ensureTables(): Promise<void> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 거리 랭킹
    await client.query(`
      CREATE TABLE IF NOT EXISTS ranking_distance (
        period       TEXT              NOT NULL,
        device       TEXT              NOT NULL,
        distance_km  DOUBLE PRECISION  NOT NULL,
        computed_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        PRIMARY KEY (period, device)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ranking_distance_period_km_desc
      ON ranking_distance (period, distance_km DESC)
    `);

    // SOH 랭킹
    await client.query(`
      CREATE TABLE IF NOT EXISTS ranking_soh (
        period       TEXT              NOT NULL,
        device       TEXT              NOT NULL,
        avg_soh      DOUBLE PRECISION  NOT NULL,
        computed_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        PRIMARY KEY (period, device)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ranking_soh_period_avg_desc
      ON ranking_soh (period, avg_soh DESC)
    `);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ---------- Upserts ----------
/** distance 랭킹 업서트 */
export async function upsertRankingDistance(
  period: string,
  rows: Array<{ device: string; distance_km: number }>
): Promise<void> {
  if (!rows?.length) return;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const valuesSql = rows
      .map((_, i) => `($${i * 3 + 1}::text, $${i * 3 + 2}::text, $${i * 3 + 3}::double precision)`)
      .join(', ');

    const params: any[] = [];
    for (const r of rows) params.push(period, r.device, r.distance_km);

    await client.query(
      `
      INSERT INTO ranking_distance (period, device, distance_km)
      VALUES ${valuesSql}
      ON CONFLICT (period, device)
      DO UPDATE SET
        distance_km = EXCLUDED.distance_km,
        computed_at = NOW()
      `,
      params
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** SOH 랭킹 업서트 */
export async function upsertRankingSoh(
  period: string,
  rows: Array<{ device: string; avg_soh: number }>
): Promise<void> {
  if (!rows?.length) return;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const valuesSql = rows
      .map((_, i) => `($${i * 3 + 1}::text, $${i * 3 + 2}::text, $${i * 3 + 3}::double precision)`)
      .join(', ');

    const params: any[] = [];
    for (const r of rows) params.push(period, r.device, r.avg_soh);

    await client.query(
      `
      INSERT INTO ranking_soh (period, device, avg_soh)
      VALUES ${valuesSql}
      ON CONFLICT (period, device)
      DO UPDATE SET
        avg_soh = EXCLUDED.avg_soh,
        computed_at = NOW()
      `,
      params
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
