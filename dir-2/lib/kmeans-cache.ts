import 'server-only';

// 전역 메모리 캐시 (서버 전체에서 공유)
export const kmeansMemoryCache = new Map<number, { data: any; timestamp: number }>();
export const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

export function getCachedResult(k: number) {
  const cached = kmeansMemoryCache.get(k);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

export function setCachedResult(k: number, data: any) {
  kmeansMemoryCache.set(k, { data, timestamp: Date.now() });
}

