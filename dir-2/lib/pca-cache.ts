import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stat } from 'node:fs/promises';

// 전역 PCA 캐시 (서버 전체에서 공유)
let pcaFullCache: {
  data: any;
  timestamp: number;
  etag: string;
} | null = null;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

/**
 * 파일의 해시 기반 ETag 생성
 */
function generateETag(data: string): string {
  // 간단한 해시 함수 (실제로는 crypto 사용 가능)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

/**
 * PCA 전체 데이터를 메모리 캐시에서 가져오기
 */
export function getPcaFullCache(): { data: any; etag: string } | null {
  if (pcaFullCache && (Date.now() - pcaFullCache.timestamp) < CACHE_TTL_MS) {
    return { data: pcaFullCache.data, etag: pcaFullCache.etag };
  }
  return null;
}

/**
 * PCA 전체 데이터를 메모리 캐시에 저장
 */
export function setPcaFullCache(data: any, etag: string): void {
  pcaFullCache = {
    data,
    timestamp: Date.now(),
    etag,
  };
}

/**
 * 파일에서 PCA 전체 데이터 로드 (캐시 우선)
 */
export async function loadPcaFull(): Promise<{ data: any; etag: string } | null> {
  // 1. 메모리 캐시 확인
  const cached = getPcaFullCache();
  if (cached) {
    return cached;
  }

  // 2. 파일에서 로드
  const filePath = path.join(process.cwd(), 'pca_full.json');
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    const etag = generateETag(fileContent);
    
    // 메모리 캐시에 저장
    setPcaFullCache(data, etag);
    
    return { data, etag };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn('[pca-cache] pca_full.json not found. Run scripts/generate_pca_full.py first.');
    } else {
      console.error('[pca-cache] Failed to load pca_full.json:', error.message);
    }
    return null;
  }
}

/**
 * 파일이 존재하고 최신인지 확인
 */
export async function checkPcaFullFile(): Promise<{ exists: boolean; mtime: number }> {
  const filePath = path.join(process.cwd(), 'pca_full.json');
  try {
    const stats = await stat(filePath);
    return { exists: true, mtime: stats.mtimeMs };
  } catch {
    return { exists: false, mtime: 0 };
  }
}

/**
 * 메모리 캐시 무효화
 */
export function clearPcaCache(): void {
  pcaFullCache = null;
}

