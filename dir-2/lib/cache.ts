/* eslint-disable @typescript-eslint/no-explicit-any */
try {
  if (process.env.NEXT_RUNTIME) {
    require('server-only');
  }
} catch {
  // no-op (worker/cli)
}
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cfg } from './config';

type Entry = { v: unknown; exp: number };
const mem = new Map<string, Entry>();
const now = () => Math.floor(Date.now() / 1000);
const hash = (k: string) => crypto.createHash('sha1').update(k).digest('hex');
const filePath = (k: string) => path.resolve(`${cfg.CACHE_PATH}.${hash(k)}.json`);

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!cfg.CACHE_ENABLED) return null;
  // 메모리 캐시 우선 확인 (동기, 빠름)
  const e = mem.get(key);
  if (e && e.exp >= now()) return e.v as T;
  // 파일 캐시 확인 (비동기, 느리지만 영구 저장)
  try {
    const p = filePath(key);
    // existsSync 대신 직접 읽기 시도 (race condition 방지)
    try {
      const raw = await fs.readFile(p, 'utf8');
      const obj = JSON.parse(raw) as Entry;
      if (obj.exp >= now()) { 
        mem.set(key, obj); // 메모리에도 캐시
        return obj.v as T; 
      }
    } catch (readErr) {
      // 파일이 없거나 읽기 실패 시 무시
    }
  } catch {}
  return null;
}

export async function cacheSet<T>(key: string, v: T, ttl: number) {
  if (!cfg.CACHE_ENABLED) return;
  const e: Entry = { v, exp: now() + ttl };
  // 메모리 캐시 먼저 업데이트 (즉시 반영)
  mem.set(key, e);
  // 파일 캐시는 비동기로 백그라운드 저장 (논블로킹)
  fs.writeFile(filePath(key), JSON.stringify(e), 'utf8').catch(() => {
    // 파일 쓰기 실패는 무시 (메모리 캐시는 유지됨)
  });
}

export async function cacheWrap<T>(key: string, ttl: number, fn: () => Promise<T>) {
  const c = await cacheGet<T>(key);
  if (c != null) return c;
  const v = await fn();
  await cacheSet(key, v, ttl);
  return v;
}

export const cacheWrapHeavy = <T>(key: string, fn: () => Promise<T>) =>
  cacheWrap(key, cfg.CACHE_TTL_HEAVY, fn);
