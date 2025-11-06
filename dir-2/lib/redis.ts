/* eslint-disable @typescript-eslint/no-explicit-any */
try {
  if (process.env.NEXT_RUNTIME) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('server-only');
  }
} catch {
  /* no-op for worker/cli */
}import { createClient, RedisClientType } from 'redis';

const REDIS_URL = process.env.REDIS_URL || '';
const PREFIX = process.env.REDIS_PREFIX || 'dash';

let client: RedisClientType | null = null;
function r(): RedisClientType | null {
  if (!REDIS_URL) return null;
  if (!client) {
    client = createClient({ url: REDIS_URL });
    client.on('error', (e) => console.error('[redis] error', e));
    client.connect().catch((e) => console.error('[redis] connect error', e));
  }
  return client;
}

export const rkey = {
  rankDistance: (periodEndISO: string) => `${PREFIX}:rank:distance:${periodEndISO}`,
  rankSoh:      (periodEndISO: string) => `${PREFIX}:rank:soh:${periodEndISO}`,
};

export async function cacheRankingDistanceZSet(params: {
  periodEndISO: string; rows: { device_no: string; km_total: number }[]; ttlSec?: number;
}) {
  const c = r(); if (!c) return;
  const key = rkey.rankDistance(params.periodEndISO);
  const items = params.rows.map(({ device_no, km_total }) => ({ score: km_total, value: device_no }));
  await c.del(key);
  if (items.length) await (c as any).zAdd(key, items);
  if (params.ttlSec) await c.expire(key, params.ttlSec);
}

export async function readRankingDistanceFromCache(params: { periodEndISO: string; limit?: number }) {
  const c = r(); if (!c) return null;
  const key = rkey.rankDistance(params.periodEndISO);
  const limit = Math.max(1, Math.min(1000, Number(params.limit ?? 50)));
  const arr = await (c as any).zRangeWithScores(key, 0, limit - 1, { REV: true });
  if (!arr?.length) return null;
  return arr.map((m: any) => ({ device_no: m.value, km_total: Number(m.score) }));
}

export async function cacheRankingSohZSet(params: {
  periodEndISO: string; rows: { device_no: string; avg_soh: number }[]; ttlSec?: number;
}) {
  const c = r(); if (!c) return;
  const key = rkey.rankSoh(params.periodEndISO);
  const items = params.rows.map(({ device_no, avg_soh }) => ({ score: avg_soh, value: device_no }));
  await c.del(key);
  if (items.length) await (c as any).zAdd(key, items);
  if (params.ttlSec) await c.expire(key, params.ttlSec);
}

export async function readRankingSohFromCache(params: { periodEndISO: string; limit?: number }) {
  const c = r(); if (!c) return null;
  const key = rkey.rankSoh(params.periodEndISO);
  const limit = Math.max(1, Math.min(1000, Number(params.limit ?? 50)));
  const arr = await (c as any).zRangeWithScores(key, 0, limit - 1, { REV: true });
  if (!arr?.length) return null;
  return arr.map((m: any) => ({ device_no: m.value, avg_soh: Number(m.score) }));
}
